/**
 * Assembly Voter Controller using Direct ECI API
 * Uses direct API endpoints for faster, more reliable data extraction
 */

import { logger } from '../utils/logger.js';
// In-memory captcha store for validation
const captchaStore = new Map();
const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5 minutes
import crypto from 'crypto';
import {
    generateCaptcha,
    generatePublishedPDFs,
    getPollingPartsList
} from '../utils/eciDirectApiClient.js';
import { parsePDFVoterData } from '../utils/pdfParser.js';
import { extractVoterSnippets } from '../utils/pdfSnippetExtractor.js';
import { saveVoterSnippetSlipsToFile } from '../utils/imageSlipGenerator.js';
import { saveVoterSlipsToFile } from '../utils/slipGenerator.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PREVIEW_TTL_MS = 30 * 60 * 1000;
const assemblyPreviewSessions = new Map();

// ─── Extraction Progress Tracking ────────────────────────────────────
const extractionProgress = new Map();

export function getExtractionProgress(progressId) {
    return extractionProgress.get(progressId) || null;
}

function updateProgress(progressId, update) {
    const current = extractionProgress.get(progressId) || {};
    extractionProgress.set(progressId, { ...current, ...update, updatedAt: Date.now() });
}

function cleanupProgress(progressId) {
    setTimeout(() => extractionProgress.delete(progressId), 5 * 60 * 1000);
}

function createPreviewSession(payload) {
    const previewId = `asm_${Date.now()}_${crypto.randomUUID()}`;
    const expiresAt = Date.now() + PREVIEW_TTL_MS;

    assemblyPreviewSessions.set(previewId, {
        payload,
        createdAt: Date.now(),
        expiresAt
    });
    schedulePreviewCleanup(previewId);

    return { previewId, expiresAt };
}

function schedulePreviewCleanup(previewId) {
    setTimeout(() => {
        assemblyPreviewSessions.delete(previewId);
    }, PREVIEW_TTL_MS);
}

/**
 * Health check endpoint
 */
export const healthCheck = (req, res) => {
    res.json({
        status: 'success',
        message: 'Assembly voter service is running (Direct API Mode)',
        timestamp: new Date().toISOString()
    });
};

/**
 * Get captcha image from ECI Direct API
 */
export const getCaptcha = async (req, res) => {
    try {
        const { stateCode, year, rollType, district, constituency, language } = req.body;

        if (!stateCode || !year || !rollType || !district || !constituency || !language) {
            return res.status(400).json({
                status: 'error',
                message: 'All form fields are required'
            });
        }

        logger.info(`Assembly: Generating captcha for AC ${constituency}...`);

        // Step 1: Fetch polling parts using direct API
        logger.info(`Assembly: Fetching polling parts for district ${district}, AC ${constituency}...`);
        const pollingParts = await getPollingPartsList(stateCode, district, constituency, rollType, year);
        logger.info(`Assembly: Found ${pollingParts.length} polling parts`);

        // Step 2: Generate captcha using direct API

        // Generate captcha using direct API
        const { captchaImage, captchaId } = await generateCaptcha();

        // Store captchaId with timestamp (no value to validate, just for expiry tracking)
        captchaStore.set(captchaId, { createdAt: Date.now() });
        // Clean up expired captchas
        for (const [id, entry] of captchaStore) {
            if (Date.now() - entry.createdAt > CAPTCHA_TTL_MS) captchaStore.delete(id);
        }

        // Step 3: Save captcha image temporarily (must be in public/captcha-cache for Express static serving)
        const captchaDir = path.join(__dirname, '../public/captcha-cache');
        if (!fs.existsSync(captchaDir)) {
            fs.mkdirSync(captchaDir, { recursive: true });
        }

        const captchaFileName = `captcha-${captchaId}.png`;
        const captchaPath = path.join(captchaDir, captchaFileName);

        // Decode base64 and save
        const captchaBuffer = Buffer.from(captchaImage, 'base64');
        fs.writeFileSync(captchaPath, captchaBuffer);

        // Step 4: Return captcha URL, sessionId (captchaId), and polling parts
        res.json({
            status: 'success',
            captchaUrl: `/captcha-cache/${captchaFileName}`,
            captchaId,
            sessionId: captchaId, // Use captchaId as sessionId for v2
            pollingParts,
            message: 'Captcha generated successfully'
        });

        logger.info(`Assembly: Captcha generated with ID ${captchaId} and ${pollingParts.length} parts`);
    } catch (error) {
        logger.error('Assembly: Error generating captcha:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to generate captcha',
            error: error.message
        });
    }
};

