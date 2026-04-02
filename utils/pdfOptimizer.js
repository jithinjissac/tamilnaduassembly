import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PDFDocument } from 'pdf-lib';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

function toBytes(input) {
    return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function pctSaved(before, after) {
    if (!before || after >= before) return '0.00';
    return (((before - after) / before) * 100).toFixed(2);
}

async function runCommand(binary, args, timeoutMs = 180000) {
    await execFileAsync(binary, args, {
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024
    });
}

async function optimizeWithQpdf(inputBytes) {
    const tempId = randomUUID();
    const inPath = path.join(os.tmpdir(), `pdf-opt-in-${tempId}.pdf`);
    const outPath = path.join(os.tmpdir(), `pdf-opt-out-${tempId}.pdf`);
    const candidates = process.platform === 'win32'
        ? [
            'qpdf.exe',
            'qpdf',
            'C:/Program Files/qpdf/bin/qpdf.exe',
            ...findWindowsQpdfCandidates()
        ]
        : ['qpdf'];

    try {
        fs.writeFileSync(inPath, inputBytes);
        for (const cmd of candidates) {
            try {
                await runCommand(cmd, [
                    '--stream-data=compress',
                    '--recompress-flate',
                    '--compression-level=9',
                    '--object-streams=generate',
                    inPath,
                    outPath
                ]);
                if (fs.existsSync(outPath)) {
                    return fs.readFileSync(outPath);
                }
            } catch (_) {
                // Try next candidate binary.
            }
        }
        return null;
    } finally {
        try { if (fs.existsSync(inPath)) fs.unlinkSync(inPath); } catch (_) {}
        try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
    }
}

function findWindowsQpdfCandidates() {
    if (process.platform !== 'win32') return [];

    const programFiles = process.env.ProgramFiles || 'C:/Program Files';
    try {
        const entries = fs.readdirSync(programFiles, { withFileTypes: true });
        return entries
            .filter(entry => entry.isDirectory() && /^qpdf/i.test(entry.name))
            .map(entry => path.join(programFiles, entry.name, 'bin', 'qpdf.exe').replace(/\\/g, '/'))
            .filter(candidate => fs.existsSync(candidate));
    } catch (_) {
        return [];
    }
}

async function optimizeWithGhostscriptLossless(inputBytes) {
    const tempId = randomUUID();
    const inPath = path.join(os.tmpdir(), `pdf-gs-in-${tempId}.pdf`);
    const outPath = path.join(os.tmpdir(), `pdf-gs-out-${tempId}.pdf`);
    const candidates = process.platform === 'win32'
        ? ['gswin64c.exe', 'gswin32c.exe', 'gs']
        : ['gs'];

    try {
        fs.writeFileSync(inPath, inputBytes);
        for (const cmd of candidates) {
            try {
                await runCommand(cmd, [
                    '-sDEVICE=pdfwrite',
                    '-dCompatibilityLevel=1.7',
                    '-dNOPAUSE',
                    '-dBATCH',
                    '-dQUIET',
                    '-dDetectDuplicateImages=true',
                    '-dCompressFonts=true',
                    '-dSubsetFonts=true',
                    '-dAutoFilterColorImages=false',
                    '-dAutoFilterGrayImages=false',
                    '-dColorImageFilter=/FlateEncode',
                    '-dGrayImageFilter=/FlateEncode',
                    '-dMonoImageFilter=/CCITTFaxEncode',
                    '-dDownsampleColorImages=false',
                    '-dDownsampleGrayImages=false',
                    '-dDownsampleMonoImages=false',
                    `-sOutputFile=${outPath}`,
                    inPath
                ]);
                if (fs.existsSync(outPath)) {
                    return fs.readFileSync(outPath);
                }
            } catch (_) {
                // Try next candidate binary.
            }
        }
        return null;
    } finally {
        try { if (fs.existsSync(inPath)) fs.unlinkSync(inPath); } catch (_) {}
        try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
    }
}

async function optimizeWithPdfLib(inputBytes) {
    const pdfDoc = await PDFDocument.load(inputBytes, {
        updateMetadata: false,
        ignoreEncryption: true
    });

    return pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 500
    });
}

