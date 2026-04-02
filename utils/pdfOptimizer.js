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

async function optimizeWithILovePdf(fileUrl, contextLabel = 'pdf', compressionLevelOverride = null) {
    const baseUrl = (process.env.ILOVEPDF_API_BASE_URL || 'https://api.ilovepdf.com/v1').replace(/\/$/, '');
    const publicKey = (process.env.ILOVEPDF_PUBLIC_KEY || '').trim();
    const staticToken = (process.env.ILOVEPDF_TOKEN || '').trim();
    const region = (process.env.ILOVEPDF_REGION || '').trim();
    const compressionLevel = (compressionLevelOverride || process.env.ILOVEPDF_COMPRESSION_LEVEL || 'recommended').trim();
    const allowedLevels = new Set(['extreme', 'recommended', 'low']);
    const normalizedLevel = allowedLevels.has(compressionLevel) ? compressionLevel : 'recommended';

    if ((!publicKey && !staticToken) || !fileUrl) {
        return null;
    }

    const fetchWithRetry = async (url, init, retries = 2, timeoutMs = 25000) => {
        let lastErr = null;
        for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch(url, {
                    ...init,
                    signal: controller.signal
                });
                clearTimeout(t);
                return response;
            } catch (err) {
                clearTimeout(t);
                lastErr = err;
                if (attempt <= retries) {
                    await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
                    continue;
                }
            }
        }
        throw lastErr;
    };

    try {
        let token = staticToken;
        if (!token) {
            const authBody = new URLSearchParams({ public_key: publicKey });
            const authResp = await fetchWithRetry(`${baseUrl}/auth`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: authBody
            }, 2, 30000);
            if (!authResp.ok) {
                const text = await authResp.text().catch(() => '');
                throw new Error(`iLovePDF auth failed with status ${authResp.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
            }
            const authJson = await authResp.json();
            token = authJson?.token || '';
            if (!token) {
                throw new Error('iLovePDF auth response missing token');
            }
        }

        const startPath = region ? `/start/compress/${encodeURIComponent(region)}` : '/start/compress';
        const startResp = await fetchWithRetry(`${baseUrl}${startPath}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json'
            }
        }, 2, 30000);
        if (!startResp.ok) {
            const text = await startResp.text().catch(() => '');
            throw new Error(`iLovePDF start failed with status ${startResp.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
        }
        const startJson = await startResp.json();
        const server = startJson?.server;
        const task = startJson?.task;
        if (!server || !task) {
            throw new Error('iLovePDF start response missing server/task');
        }

        const uploadBody = new URLSearchParams({
            task,
            cloud_file: fileUrl
        });
        const uploadResp = await fetchWithRetry(`https://${server}/v1/upload`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: uploadBody
        }, 2, 30000);
        if (!uploadResp.ok) {
            const text = await uploadResp.text().catch(() => '');
            throw new Error(`iLovePDF upload failed with status ${uploadResp.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
        }
        const uploadJson = await uploadResp.json();
        const serverFilename = uploadJson?.server_filename;
        if (!serverFilename) {
            throw new Error('iLovePDF upload response missing server_filename');
        }

        const processPayload = {
            task,
            tool: 'compress',
            files: [{
                server_filename: serverFilename,
                filename: 'input.pdf'
            }],
            compression_level: normalizedLevel
        };
        const processResp = await fetchWithRetry(`https://${server}/v1/process`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(processPayload)
        }, 2, 120000);
        if (!processResp.ok) {
            const text = await processResp.text().catch(() => '');
            throw new Error(`iLovePDF process failed with status ${processResp.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
        }

        const fileResp = await fetchWithRetry(`https://${server}/v1/download/${task}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`
            }
        }, 2, 120000);
        if (!fileResp.ok) {
            throw new Error(`failed to download iLovePDF output (${fileResp.status})`);
        }

        const buf = toBytes(await fileResp.arrayBuffer());
        logger.info(`✅ iLovePDF compression completed (${contextLabel})`);
        return buf;
    } catch (err) {
        const errDetails = err?.cause?.message || err?.code || err?.message || String(err);
        logger.warn(`⚠️ iLovePDF compression skipped (${contextLabel}): ${errDetails}`);
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

    const remoteSourceUrl = options?.remoteSourceUrl || options?.apdfSourceUrl || '';
    if (remoteSourceUrl) {
        const remoteCandidate = await optimizeWithILovePdf(remoteSourceUrl, contextLabel, options?.ilovepdfCompressionLevel || null);
        if (remoteCandidate && remoteCandidate.length < best.length) {
            const savedBytes = best.length - remoteCandidate.length;
            logger.info(
                `✅ PDF optimized (${contextLabel}) via iLovePDF: ` +
                `-${savedBytes} bytes (${pctSaved(best.length, remoteCandidate.length)}%) beyond local optimization`
            );
            return remoteCandidate;
        }
        if (remoteCandidate) {
            logger.info(`ℹ️ iLovePDF returned no additional reduction (${contextLabel})`);
        }
    }

    return best;
}