/**
 * Extract voters using Direct ECI API
 */
export const extractVoters = async (req, res) => {
            // Captcha validation: check captchaId exists and is not expired
            const captchaEntry = captchaStore.get(captchaId);
            logger.info(`Captcha validation: receivedId=${captchaId}, receivedValue=${captcha}`);
            if (!captchaEntry) {
                logger.warn(`Captcha validation failed: captchaId not found or expired. receivedId=${captchaId}`);
                return res.status(400).json({ status: 'error', message: 'Invalid captcha', error: 'Captcha mismatch or expired' });
            }
            // Remove captchaId after use
            captchaStore.delete(captchaId);
    try {
        const {
            stateCode,
            year,
            rollType,
            district,
            constituency,
            language,
            captcha,
            captchaId,
            selectedParts = [], // Array of part objects: [{partId, partNumber, partName}]
            skipSlipGeneration = false, // Optional: Skip slip generation, return just voter data
            createPreviewSession: shouldCreatePreviewSession = false,
            candidate = { symbol: '', symbolName: '' }
        } = req.body;

        // Validate required fields
        if (!stateCode || !year || !rollType || !district || !constituency || !language || !captcha || !captchaId) {
            return res.status(400).json({
                status: 'error',
                message: 'All fields including captcha and captcha ID are required'
            });
        }

        if (!selectedParts || selectedParts.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'At least one polling part must be selected'
            });
        }

        logger.info(`Assembly: Starting voter extraction for AC ${constituency}`);
        logger.info(`Assembly: Request data - State: ${stateCode}, District: ${district}, AC: ${constituency}`);
        logger.info(`Assembly: Roll Type: ${rollType}, Year: ${year}, Language: ${language}`);
        logger.info(`Assembly: Captcha ID: ${captchaId}, Selected ${selectedParts.length} polling parts`);
        logger.info(`Assembly: Selected parts: ${JSON.stringify(selectedParts).substring(0, 500)}`);

        // Extract part numbers from selected parts (API needs partNumber, not partId)
        const partNumbers = selectedParts.map(part => part.partNumber);
        logger.info(`Assembly: Part Numbers: ${partNumbers.join(', ')}`);

        // Initialize progress tracking (keyed by captchaId so frontend can poll)
        const progressId = captchaId;
        updateProgress(progressId, {
            stage: 'generating',
            stageLabel: 'Requesting PDFs from ECI...',
            totalParts: selectedParts.length,
            pdfDownloaded: 0,
            pdfTotal: 0,
            pdfSizeKB: 0,
            votersExtracted: 0,
            pagesProcessed: 0,
            totalPages: 0,
            percent: 5
        });

        // Send progressId immediately so frontend can start polling
        // We'll use it in the response, but also need it accessible via query

        // Step 1: Generate PDFs using direct API
        logger.info('Assembly: Requesting PDF generation from ECI API...');
        
        const pdfResult = await generatePublishedPDFs({
            stateCode,
            districtCode: district,
            acNumber: constituency,
            rollType,
            year,
            language,
            partNumbers,
            captcha,
            captchaId
        });

        if (pdfResult.status !== 'success' || !pdfResult.pdfUrls || pdfResult.pdfUrls.length === 0) {
            throw new Error('No PDFs generated. Captcha might be incorrect or invalid.');
        }

        logger.info(`Assembly: ${pdfResult.pdfUrls.length} PDF(s) generated`);

        updateProgress(progressId, {
            stage: 'downloading',
            stageLabel: 'Downloading voter list PDFs...',
            pdfTotal: pdfResult.pdfUrls.length,
            percent: 15
        });

        // Step 2: Download all PDFs
        const pdfDir = path.join(__dirname, '../pdf-downloads');
        if (!fs.existsSync(pdfDir)) {
            fs.mkdirSync(pdfDir, { recursive: true });
        }

        const downloadedPDFs = [];
        
        for (let i = 0; i < pdfResult.pdfUrls.length; i++) {
            const pdfUrl = pdfResult.pdfUrls[i];
            const pdfFileName = `voter-list-${constituency}-${Date.now()}-${i + 1}.pdf`;
            const pdfPath = path.join(pdfDir, pdfFileName);

            logger.info(`Assembly: Downloading PDF ${i + 1}/${pdfResult.pdfUrls.length} from ${pdfUrl}...`);

            try {
                const response = await axios.get(pdfUrl, {
                    responseType: 'arraybuffer',
                    timeout: 60000, // 60 second timeout
                    headers: {
                        'Accept': '*/*',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Referer': 'https://voters.eci.gov.in/download-eroll?stateCode=S11',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
                        'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
                        'sec-ch-ua-mobile': '?0',
                        'sec-ch-ua-platform': '"Windows"',
                        'sec-fetch-dest': 'empty',
                        'sec-fetch-mode': 'cors',
                        'sec-fetch-site': 'same-origin'
                    }
                });

                fs.writeFileSync(pdfPath, response.data);
                
                const stats = fs.statSync(pdfPath);
                logger.info(`Assembly: PDF ${i + 1} downloaded successfully - ${(stats.size / 1024).toFixed(2)} KB`);
                logger.info(`Assembly: PDF saved to: ${pdfPath}`);

                if (stats.size === 0) {
                    logger.warn(`Assembly: PDF ${i + 1} is empty, skipping...`);
                    continue;
                }

                downloadedPDFs.push(pdfPath);

                updateProgress(progressId, {
                    pdfDownloaded: downloadedPDFs.length,
                    pdfSizeKB: Math.round(stats.size / 1024),
                    stageLabel: `Downloaded PDF ${downloadedPDFs.length}/${pdfResult.pdfUrls.length} (${(stats.size / 1024).toFixed(0)} KB)`,
                    percent: 15 + Math.round((downloadedPDFs.length / pdfResult.pdfUrls.length) * 25)
                });
                
                // Log the file path for debugging/preview
                logger.info(`Assembly: ✅ PDF available at: file:///${pdfPath.replace(/\\/g, '/')}`);
            } catch (downloadError) {
                logger.error(`Assembly: Failed to download PDF ${i + 1}:`, downloadError.message);
                // Continue with other PDFs
            }
        }

        if (downloadedPDFs.length === 0) {
            throw new Error('Failed to download any PDFs');
        }

        // Step 3: Parse all downloaded PDFs
        logger.info(`Assembly: Processing ${downloadedPDFs.length} PDF(s)...`);
        let allVoterSnippets = [];

        updateProgress(progressId, {
            stage: 'extracting',
            stageLabel: 'Extracting voter data from PDFs...',
            percent: 40
        });
        
        for (let i = 0; i < downloadedPDFs.length; i++) {
            const pdfPath = downloadedPDFs[i];
            const selectedPart = selectedParts[i] || null;
            const pollingStationLabel = selectedPart
                ? `${selectedPart.partNumber || ''}${selectedPart.partName ? ` - ${selectedPart.partName}` : ''}`.trim()
                : '';
            const votersBeforeThisPdf = allVoterSnippets.length;
            
            try {
                logger.info(`Assembly: Extracting voter images from PDF ${i + 1}/${downloadedPDFs.length}...`);
                
                const snippets = await extractVoterSnippets(pdfPath, { 
                    startPage: 3,
                    skipLastPage: true,
                    onSnippetExtracted: (evt) => {
                        const liveTotal = votersBeforeThisPdf + (evt?.totalExtracted || 0);
                        const pdfFraction = downloadedPDFs.length > 0 ? (i / downloadedPDFs.length) : 0;
                        const pageFraction = Number.isFinite(evt?.pageProgress)
                            ? (evt.pageProgress / downloadedPDFs.length)
                            : 0;

                        updateProgress(progressId, {
                            votersExtracted: liveTotal,
                            pagesProcessed: i + 1,
                            stageLabel: `Snipping images... ${liveTotal.toLocaleString()} voters found`,
                            percent: 40 + Math.round((pdfFraction + pageFraction) * 45)
                        });
                    },
                    onPageProgress: (evt) => {
                        const liveTotal = votersBeforeThisPdf + (evt?.totalExtracted || 0);
                        const pageText = evt?.currentPage && evt?.totalPages
                            ? `Page ${evt.currentPage}/${evt.totalPages}`
                            : `PDF ${i + 1}/${downloadedPDFs.length}`;

                        updateProgress(progressId, {
                            votersExtracted: liveTotal,
                            pagesProcessed: i + 1,
                            stageLabel: `${pageText}: ${liveTotal.toLocaleString()} voters found`
                        });
                    }
                });
                
                if (snippets && Array.isArray(snippets)) {
                    const snippetsWithPart = snippets.map(snippet => ({
                        ...snippet,
                        partNumber: selectedPart?.partNumber || null,
                        partName: selectedPart?.partName || null,
                        pollingStation: pollingStationLabel || null
                    }));

                    logger.info(`Assembly: Extracted ${snippetsWithPart.length} voter images from PDF ${i + 1}`);
                    allVoterSnippets = allVoterSnippets.concat(snippetsWithPart);

                    updateProgress(progressId, {
                        votersExtracted: allVoterSnippets.length,
                        pagesProcessed: i + 1,
                        stageLabel: `Extracted ${allVoterSnippets.length} voters from ${i + 1}/${downloadedPDFs.length} PDF(s)`,
                        percent: 40 + Math.round(((i + 1) / downloadedPDFs.length) * 45)
                    });
                }
            } catch (extractError) {
                logger.error(`Assembly: Failed to extract from PDF ${i + 1}:`, extractError.message);
                // Continue with other PDFs
            }
        }

        if (allVoterSnippets.length === 0) {
            throw new Error('No voter data extracted from PDFs.');
        }

        logger.info(`Assembly: Total voters extracted: ${allVoterSnippets.length}`);

        // Generate voter slips with embedded images (unless skipped)
        let slipFileInfo = null;
        if (!skipSlipGeneration) {
            try {
                logger.info('Assembly: Generating voter slips with images...');
                slipFileInfo = await saveVoterSnippetSlipsToFile(allVoterSnippets, {
                    constituency,
                    district,
                    stateCode,
                    year,
                    candidate,
                    symbolImage: candidate?.symbol || candidate?.symbolImage || '',
                    symbolName: candidate?.symbolName || candidate?.name || '',
                    symbolNameMalayalam: candidate?.symbolNameMalayalam || candidate?.partyNameMalayalam || candidate?.nameMalayalam || candidate?.symbolName || candidate?.name || '',
                    pollingStationInfo: selectedParts.length === 1
                        ? `${selectedParts[0].partNumber || ''}${selectedParts[0].partName ? ` - ${selectedParts[0].partName}` : ''}`.trim()
                        : ''
                });
                logger.info(`Assembly: Voter slips generated: ${slipFileInfo.htmlFileName} and ${slipFileInfo.pdfFileName}`);
            } catch (slipError) {
                logger.error('Assembly: Failed to generate slips:', slipError.message);
                // Continue even if slip generation fails
            }
        } else {
            logger.info('Assembly: Slip generation skipped (skipSlipGeneration=true)');
        }

        // Cleanup: delete downloaded ECI PDFs to free disk space
        for (const dlPath of downloadedPDFs) {
            try {
                if (fs.existsSync(dlPath)) {
                    fs.unlinkSync(dlPath);
                    logger.info(`Assembly: Cleaned up temp PDF: ${dlPath}`);
                }
            } catch (cleanupErr) {
                logger.warn(`Assembly: Failed to cleanup ${dlPath}: ${cleanupErr.message}`);
            }
        }

        let previewSessionInfo = null;
        if (shouldCreatePreviewSession) {
            previewSessionInfo = createPreviewSession({
                orderId: `ASM-${Date.now()}`,
                voters: allVoterSnippets,
                candidate,
                extractedData: {
                    totalVoters: allVoterSnippets.length,
                    selectedParts: selectedParts.length,
                    constituency,
                    district,
                    stateCode,
                    extractionMethod: 'image-snippet'
                },
                selectedParts,
                createdAt: Date.now()
            });
        }

        // Send response
        updateProgress(progressId, {
            stage: 'complete',
            stageLabel: `Done! ${allVoterSnippets.length} voters extracted`,
            votersExtracted: allVoterSnippets.length,
            percent: 100
        });
        cleanupProgress(progressId);

        const responseData = {
            success: true,
            status: 'success',
            data: {
                totalVoters: allVoterSnippets.length,
                voters: shouldCreatePreviewSession ? [] : allVoterSnippets,
                voterImages: allVoterSnippets.length,
                pdfUrls: pdfResult.pdfUrls,
                downloadedPdfPaths: downloadedPDFs,
                slipFile: slipFileInfo ? `/voter-slips/${slipFileInfo.fileName}` : null,
                slipFileHtml: slipFileInfo ? `/voter-slips/${slipFileInfo.htmlFileName}` : null,
                slipFilePdf: slipFileInfo?.pdfFileName ? `/voter-slips/${slipFileInfo.pdfFileName}` : null,
                selectedParts: selectedParts.length,
                constituency,
                district,
                stateCode,
                extractionMethod: 'image-snippet',
                previewId: previewSessionInfo ? previewSessionInfo.previewId : null,
                previewExpiresAt: previewSessionInfo ? previewSessionInfo.expiresAt : null
            },
            message: `Successfully extracted ${allVoterSnippets.length} voter images from ${downloadedPDFs.length} PDF(s)`
        };

        res.json(responseData);

    } catch (error) {
        logger.error('Assembly: Error extracting voters:', error);
        logger.error('Assembly: Error stack:', error.stack);
        
        let errorMessage = 'Failed to extract voter data';
        let errorDetails = error.message;
        
        if (error.message.includes('Captcha') || error.message.includes('captcha')) {
            errorMessage = 'Invalid captcha. Please try again with correct captcha text.';
        } else if (error.message.includes('PDF')) {
            errorMessage = 'Failed to download or parse PDF files. Please try again.';
        } else if (error.response) {
            logger.error('Assembly: Error response:', error.response.data);
            errorDetails = JSON.stringify(error.response.data);
        }
        
        res.status(500).json({
            status: 'error',
            message: errorMessage,
            error: errorDetails,
            details: error.response?.data || error.message
        });
    }
};

