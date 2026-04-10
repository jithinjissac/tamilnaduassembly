/**
 * Image-based Voter Information Slip Generator
 * Embeds voter snippet images directly in slips
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { logger } from './logger.js';
import { optimizePdfLossless } from './pdfOptimizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveVoterSlipsDir() {
    const mountedBucketPath = process.env.GCS_MOUNT_PATH || '/slipsdata';
    if (fs.existsSync(mountedBucketPath)) {
        return path.join(mountedBucketPath, 'voter-slips');
    }
    return path.join(path.dirname(__dirname), 'voter-slips');
}

function buildPublicVoterSlipUrl(fileName) {
    const base = (process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
    if (!base || !fileName) return '';
    return `${base}/voter-slips/${encodeURIComponent(fileName)}`;
}

/**
 * Generate voter information slips with embedded images
 */
export async function saveVoterSnippetSlipsToFile(voterSnippets, metadata = {}) {
    try {
        const { constituency = 'Assembly', district = '', stateCode = '' } = metadata;
        const VOTERS_PER_CHUNK = 100;  // ~20 A4 pages per chunk (5 slips/page)
        const PARALLEL = 3;
        const KEEP_FULL_HTML_MAX_VOTERS = 100;
        
        // Create output directory
        const outputDir = resolveVoterSlipsDir();
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Generate filenames
        const timestamp = Date.now();
        const baseName = `voter-slips-IMG-${constituency.replace(/\s+/g, '')}-${timestamp}`;
        const htmlFileName = `${baseName}.html`;
        const pdfFileName = `${baseName}.pdf`;
        const htmlFullPath = path.join(outputDir, htmlFileName);
        const pdfFullPath = path.join(outputDir, pdfFileName);
        let htmlArtifactSaved = false;

        // Only keep a full HTML artifact for smaller jobs. Large jobs can blow up
        // memory/string limits because every voter carries a big base64 image.
        if (voterSnippets.length <= KEEP_FULL_HTML_MAX_VOTERS) {
            const html = generateImageSlipsHTML(voterSnippets, metadata);
            fs.writeFileSync(htmlFullPath, html, 'utf8');
            htmlArtifactSaved = true;
            logger.info(`✅ Image-based voter information slips HTML saved to: ${htmlFullPath}`);
        } else {
            logger.info(`ℹ️ Skipping full HTML artifact for ${voterSnippets.length} voters; using chunked PDF generation only`);
        }

        // ── Chunked PDF generation ───────────────────────────────────────
        // Each voter carries a large base64 image. To avoid memory/protocol
        // limits, we split voters into chunks, render each chunk to a temp
        // HTML file, convert to PDF via file:// URL, then merge with pdf-lib.
        const tmpDir = path.join(outputDir, '_tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        // Split voters into ordered chunks
        const chunks = [];
        for (let s = 0; s < voterSnippets.length; s += VOTERS_PER_CHUNK) {
            chunks.push({ idx: chunks.length, voters: voterSnippets.slice(s, s + VOTERS_PER_CHUNK) });
        }

        let pdfGenerated = false;
        try {
            const chunkPdfs = new Array(chunks.length);
            const browser = await chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--max-old-space-size=4096'
                ],
                timeout: 300000
            });
            try {
                for (let b = 0; b < chunks.length; b += PARALLEL) {
                    const batch = chunks.slice(b, b + PARALLEL);
                    await Promise.all(batch.map(async ({ idx, voters: cv }) => {
                        const chunkHtml = generateImageSlipsHTML(cv, metadata);
                        const tmpFile = path.join(tmpDir, `img-${timestamp}-${idx}.html`);
                        fs.writeFileSync(tmpFile, chunkHtml, 'utf8');
                        const page = await browser.newPage();
                        try {
                            await page.goto(`file:///${tmpFile.replace(/\\/g, '/')}`, {
                                waitUntil: 'domcontentloaded', timeout: 120000
                            });
                            chunkPdfs[idx] = await page.pdf({
                                printBackground: true,
                                preferCSSPageSize: true,
                                margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
                            });
                            logger.info(`  image-slip chunk ${idx + 1}/${chunks.length} done`);
                        } finally {
                            await page.close();
                            try { fs.unlinkSync(tmpFile); } catch (_) {}
                        }
                    }));
                }
            } finally {
                await browser.close();
                try { fs.rmdirSync(tmpDir); } catch (_) {}
            }

            // Merge all chunk PDFs in order
            const mergedPdf = await PDFDocument.create();
            for (const pdfBytes of chunkPdfs) {
                if (!pdfBytes) continue;
                const doc = await PDFDocument.load(pdfBytes);
                const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
                pages.forEach(p => mergedPdf.addPage(p));
            }
            const finalPdfBytes = await mergedPdf.save();
            const localOptimizedPdfBytes = await optimizePdfLossless(finalPdfBytes, `image-slips:${baseName}`);
            fs.writeFileSync(pdfFullPath, localOptimizedPdfBytes);

            const apdfSourceUrl = buildPublicVoterSlipUrl(pdfFileName);
            if (apdfSourceUrl) {
                // Use 'low' compression on iLovePDF to preserve voter snippet image quality
                const apdfOptimizedPdfBytes = await optimizePdfLossless(localOptimizedPdfBytes, `image-slips:${baseName}:apdf`, {
                    apdfSourceUrl,
                    skipLocal: true,
                    ilovepdfCompressionLevel: 'low'
                });
                if (apdfOptimizedPdfBytes.length < localOptimizedPdfBytes.length) {
                    fs.writeFileSync(pdfFullPath, apdfOptimizedPdfBytes);
                }
            }
            pdfGenerated = true;
            logger.info(`✅ Image-based voter information slips PDF saved to: ${pdfFullPath} (${chunks.length} chunks merged)`);

            // Delete the large HTML file to save disk space now that PDF is ready
            if (htmlArtifactSaved) {
                try {
                    fs.unlinkSync(htmlFullPath);
                    logger.info(`🗑️ Deleted HTML file to save space: ${htmlFileName}`);
                    htmlArtifactSaved = false;
                } catch (delErr) {
                    logger.warn(`⚠️ Could not delete HTML file: ${delErr.message}`);
                }
            }
        } catch (pdfErr) {
            logger.error(`❌ PDF generation failed (HTML still available): ${pdfErr.message}`);
        }


        // Cleanup only the python-boxes-N folder created for this order (created by pdfSnippetExtractor)
        try {
            // Try to find the python-boxes-N folder for this order
            // The folder is created as path.join(outputDir, `python-boxes-${Date.now()}`) in pdfSnippetExtractor
            // We can pass the folder name via metadata if available, otherwise try to infer
            let pythonBoxesDir = metadata.pythonBoxesDir;
            if (!pythonBoxesDir && metadata._pythonBoxesDir) pythonBoxesDir = metadata._pythonBoxesDir;
            if (!pythonBoxesDir && metadata.lastPythonBoxesDir) pythonBoxesDir = metadata.lastPythonBoxesDir;
            // Fallback: try to find the most recent python-boxes-* folder in the parent dir
            if (!pythonBoxesDir) {
                const parentDir = path.dirname(outputDir);
                if (fs.existsSync(parentDir)) {
                    const files = fs.readdirSync(parentDir)
                        .filter(f => /^python-boxes-\d+$/.test(f))
                        .map(f => ({ name: f, mtime: fs.statSync(path.join(parentDir, f)).mtime }))
                        .sort((a, b) => b.mtime - a.mtime);
                    if (files.length > 0) {
                        pythonBoxesDir = path.join(parentDir, files[0].name);
                    }
                }
            }
            if (pythonBoxesDir && fs.existsSync(pythonBoxesDir)) {
                fs.rmSync(pythonBoxesDir, { recursive: true, force: true });
                logger.info(`🗑️ Cleaned up python-boxes folder: ${pythonBoxesDir}`);
            }
        } catch (cleanupErr) {
            logger.warn(`⚠️ Could not delete python-boxes folder: ${cleanupErr.message}`);
        }

        return {
            fileName: htmlArtifactSaved ? htmlFileName : (pdfGenerated ? pdfFileName : null),
            fullPath: htmlArtifactSaved ? htmlFullPath : (pdfGenerated ? pdfFullPath : null),
            htmlFileName: htmlArtifactSaved ? htmlFileName : null,
            htmlFullPath: htmlArtifactSaved ? htmlFullPath : null,
            pdfFileName: pdfGenerated ? pdfFileName : null,
            pdfFullPath: pdfGenerated ? pdfFullPath : null,
            totalSlips: voterSnippets.length
        };
        
    } catch (error) {
        logger.error('Failed to save image slips:', error);
        throw error;
    }
}