async function optimizeWithApdf(fileUrl, contextLabel = 'pdf') {
    const token = process.env.APDF_API_TOKEN || process.env.APDF_API_KEY || '';
    if (!token || !fileUrl) {
        return null;
    }

    const baseUrl = (process.env.APDF_API_BASE_URL || 'https://apdf.io/api').replace(/\/$/, '');
    const endpoint = `${baseUrl}/pdf/file/compress`;

    try {
        const body = new URLSearchParams({ file: fileUrl });
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`aPDF compress failed with status ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
        }

        const payload = await response.json();
        const compressedUrl = payload?.file;
        if (!compressedUrl) {
            throw new Error('aPDF response missing compressed file URL');
        }

        const fileResp = await fetch(compressedUrl, { method: 'GET' });
        if (!fileResp.ok) {
            throw new Error(`failed to download compressed PDF (${fileResp.status})`);
        }

        const buf = new Uint8Array(await fileResp.arrayBuffer());
        logger.info(`✅ aPDF compression completed (${contextLabel})`);
        return buf;
    } catch (err) {
        logger.warn(`⚠️ aPDF compression skipped (${contextLabel}): ${err.message}`);
        return null;
    }
}

/**
 * Multi-strategy lossless PDF optimization.
 * Tries strong external optimizers first, then falls back to pdf-lib.
 */
export async function optimizePdfLossless(pdfBytes, contextLabel = 'pdf', options = {}) {
    const original = toBytes(pdfBytes);
    let best = original;
    let bestMethod = 'original';
    const skipLocal = options?.skipLocal === true;

    if (!skipLocal) {
        // Prefer qpdf as the primary lossless optimizer.
        try {
            const qpdfCandidate = await optimizeWithQpdf(original);
            if (qpdfCandidate && qpdfCandidate.length < original.length) {
                const qpdfBytes = toBytes(qpdfCandidate);
                const savedBytes = original.length - qpdfBytes.length;
                logger.info(
                    `✅ Lossless PDF optimized (${contextLabel}) via qpdf: ` +
                    `-${savedBytes} bytes (${pctSaved(original.length, qpdfBytes.length)}%)`
                );
                return qpdfBytes;
            }

            if (qpdfCandidate) {
                logger.info(`ℹ️ qpdf ran but gave no size reduction (${contextLabel})`);
            } else {
                logger.info(`ℹ️ qpdf not available for this environment (${contextLabel}), trying fallback optimizers`);
            }
        } catch (err) {
            logger.warn(`⚠️ qpdf optimization failed (${contextLabel}): ${err.message}`);
        }

        const strategies = [
            { name: 'ghostscript-lossless', fn: optimizeWithGhostscriptLossless },
            { name: 'pdf-lib', fn: optimizeWithPdfLib }
        ];

        for (const strategy of strategies) {
            try {
                const candidate = await strategy.fn(original);
                if (candidate && candidate.length < best.length) {
                    best = toBytes(candidate);
                    bestMethod = strategy.name;
                }
            } catch (err) {
                logger.warn(`⚠️ PDF optimizer ${strategy.name} skipped (${contextLabel}): ${err.message}`);
            }
        }

        if (best.length < original.length) {
            const savedBytes = original.length - best.length;
            logger.info(
                `✅ Lossless PDF optimized (${contextLabel}) via ${bestMethod}: ` +
                `-${savedBytes} bytes (${pctSaved(original.length, best.length)}%)`
            );
        } else {
            logger.info(`ℹ️ Lossless optimization kept original (${contextLabel}): no smaller output`);
        }
    }

    const apdfSourceUrl = options?.apdfSourceUrl || '';
    if (apdfSourceUrl) {
        const apdfCandidate = await optimizeWithApdf(apdfSourceUrl, contextLabel);
        if (apdfCandidate && apdfCandidate.length < best.length) {
            const savedBytes = best.length - apdfCandidate.length;
            logger.info(
                `✅ PDF optimized (${contextLabel}) via aPDF: ` +
                `-${savedBytes} bytes (${pctSaved(best.length, apdfCandidate.length)}%) beyond local optimization`
            );
            return apdfCandidate;
        }
        if (apdfCandidate) {
            logger.info(`ℹ️ aPDF returned no additional reduction (${contextLabel})`);
        }
    }

    return best;
}
