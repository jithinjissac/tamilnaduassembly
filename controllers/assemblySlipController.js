import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { getPreviewPayloadById } from './assemblyVoterController_v2.js';
import AssemblyOrder from '../models/AssemblyOrder.js';
import { optimizePdfLossless } from '../utils/pdfOptimizer.js';


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

// Pre-load local Malayalam font as base64 once at startup — eliminates all
// Google Fonts network requests during headless PDF rendering.
const _fontPath = path.join(__dirname, '../assets/fonts/NotoSansMalayalam-Regular.ttf');
const MALAYALAM_FONT_B64 = fs.existsSync(_fontPath)
    ? fs.readFileSync(_fontPath).toString('base64')
    : null;

/**
 * Generate assembly voter information slips with candidate
 */

export const generateSlipsWithCandidates = async (req, res) => {
    try {
        const { previewId, previewOnly = false } = req.body || {};

        let { voters, candidate, metadata } = req.body || {};

        // DEBUG: Log incoming data
        logger.info(`🔍 Received generateSlipsWithCandidates request:`, {
            hasCandidate: !!candidate,
            candidateKeys: candidate ? Object.keys(candidate) : [],
            hasCandidatePhoto: candidate && !!candidate.candidatePhoto,
            candidatePhotoLength: candidate && candidate.candidatePhoto ? candidate.candidatePhoto.length : 0
        });

        // Assembly preview flow sends previewId; resolve payload from server store.
        if ((!Array.isArray(voters) || voters.length === 0) && previewId) {
            const previewPayload = getPreviewPayloadById(previewId);
            if (!previewPayload) {
                return res.status(404).json({
                    success: false,
                    message: 'Preview data not found or expired. Please extract again.'
                });
            }

            // DEBUG: Log what we retrieved from preview
            logger.info('📦 Retrieved preview payload:', {
                hasVoters: previewPayload.voters && previewPayload.voters.length > 0,
                candidateKeys: previewPayload.candidate ? Object.keys(previewPayload.candidate) : 'null',
                hasCandidatePhoto: !!previewPayload.candidate?.candidatePhoto,
                photoLength: previewPayload.candidate?.candidatePhoto ? previewPayload.candidate.candidatePhoto.length : 0
            });

            voters = Array.isArray(previewPayload.voters) ? previewPayload.voters : [];
            candidate = previewPayload.candidate || candidate;

            const extracted = previewPayload.extractedData || {};
            const selectedParts = Array.isArray(previewPayload.selectedParts) ? previewPayload.selectedParts : [];
            const singlePartLabel = selectedParts.length === 1
                ? `${selectedParts[0].partNumber || ''}${selectedParts[0].partName ? ` - ${selectedParts[0].partName}` : ''}`.trim()
                : '';

            metadata = {
                ...(metadata || {}),
                constituency: extracted.constituency || metadata?.constituency,
                district: extracted.district || metadata?.district,
                pollingStationInfo: metadata?.pollingStationInfo || singlePartLabel,
                totalVoters: extracted.totalVoters || metadata?.totalVoters
            };
        }

        if (!voters || !Array.isArray(voters) || voters.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No voter data found'
            });
        }

        const normalizedCandidate = {
            symbol: '',
            symbolName: '',
            ...(candidate || {})
        };

        // DEBUG: Log normalized candidate
        logger.info(`✅ After normalization:`, {
            normalizedCandidateKeys: Object.keys(normalizedCandidate),
            hasCandidatePhoto: !!normalizedCandidate.candidatePhoto,
            candidatePhotoLength: normalizedCandidate.candidatePhoto ? normalizedCandidate.candidatePhoto.length : 0
        });

        // Null-safe metadata extraction
        const constituency = (metadata?.constituency || 'Assembly').toString().replace(/\s+/g, '');
        const district = (metadata?.district || '').toString();
        const totalVoters = metadata?.totalVoters || voters.length;

        logger.info(`Generating slips for ${voters.length} voters — constituency: ${constituency}`);

        const outputDir = resolveVoterSlipsDir();
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const timestamp = Date.now();
        const baseName = `assembly-slips-${constituency}-${timestamp}`;
        const pdfFileName = `${baseName}.pdf`;
        const pdfFullPath = path.join(outputDir, pdfFileName);

        const metaForHTML = {
            constituency: metadata?.constituency || 'Assembly',
            district,
            pollingStationInfo: metadata?.pollingStationInfo || '',
            previewOnly,
            totalVoters,
            totalAmount: totalVoters * 0.5,
            previewLimit: 10
        };

        const renderVoters = previewOnly ? voters.slice(0, metaForHTML.previewLimit) : voters;

        // ── Parallel chunked PDF generation ──────────────────────────────────
        // Each voter carries a large base64 image. To avoid CDP message-size
        // limits we write chunks to temp files and load via file://.
        // Chunks are processed 3 at a time using a single browser to avoid
        // the overhead of repeated browser launches.
        const VOTERS_PER_CHUNK = 120;  // ~24 A4 pages per chunk
        const PARALLEL = 3;            // concurrent pages inside one browser
        const tmpDir = path.join(outputDir, '_tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        // Split voters into ordered chunks
        const chunks = [];
        for (let s = 0; s < renderVoters.length; s += VOTERS_PER_CHUNK) {
            chunks.push({ idx: chunks.length, voters: renderVoters.slice(s, s + VOTERS_PER_CHUNK) });
        }

        const chunkPdfs = new Array(chunks.length); // preserve page order

        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            timeout: 300000
        });
        try {
            // Process PARALLEL chunks simultaneously
            for (let b = 0; b < chunks.length; b += PARALLEL) {
                const batch = chunks.slice(b, b + PARALLEL);
                await Promise.all(batch.map(async ({ idx, voters: cv }) => {
                    const chunkHtml = generateSlipsHTML(cv, normalizedCandidate, metaForHTML);
                    const tmpFile = path.join(tmpDir, `c-${timestamp}-${idx}.html`);
                    fs.writeFileSync(tmpFile, chunkHtml, 'utf8');
                    const page = await browser.newPage();
                    try {
                        await page.goto(`file:///${tmpFile.replace(/\\/g, '/')}`, {
                            waitUntil: 'domcontentloaded', timeout: 180000
                        });
                        chunkPdfs[idx] = await page.pdf({
                            printBackground: true,
                            preferCSSPageSize: true,
                            margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
                        });
                        logger.info(`  chunk ${idx + 1}/${chunks.length} done`);
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
            const doc = await PDFDocument.load(pdfBytes);
            const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
            pages.forEach(p => mergedPdf.addPage(p));
        }
        const pdfBuffer = await mergedPdf.save();
        const localOptimizedPdfBuffer = await optimizePdfLossless(pdfBuffer, `assembly-slips:${baseName}`);
        fs.writeFileSync(pdfFullPath, localOptimizedPdfBuffer);

        const apdfSourceUrl = buildPublicVoterSlipUrl(pdfFileName);
        if (apdfSourceUrl) {
            const apdfOptimizedPdfBuffer = await optimizePdfLossless(localOptimizedPdfBuffer, `assembly-slips:${baseName}:apdf`, {
                apdfSourceUrl,
                skipLocal: true
            });
            if (apdfOptimizedPdfBuffer.length < localOptimizedPdfBuffer.length) {
                fs.writeFileSync(pdfFullPath, apdfOptimizedPdfBuffer);
            }
        }

        logger.info(`✅ Assembly slips PDF saved: ${pdfFullPath}`);

        let assemblyGoogleDriveLink = null;
        try {
            const { uploadToGoogleDrive, isGoogleDriveConfigured } = await import('../utils/googleDrive.js');
            if (isGoogleDriveConfigured()) {
                logger.info(`📤 Assembly: Uploading generated PDF to Google Drive (${pdfFileName})...`);
                assemblyGoogleDriveLink = await uploadToGoogleDrive(pdfFullPath, baseName);
                if (assemblyGoogleDriveLink) {
                    logger.info(`✅ Assembly: Google Drive upload successful: ${assemblyGoogleDriveLink}`);
                } else {
                    logger.warn('⚠️ Assembly: Google Drive upload returned empty link');
                }
            } else {
                logger.info('ℹ️ Assembly: Google Drive not configured, skipping upload');
            }
        } catch (driveError) {
            logger.error(`❌ Assembly: Google Drive upload failed: ${driveError.message}`);
        }

        // Update order in DB with the generated PDF path (if this was from a preview session)
        if (previewId && !previewOnly) {
            try {
                const updated = await AssemblyOrder.findOneAndUpdate(
                    { previewId },
                    {
                        pdfPath: `/voter-slips/${pdfFileName}`,
                        pdfGenerated: true,
                        pdfGeneratedAt: new Date(),
                        ...(assemblyGoogleDriveLink ? { googleDriveLink: assemblyGoogleDriveLink } : {})
                    },
                    { new: true }
                );
                if (updated) {
                    logger.info(`✅ Updated order ${updated.orderId} pdfPath → /voter-slips/${pdfFileName}`);
                    if (assemblyGoogleDriveLink) {
                        logger.info(`✅ Updated order ${updated.orderId} googleDriveLink → ${assemblyGoogleDriveLink}`);
                    }
                }
            } catch (dbErr) {
                logger.warn(`⚠️ Could not update order pdfPath: ${dbErr.message}`);
            }
        }

        res.json({
            success: true,
            message: 'Slips generated successfully',
            downloadUrl: `/voter-slips/${pdfFileName}`,
            htmlUrl: `/voter-slips/${pdfFileName}`,
            pdfUrl: `/voter-slips/${pdfFileName}`,
            fileName: pdfFileName,
            pdfFileName,
            totalSlips: renderVoters.length,
            candidate: normalizedCandidate.symbolName || ''
        });

    } catch (error) {
        logger.error('Error generating slips with candidates:', error);
        logger.error('Stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to generate slips',
            error: error.message
        });
    }
};

function resolveSymbolImageSrc(src) {
    if (!src || typeof src !== 'string') return '';
    const cleaned = src.trim();
    if (cleaned.startsWith('data:image/') || cleaned.startsWith('http://') || cleaned.startsWith('https://')) return cleaned;
    
    if (cleaned.startsWith('/')) {
        const localPath = path.join(path.dirname(__dirname), 'public', cleaned.replace(/^\//, ''));
        if (fs.existsSync(localPath)) {
            return `file:///${localPath.replace(/\\/g, '/')}`;
        }
        return `http://localhost:3000${cleaned}`;
    }
    
    const relative = cleaned.replace(/^public\//i, '');
    const relativeLocalPath = path.join(path.dirname(__dirname), 'public', relative);
    if (fs.existsSync(relativeLocalPath)) {
        return `file:///${relativeLocalPath.replace(/\\/g, '/')}`;
    }
    return `http://localhost:3000/${relative}`;
}

/**
 * Generate HTML for assembly slips with single candidate
 */
function generateSlipsHTML(voters, candidate, metadata) {
    const constituency = metadata?.constituency || 'Assembly';
    const district = metadata?.district || '';
    const pollingStationInfo = metadata?.pollingStationInfo || '';
    const previewOnly = Boolean(metadata?.previewOnly);
    const totalVoters = metadata?.totalVoters || voters.length;
    const totalAmount = Number(metadata?.totalAmount || totalVoters * 0.5);
    const slipsPerPage = 5;
    const slipHeight = '52mm';
    const slipGap = '4mm';

    const toDisplayName = (value) => {
        const raw = (value || '').toString().trim();
        if (!raw) return '';
        const stripped = raw.replace(/^\d+\s*[-:.)]?\s*/, '').trim();
        return stripped || raw;
    };
    const districtDisplay = toDisplayName(district);
    const constituencyDisplay = toDisplayName(constituency);

    // Determine if a symbol should be displayed
    const rawSymbolImage = candidate?.symbol || '';
    const resolvedSymbolImage = resolveSymbolImageSrc(rawSymbolImage);
    const showSymbol = Boolean(resolvedSymbolImage);
    const rawSymbolNameMalayalam = candidate?.symbolNameMalayalam || candidate?.symbolName || '';
    const rawCandidatePhoto = candidate?.candidatePhoto || '';
    const resolvedCandidatePhoto = resolveSymbolImageSrc(rawCandidatePhoto);
    const showPhotoTemplate = Boolean(resolvedCandidatePhoto);

    // DEBUG: Log photo template decision
    if (voters.length > 0) {
        logger.info('🖼️ generateSlipsHTML - Candidate Object:', {
            candidateKeys: candidate ? Object.keys(candidate) : 'no candidate',
            candidateSymbol: !!candidate?.symbol,
            candidateSymbolName: !!candidate?.symbolName,
            candidatePhoto: candidate?.candidatePhoto ? `PRESENT (${candidate.candidatePhoto.substring(0, 80)}...)` : 'MISSING'
        });
        logger.info('🖼️ Photo Template Decision:', {
            rawCandidatePhotoExists: !!rawCandidatePhoto,
            rawCandidatePhotoLength: rawCandidatePhoto ? rawCandidatePhoto.length : 0,
            rawCandidatePhotoStart: rawCandidatePhoto ? rawCandidatePhoto.substring(0, 80) : 'empty',
            resolvedCandidatePhotoExists: !!resolvedCandidatePhoto,
            resolveResult: resolvedCandidatePhoto ? `YES (${resolvedCandidatePhoto.substring(0, 80)}...)` : 'NO',
            showPhotoTemplate
        });
    }

    const pages = [];
    for (let i = 0; i < voters.length; i += slipsPerPage) {
        pages.push(voters.slice(i, i + slipsPerPage));
    }

    const totalRendered = voters.length;
    const pagesHTML = pages.map((pageVoters, pageIndex) => {
        const slips = pageVoters.map((voter, idx) => {
            const absoluteIndex = pageIndex * slipsPerPage + idx;
            const isLastSlipInPreview = previewOnly && absoluteIndex === totalRendered - 1;
            const serialNo = voter.serialNo || voter.sl_no || idx + 1;
            const snippetSrc = voter.snippetBase64 || '';
            const fallbackInfo = [voter.name, voter.epicNo ? `EPIC: ${voter.epicNo}` : '', voter.age ? `Age: ${voter.age}` : '', voter.gender ? `Gender: ${voter.gender}` : '']
                .filter(Boolean)
                .join(' | ');

            const pollingStation = voter.pollingStation || voter.partName || pollingStationInfo || '-';
            const leftSection = showPhotoTemplate
                ? `
                <div class="slip-left photo-template">
                    <div class="candidate-photo-frame">
                        <img src="${resolvedCandidatePhoto}" alt="Candidate" class="candidate-photo-image">
                    </div>
                    ${showSymbol
                        ? `<div class="small-symbol-overlay"><img src="${resolvedSymbolImage}" alt="Symbol" class="small-symbol-image"></div>`
                        : ''
                    }
                </div>`
                : `
                <div class="slip-left">
                    <div class="slip-left-content">
                        ${showSymbol
                            ? `<div class="symbol-header">நமது<br>சின்னம்</div>
                               <div class="symbol-image-wrap"><img src="${resolvedSymbolImage}" alt="Symbol" class="symbol-image"></div>
                               ${rawSymbolNameMalayalam ? `<div class="symbol-name">${rawSymbolNameMalayalam}</div>` : ''}`
                            : `<div style="text-align:center; width:100%; line-height:1.2;">
                        <div style="font-weight:700; font-size:7pt; margin-bottom:0.4mm;">மாவட்டம்</div>
                        <div style="font-size:6pt; font-weight:600; color:#1e3a5f; margin-bottom:0.8mm; word-break:break-word;">${districtDisplay}</div>
                        <div style="width:85%; height:0.4mm; background:#bbb; margin:0 auto 0.8mm;"></div>
                        <div style="font-weight:700; font-size:7pt; margin-bottom:0.4mm;">சட்டமன்றத் தொகுதி</div>
                        <div style="font-size:6pt; font-weight:600; color:#1e3a5f; margin-bottom:0.8mm; word-break:break-word;">${constituencyDisplay}</div>
                        <div style="width:85%; height:0.4mm; background:#bbb; margin:0 auto 0.8mm;"></div>
                        <div style="font-weight:700; font-size:7pt; margin-bottom:0.4mm;">பகுதி எண்</div>
                        <div style="font-size:9pt; font-weight:800;">${voter.partNumber || ''}</div>
                        </div>`
                        }
                    </div>
                </div>`;
            if (isLastSlipInPreview) {
                return `
            <div class="voter-slip preview-payment-slip">
                <div style="width: 100%; height: 100%; display: grid; grid-template-columns: 34% 66%; gap: 2mm; padding: 1.2mm; background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%); border: 2px solid #c05621; border-radius: 1.5mm; overflow: hidden;">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; border-right: 1.5px solid #e2e8f0; padding-right: 1.5mm; min-width: 0;">
                        <div style="width: 13mm; height: 13mm; background: linear-gradient(135deg, #c05621 0%, #9c4221 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 1mm;">
                            <span style="font-size: 13pt; line-height: 1;">🔒</span>
                        </div>
                        <div style="background: linear-gradient(135deg, #c05621 0%, #9c4221 100%); color: white; padding: 1mm 1.4mm; border-radius: 1.2mm; font-size: 9pt; font-weight: 800; margin-bottom: 1mm; width: 100%; line-height: 1.1;">
                            ₹${totalAmount.toFixed(2)}
                        </div>
                        <div style="background: #FFF3CD; border: 1px solid #FFC107; border-radius: 1mm; padding: 0.8mm; width: 100%;">
                            <div style="font-size: 6pt; font-weight: 700; color: #856404; line-height: 1.15;">
                                ⚠️ Preview Only
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; justify-content: center; padding-left: 1mm; min-width: 0; overflow: hidden;">
                        <div style="font-size: 9.5pt; font-weight: 800; color: #E53E3E; margin-bottom: 0.8mm; line-height: 1.1;">
                            Complete Payment to Access Full PDF
                        </div>
                        <div style="font-size: 7pt; font-weight: 700; color: #1a202c; margin-bottom: 0.5mm; line-height: 1.15;">
                            Complete PDF Contains:
                        </div>
                        <div style="font-size: 11pt; font-weight: 800; color: #c05621; margin-bottom: 0.8mm; line-height: 1.1;">
                            ${totalVoters} Voter Information Slips
                        </div>
                        <div style="font-size: 6.4pt; color: #4a5568; margin-bottom: 0.8mm; line-height: 1.22;">
                            This preview shows only first 2 pages. Complete payment now for instant full download.
                        </div>
                        <div style="font-size: 6.2pt; color: #718096; line-height: 1.2;">
                            ✓ Instant Download<br>
                            ✓ All ${totalVoters} Slips<br>
                            ✓ Secure Payment
                        </div>
                    </div>
                </div>
            </div>`;
            }

            return `
            <div class="voter-slip">
                ${leftSection}
                <div class="cut-separator" aria-hidden="true">
                    <span class="cut-scissor">✂</span>
                </div>
                <div class="slip-right">
                    <div class="voter-image-container">
                        ${snippetSrc
                            ? `<img src="${snippetSrc}" alt="Voter ${serialNo}" class="voter-image">`
                            : `<div class="snippet-fallback">${fallbackInfo || 'No snippet available'}</div>`
                        }
                    </div>
                    <div class="polling-station-footer">வாக்குச்சாவடி: ${pollingStation !== '-' ? pollingStation : ''}</div>
                </div>
            </div>`;
        }).join('\n');

        return `<div class="page">${slips}</div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="ta">
<head>
    <meta charset="UTF-8">
    <title>Assembly Voter Information Slips - ${constituency}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Noto Sans Tamil', 'Noto Sans', Arial, sans-serif; background: #fff; }

        .page { width: 210mm; height: 297mm; padding: 5mm 10mm; display: flex; flex-direction: column; align-items: center; page-break-after: always; }
        .page:last-child { page-break-after: auto; }

        .voter-slip { width: 100%; height: ${slipHeight}; border: 1.2px solid #000; display: grid; grid-template-columns: 44mm 6mm 1fr; gap: 0; padding: 1.5mm; position: relative; flex-shrink: 0; margin-bottom: ${slipGap}; }
        .voter-slip::after { content: ''; position: absolute; left: 0; right: 0; bottom: -2mm; height: 0; border-bottom: 2px dashed #999; }
        .voter-slip:last-child { margin-bottom: 0; }
        .voter-slip:last-child::after { display: none; }
        .voter-slip > * { overflow: hidden; }

        .slip-left { display: flex !important; width: 100%; background: #fff; margin-right: 0; padding: 1.2mm; }
        .slip-left-content { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.3mm; width: 100%; }

        .cut-separator { position: relative; display: flex; align-items: center; justify-content: center; min-width: 0; }
        .cut-separator::before { content: ''; position: absolute; top: 1mm; bottom: 1mm; left: 50%; transform: translateX(-50%); border-left: 1.4px dotted #6b7280; }
        .cut-scissor { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; width: 4.2mm; height: 4.2mm; background: #fff; color: #374151; font-size: 10pt; line-height: 1; }

        .slip-left.photo-template { position: relative; padding: 0; overflow: hidden; }
        .candidate-photo-frame { width: 100%; height: 100%; }
        .candidate-photo-image { width: 100%; height: 100%; object-fit: cover; display: block; }
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
        .small-symbol-image { width: 100%; height: 100%; object-fit: contain; display: block; }
        
        .symbol-header { font-size: 8.5pt; font-weight: 700; text-align: center; line-height: 1.2; margin-bottom: 0.2mm; white-space: normal; word-break: keep-all; }
        .symbol-image-wrap { width: 100%; height: 18mm; display: flex; align-items: center; justify-content: center; }
        .symbol-image { max-width: 95%; max-height: 17.5mm; width: auto; height: auto; object-fit: contain; display: block; }
        .symbol-name { margin-top: 1.5mm; font-size: 10pt; font-weight: 700; text-align: center; line-height: 1.1; width: 100%; }

        .serial-label { font-size: 10pt; font-weight: 700; color: #000; margin-bottom: 0.8mm; text-align: center; line-height: 1.1; }
        .serial-value { font-size: 16pt; font-weight: 800; color: #000; text-align: center; line-height: 1; }

        .slip-right { flex: 1; margin-left: 0; padding: 1mm 1.5mm 1mm 2.5mm; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

        .voter-image-container { flex: 1; overflow: hidden; display: flex; align-items: flex-start; justify-content: flex-start; min-height: 0; }
        .voter-image { width: auto; height: 100%; max-width: 100%; object-fit: contain; display: block; filter: contrast(1.2); }
        .snippet-fallback { font-size: 9pt; line-height: 1.3; color: #333; }

        .polling-station-footer { font-size: 9.5pt; font-weight: 700; color: #000; border-top: 1.2px solid #000; padding-top: 1mm; margin-top: 1mm; line-height: 1.3; white-space: normal; overflow-wrap: anywhere; word-break: break-word; flex-shrink: 0; }

        @media print {
            @page { size: A4 portrait; margin: 0; }
        }
    </style>
</head>
<body>
${pagesHTML}
</body>
</html>`;
}