/**
 * Generate HTML with embedded voter images
 */
function generateImageSlipsHTML(voterSnippets, metadata) {
    const {
        constituency = 'Assembly',
        district = '',
        districtLabel = '',
        constituencyLabel = '',
        pollingStationInfo = '',
        symbolImage = '',
        symbolName = '',
        symbolNameMalayalam = '',
        candidate = null
    } = metadata;

    const rawSymbolImage =
        symbolImage ||
        candidate?.symbol ||
        candidate?.symbolImage ||
        candidate?.partyLogo ||
        candidate?.imageUrl ||
        candidate?.url ||
        '';
    const rawSymbolName =
        symbolName ||
        candidate?.symbolName ||
        candidate?.name ||
        candidate?.partyName ||
        '';
    const rawSymbolNameMalayalam =
        symbolNameMalayalam ||
        candidate?.symbolNameMalayalam ||
        candidate?.partyNameMalayalam ||
        candidate?.nameMalayalam ||
        rawSymbolName ||
        '';
    const resolvedSymbolImage = resolveSymbolImageSrc(rawSymbolImage);
    const showSymbol = Boolean(resolvedSymbolImage);
    const rawCandidatePhoto =
        candidate?.candidatePhoto ||
        metadata?.candidatePhoto ||
        '';
    const resolvedCandidatePhoto = resolveSymbolImageSrc(rawCandidatePhoto);
    const showPhotoTemplate = Boolean(resolvedCandidatePhoto);

    const toDisplayName = (value) => {
        const raw = (value || '').toString().trim();
        if (!raw) return '';
        const stripped = raw.replace(/^\d+\s*[-:.)]?\s*/, '').trim();
        return stripped || raw;
    };
    const districtDisplay = districtLabel ? districtLabel : toDisplayName(district);
    const constituencyDisplay = constituencyLabel ? toDisplayName(constituencyLabel) : toDisplayName(constituency);
      // Use 5 slips per page for portrait A4 print layout
    const slipsPerPage = 5;
    
    // Slip dimensions for 5 slips per page (A4 portrait)
    const slipHeight = '52mm';
    const slipGap = '4mm';
    
    // Group into pages
    const pages = [];
    for (let i = 0; i < voterSnippets.length; i += slipsPerPage) {
        pages.push(voterSnippets.slice(i, i + slipsPerPage));
    }
    
    const pagesHTML = pages.map((pageSlips, pageIndex) => {
        const slipsHTML = pageSlips.map(voter => {
            const pollingStationText = voter.pollingStation || voter.partName || pollingStationInfo || '';
            const serialNo = voter.serialNo || voter.sl_no || '';
            const leftSection = showPhotoTemplate
                ? `
                <div class="slip-left photo-template">
                    <div class="candidate-photo-frame">
                        <img src="${resolvedCandidatePhoto}" alt="Candidate" class="candidate-photo-image">
                    </div>
                    ${showSymbol
                        ? `<div class="small-symbol-overlay"><img src="${resolvedSymbolImage}" alt="Symbol" class="small-symbol-image"></div>`
                        : ''}
                </div>`
                : `
                <div class="slip-left">
                    <div class="slip-left-content">
                        ${showSymbol
                            ? `<div class="symbol-header">நமது<br>சின்னம்</div>
                        <div class="symbol-image-wrap"><img src="${resolvedSymbolImage}" alt="Symbol" class="symbol-image"></div>
                        ${rawSymbolNameMalayalam ? `<div class="symbol-name">${rawSymbolNameMalayalam}</div>` : ''}`
                            : `<div style="text-align:center; width:100%; line-height:1.2;">
                        <div style="font-weight:700; font-size:7.5pt; margin-bottom:0.5mm;">மாவட்டம்</div>
                        <div style="font-size:6.5pt; font-weight:600; color:#1e3a5f; margin-bottom:1mm; word-break:break-word;">${districtDisplay}</div>
                        <div style="width:85%; height:0.4mm; background:#bbb; margin:0 auto 1mm;"></div>
                        <div style="font-weight:700; font-size:7.5pt; margin-bottom:0.5mm;">சட்டமன்றத் தொகுதி</div>
                        <div style="font-size:6.5pt; font-weight:600; color:#1e3a5f; margin-bottom:1mm; word-break:break-word;">${constituencyDisplay}</div>
                        <div style="width:85%; height:0.4mm; background:#bbb; margin:0 auto 1mm;"></div>
                        <div style="font-weight:700; font-size:7.5pt; margin-bottom:0.5mm;">பகுதி எண்</div>
                        <div style="font-size:10pt; font-weight:800;">${voter.partNumber || ''}</div>
                        </div>`}
                    </div>
                </div>`;

            return `
            <div class="voter-slip">
                ${leftSection}
                <div class="cut-separator" aria-hidden="true">
                    <span class="cut-scissor">✂</span>
                </div>
                <div class="slip-right">
                    <div class="voter-image-container">
                        <img src="${voter.snippetBase64}" alt="Voter ${serialNo}" class="voter-image">
                    </div>
                    ${pollingStationText ? `<div class="polling-station-footer">வாக்குச்சாவடி: ${pollingStationText}</div>` : ''}
                </div>
            </div>
        `;
        }).join('\n');
        
        return `    <div class="page">
${slipsHTML}
    </div>`;
    }).join('\n');
    
    return `<!DOCTYPE html>
<html lang="ta">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Assembly Voter Information Slips - ${constituency}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Noto Sans Tamil', 'Noto Sans', Arial, sans-serif; 
            background: #fff; 
        }
        
        .page { 
            width: 210mm; 
            height: 297mm; 
            padding: 5mm 10mm; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            page-break-after: always; 
        }
        .page:last-child { page-break-after: auto; }
        
        .voter-slip { 
            width: 100%; 
            height: ${slipHeight}; 
            border: 1.2px solid #000; 
            display: grid; 
            grid-template-columns: 44mm 6mm 1fr; 
            gap: 0; 
            padding: 1.5mm; 
            position: relative; 
            flex-shrink: 0; 
            margin-bottom: ${slipGap}; 
        }
        .voter-slip::after { 
            content: ''; 
            position: absolute; 
            left: 0; 
            right: 0; 
            bottom: -2mm; 
            height: 0; 
            border-bottom: 2px dashed #999; 
        }
        .voter-slip:last-child { margin-bottom: 0; }
        .voter-slip:last-child::after { display: none; }
        .voter-slip > * { overflow: hidden; }
        
        .slip-left { 
            display: flex !important; 
            width: 100%; 
            background: #fff; 
            margin-right: 0; 
            padding: 1.2mm; 
        }

        .cut-separator {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 0;
        }

        .cut-separator::before {
            content: '';
            position: absolute;
            top: 1mm;
            bottom: 1mm;
            left: 50%;
            transform: translateX(-50%);
            border-left: 1.4px dotted #6b7280;
        }

        .cut-scissor {
            position: relative;
            z-index: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 4.2mm;
            height: 4.2mm;
            background: #fff;
            color: #374151;
            font-size: 10pt;
            line-height: 1;
        }
        
        .slip-left-content { 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center; 
            gap: 0.3mm;
            width: 100%; 
        }

        .slip-left.photo-template {
            position: relative;
            padding: 0;
            overflow: hidden;
        }

        .candidate-photo-frame {
            width: 100%;
            height: 100%;
        }

        .candidate-photo-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        .small-symbol-overlay {
            position: absolute;
            right: 0.7mm;
            bottom: 0.7mm;
            width: 13mm;
            height: 13mm;
            background: #fff;
            border: 1px solid #000;
            border-radius: 1mm;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0.9mm;
        }

        .small-symbol-image {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
        }
        
        .serial-label { 
            font-size: 10pt; 
            font-weight: 700; 
            color: #000; 
            margin-bottom: 0.8mm; 
            text-align: center; 
            line-height: 1.1; 
        }
        
        .serial-value { 
            font-size: 16pt; 
            font-weight: 800; 
            color: #000; 
            text-align: center; 
            line-height: 1; 
        }

        .symbol-header {
            font-size: 8.5pt;
            font-weight: 700;
            text-align: center;
            line-height: 1.2;
            margin-bottom: 0.2mm;
            white-space: normal;
            word-break: keep-all;
        }

        .symbol-image-wrap {
            width: 100%;
            height: 18mm;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }

        .symbol-image {
            max-width: 95%;
            max-height: 17.5mm;
            width: auto;
            height: auto;
            object-fit: contain;
            display: block;
        }

        .symbol-name {
            margin-top: 1.5mm;
            font-size: 10pt;
            font-weight: 700;
            text-align: center;
            line-height: 1.1;
            width: 100%;
            white-space: normal;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        
        .slip-right {
            flex: 1;
            margin-left: 0;
            padding: 1mm 1.5mm 1mm 2.5mm;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            overflow: hidden;
            min-width: 0;
            min-height: 0;
        }

        .voter-image-container {
            flex: 1;
            display: flex;
            align-items: flex-start;
            justify-content: flex-start;
            overflow: hidden;
            min-height: 0;
        }

        .voter-image {
            width: auto;
            height: 100%;
            max-width: 100%;
            object-fit: contain;
            image-rendering: auto;
            filter: contrast(1.2) brightness(1.0);
            display: block;
        }

        .polling-station-footer {
            font-size: 9.5pt;
            font-weight: 700;
            border-top: 1.2px solid #000;
            padding-top: 1mm;
            margin-top: 1mm;
            flex-shrink: 0;
            white-space: normal;
            overflow-wrap: anywhere;
            word-break: break-word;
            line-height: 1.2;
        }

        @media print { 
            @page { size: A4 portrait; margin: 0; } 
            body { background: white; }
            .page { page-break-after: always; }
            .page:last-child { page-break-after: auto; }
            .voter-slip { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
${pagesHTML}
</body>
</html>`;
}

function resolveSymbolImageSrc(src) {
    if (!src || typeof src !== 'string') return '';

    const cleaned = src.trim();

    if (cleaned.startsWith('data:image/') || cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
        return cleaned;
    }

    if (cleaned.startsWith('/')) {
        const localPath = path.join(path.dirname(__dirname), 'public', cleaned.replace(/^\//, ''));
        if (fs.existsSync(localPath)) {
            return `file:///${localPath.replace(/\\/g, '/')}`;
        }
        return `http://localhost:3000${cleaned}`;
    }

    // Handle relative symbol paths such as "symbols/file.png" or "public/symbols/file.png".
    const relative = cleaned.replace(/^public\//i, '');
    const relativeLocalPath = path.join(path.dirname(__dirname), 'public', relative);
    if (fs.existsSync(relativeLocalPath)) {
        return `file:///${relativeLocalPath.replace(/\\/g, '/')}`;
    }

    if (relative.startsWith('symbols/')) {
        return `http://localhost:3000/${relative}`;
    }

    return cleaned;
}

export default {
    saveVoterSnippetSlipsToFile
};