/**
 * Store assembly preview payload temporarily on server to avoid browser storage quota limits
 */
export const storePreviewData = (req, res) => {
    try {
        const payload = req.body || {};
        const voters = Array.isArray(payload.voters) ? payload.voters : [];

        if (voters.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Preview payload must include voters'
            });
        }

        const { previewId, expiresAt } = createPreviewSession(payload);

        return res.json({
            status: 'success',
            previewId,
            expiresAt
        });
    } catch (error) {
        logger.error('Assembly: Failed to store preview payload:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Failed to store preview data',
            error: error.message
        });
    }
};

/**
 * Read assembly preview payload from temporary server store
 */
export const getPreviewData = (req, res) => {
    try {
        const { previewId } = req.params;
        if (!previewId) {
            return res.status(400).json({
                status: 'error',
                message: 'previewId is required'
            });
        }

        const entry = assemblyPreviewSessions.get(previewId);
        if (!entry) {
            return res.status(404).json({
                status: 'error',
                message: 'Preview data not found or expired'
            });
        }

        if (Date.now() > entry.expiresAt) {
            assemblyPreviewSessions.delete(previewId);
            return res.status(410).json({
                status: 'error',
                message: 'Preview data expired. Please extract again.'
            });
        }

        return res.json({
            status: 'success',
            data: entry.payload,
            expiresAt: entry.expiresAt
        });
    } catch (error) {
        logger.error('Assembly: Failed to read preview payload:', error);
        return res.status(500).json({
            status: 'error',
            message: 'Failed to load preview data',
            error: error.message
        });
    }
};

/**
 * Internal helper for other controllers: resolve preview payload by previewId
 */
export const getPreviewPayloadById = (previewId) => {
    if (!previewId) {
        return null;
    }

    const entry = assemblyPreviewSessions.get(previewId);
    if (!entry) {
        return null;
    }

    if (Date.now() > entry.expiresAt) {
        assemblyPreviewSessions.delete(previewId);
        return null;
    }

    return entry.payload;
};

export default {
    healthCheck,
    getCaptcha,
    extractVoters,
    storePreviewData,
    getPreviewData,
    getPreviewPayloadById
};
