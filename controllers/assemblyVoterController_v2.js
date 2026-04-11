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
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TAMIL_NADU_S22_MAPPING_FILE = path.join(
    process.cwd(),
    'data',
    'eci',
    'S22-user-mapping.json'
);

const TAMIL_NADU_DISTRICT_CODE_MAP = {
    'THIRUVALLUR': 'S2201',
    'CHENNAI': 'S2202',
    'KANCHEEPURAM': 'S2203',
    'VELLORE': 'S2204',
    'KRISHNAGIRI': 'S2205',
    'DHARMAPURI': 'S2206',
    'TIRUVANNAMALAI': 'S2207',
    'VILUPPURAM': 'S2208',
    'SALEM': 'S2209',
    'NAMAKKAL': 'S2210',
    'ERODE': 'S2211',
    'THE NILGIRIS': 'S2212',
    'COIMBATORE': 'S2213',
    'DINDIGUL': 'S2214',
    'KARUR': 'S2215',
    'TIRUCHIRAPPALLI': 'S2216',
    'PERAMBALUR': 'S2217',
    'CUDDALORE': 'S2218',
    'NAGAPATTINAM': 'S2219',
    'THIRUVARUR': 'S2220',
    'THANJAVUR': 'S2221',
    'PUDUKKOTTAI': 'S2222',
    'SIVAGANGA': 'S2223',
    'MADURAI': 'S2224',
    'THENI': 'S2225',
    'VIRUDHUNAGAR': 'S2226',
    'RAMANATHAPURAM': 'S2227',
    'THOOTHUKUDI': 'S2228',
    'TIRUNELVELI': 'S2229',
    'KANNIYAKUMARI': 'S2230',
    'ARIYALUR': 'S2231',
    'TIRUPPUR': 'S2232',
    'KALLAKURICHI': 'S2233',
    'TENKASI': 'S2234',
    'CHENGALPATTU': 'S2235',
    'TIRUPATHUR': 'S2236',
    'RANIPET': 'S2237',
    'MAYILADUTHURAI': 'S2238'
};

function parseCookieHeader(cookieHeader = '') {
    return String(cookieHeader)
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            const separatorIndex = entry.indexOf('=');
            if (separatorIndex <= 0) {
                return null;
            }

            return {
                name: entry.slice(0, separatorIndex),
                value: entry.slice(separatorIndex + 1),
                domain: '.eci.gov.in',
                path: '/',
                secure: true
            };
        })
        .filter(Boolean);
}

async function downloadPdfWithPlaywright(candidateUrls, targetPath, stateCode, cookieHeader = '') {
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
        });

        const cookies = parseCookieHeader(cookieHeader);
        if (cookies.length > 0) {
            await context.addCookies(cookies);
        }

        const page = await context.newPage();
        const stateParam = encodeURIComponent(String(stateCode || '').toUpperCase());
        await page.goto(`https://voters.eci.gov.in/download-eroll?stateCode=${stateParam}`, {
            waitUntil: 'domcontentloaded',
            timeout: 45000
        });

        let lastError = null;
        for (const candidateUrl of candidateUrls) {
            try {
                logger.info(`Assembly: Browser fallback downloading from ${candidateUrl}`);
                const response = await page.goto(candidateUrl, {
                    waitUntil: 'networkidle',
                    timeout: 60000
                });

                if (!response) {
                    continue;
                }

                const status = response.status();
                const contentType = String(response.headers()['content-type'] || '').toLowerCase();
                if (status >= 200 && status < 300 && contentType.includes('application/pdf')) {
                    const pdfBuffer = await response.body();
                    if (!pdfBuffer || pdfBuffer.length === 0) {
                        continue;
                    }

                    const pdfHeader = Buffer.from(pdfBuffer).subarray(0, 5).toString('ascii');
                    if (pdfHeader !== '%PDF-') {
                        lastError = new Error(`Unexpected browser payload at ${candidateUrl}: content-type ${contentType || 'unknown'}, header ${pdfHeader || 'empty'}`);
                        continue;
                    }

                    fs.writeFileSync(targetPath, pdfBuffer);
                    return { sourceUrl: candidateUrl, bytes: pdfBuffer.length };
                }

                lastError = new Error(`Unexpected browser response: status ${status}, content-type ${contentType || 'unknown'}`);
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError || new Error('Browser fallback failed for all PDF URLs');
    } finally {
        await browser.close();
    }
}

function stripBom(raw) {
    if (typeof raw !== 'string') return raw;
    return raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
}

function normalizeTamilNaduS22Mapping(parsed) {
    if (!parsed) return null;

    if (Array.isArray(parsed.districts)) {
        return parsed;
    }

    const sourceDistricts = parsed.districts && typeof parsed.districts === 'object'
        ? parsed.districts
        : (parsed && typeof parsed === 'object' ? parsed : null);

    if (sourceDistricts && typeof sourceDistricts === 'object') {
        let acNumber = 1;
        const districts = Object.entries(sourceDistricts).map(([districtName, districtEntries], districtIndex) => {
            const normalizedDistrictName = String(districtName || '').trim();
            const districtCode = TAMIL_NADU_DISTRICT_CODE_MAP[normalizedDistrictName.toUpperCase()] || `S22${String(districtIndex + 1).padStart(2, '0')}`;
            const rows = Array.isArray(districtEntries) ? districtEntries : [];
            const hasObjectRows = rows.some((item) => item && typeof item === 'object');

            let constituencies = [];

            if (hasObjectRows) {
                constituencies = rows
                    .filter((item) => item && typeof item === 'object')
                    .map((item) => {
                        const acNum = Number.parseInt(item.ac_no, 10);
                        const acName = String(item.ac_name || '').trim();
                        const label = String(item.label || '').trim();

                        if (!Number.isInteger(acNum)) {
                            return null;
                        }

                        return {
                            value: String(acNum),
                            text: label || `${acNum} - ${acName}`,
                            acNumber: acNum,
                            acName,
                            label,
                            districtCode,
                            districtName: normalizedDistrictName
                        };
                    })
                    .filter(Boolean)
                    .sort((a, b) => a.acNumber - b.acNumber);
            } else {
                constituencies = rows.map((name) => {
                    const acName = String(name || '').trim();
                    const row = {
                        value: String(acNumber),
                        text: `${acNumber} - ${acName}`,
                        acNumber,
                        acName,
                        districtCode,
                        districtName: normalizedDistrictName
                    };
                    acNumber += 1;
                    return row;
                });
            }

            return {
                districtCode,
                districtName: normalizedDistrictName,
                constituencies,
                constituencyCount: constituencies.length,
                error: null
            };
        });

        return {
            generatedAt: new Date().toISOString(),
            source: 'User provided Tamil Nadu mapping',
            stateCode: 'S22',
            stateName: 'Tamil Nadu',
            year: Number(parsed.year || new Date().getFullYear()),
            districtCount: districts.length,
            totalConstituencies: districts.reduce((sum, d) => sum + d.constituencyCount, 0),
            districts
        };
    }

    return null;
}

const KERALA_CONSTITUENCY_RANGES = [
    { districtCode: 'S1101', start: 1, end: 5 },
    { districtCode: 'S1102', start: 6, end: 16 },
    { districtCode: 'S1103', start: 17, end: 19 },
    { districtCode: 'S1104', start: 20, end: 32 },
    { districtCode: 'S1105', start: 33, end: 48 },
    { districtCode: 'S1106', start: 49, end: 60 },
    { districtCode: 'S1107', start: 61, end: 73 },
    { districtCode: 'S1108', start: 74, end: 87 },
    { districtCode: 'S1109', start: 88, end: 92 },
    { districtCode: 'S1110', start: 93, end: 101 },
    { districtCode: 'S1111', start: 102, end: 110 },
    { districtCode: 'S1112', start: 111, end: 115 },
    { districtCode: 'S1113', start: 116, end: 126 },
    { districtCode: 'S1114', start: 127, end: 140 }
];

function loadTamilNaduS22Mapping() {
    try {
        const raw = fs.readFileSync(TAMIL_NADU_S22_MAPPING_FILE, 'utf8');
        const parsed = JSON.parse(stripBom(raw));
        return normalizeTamilNaduS22Mapping(parsed);
    } catch (error) {
        logger.error(`Assembly: Failed to load S22 mapping: ${error.message}`);
        return null;
    }
}

function resolveDistrictCode(stateCode, constituency, district) {
    if (district) {
        return district;
    }

    const acNumber = Number.parseInt(constituency, 10);
    if (!Number.isInteger(acNumber)) {
        return '';
    }

    if (stateCode === 'S11') {
        return KERALA_CONSTITUENCY_RANGES.find((entry) => acNumber >= entry.start && acNumber <= entry.end)?.districtCode || '';
    }

    if (stateCode === 'S22') {
        const mapping = loadTamilNaduS22Mapping();
        if (!mapping) {
            return '';
        }

        return mapping.districts.find((entry) =>
            (entry.constituencies || []).some((item) => Number(item.acNumber) === acNumber)
        )?.districtCode || '';
    }

    return '';
}

const PREVIEW_TTL_MS = 30 * 60 * 1000;
const assemblyPreviewSessions = new Map();

function resolveVoterSlipsDir() {
    const railwayVolume = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data/slips';
    if (fs.existsSync(railwayVolume)) {
        return path.join(railwayVolume, 'voter-slips');
    }
    return path.join(path.dirname(__dirname), 'voter-slips');
}

function resolvePreviewSessionsDir() {
    const dir = path.join(resolveVoterSlipsDir(), '_preview-sessions');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function getPreviewSessionFilePath(previewId) {
    return path.join(resolvePreviewSessionsDir(), `${previewId}.json`);
}

function persistPreviewSession(previewId, entry) {
    try {
        fs.writeFileSync(getPreviewSessionFilePath(previewId), JSON.stringify(entry), 'utf8');
    } catch (error) {
        logger.warn(`Assembly: Failed to persist preview session ${previewId}: ${error.message}`);
    }
}

function readPersistedPreviewSession(previewId) {
    try {
        const filePath = getPreviewSessionFilePath(previewId);
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        logger.warn(`Assembly: Failed to read persisted preview session ${previewId}: ${error.message}`);
        return null;
    }
}

function deletePersistedPreviewSession(previewId) {
    try {
        const filePath = getPreviewSessionFilePath(previewId);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
        logger.warn(`Assembly: Failed to delete persisted preview session ${previewId}: ${error.message}`);
    }
}

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

function createExtractionError(message, statusCode = 500, details = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.details = details;
    return error;
}

function normalizeExtractionError(error) {
    logger.error('Assembly: Error extracting voters:', error);
    logger.error('Assembly: Error stack:', error.stack);

    let statusCode = error.statusCode || 500;
    let errorMessage = 'Failed to extract voter data';
    let errorDetails = error.message;

    if (error.message.includes('Captcha') || error.message.includes('captcha')) {
        statusCode = statusCode || 400;
        errorMessage = 'Invalid captcha. Please try again with correct captcha text.';
    } else if (error.message.includes('PDF')) {
        errorMessage = 'Failed to download or parse PDF files. Please try again.';
    } else if (error.response) {
        logger.error('Assembly: Error response:', error.response.data);
        errorDetails = JSON.stringify(error.response.data);
    } else if (error.statusCode && error.statusCode < 500) {
        errorMessage = error.message;
    }

    return {
        statusCode,
        body: {
            status: 'error',
            message: errorMessage,
            error: errorDetails,
            details: error.details || error.response?.data || error.message
        }
    };
}

function createPreviewSession(payload) {
    const previewId = `asm_${Date.now()}_${crypto.randomUUID()}`;
    const expiresAt = Date.now() + PREVIEW_TTL_MS;

    const entry = {
        payload,
        createdAt: Date.now(),
        expiresAt
    };

    assemblyPreviewSessions.set(previewId, entry);
    persistPreviewSession(previewId, entry);
    schedulePreviewCleanup(previewId);

    return { previewId, expiresAt };
}

function schedulePreviewCleanup(previewId) {
    setTimeout(() => {
        assemblyPreviewSessions.delete(previewId);
        // Keep persisted preview files for order recovery on older orders.
        // This only clears in-memory cache to control memory usage.
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
        const resolvedDistrict = resolveDistrictCode(stateCode, constituency, district);

        if (!stateCode || !year || !rollType || !constituency || !language || !resolvedDistrict) {
            return res.status(400).json({
                status: 'error',
                message: 'All form fields are required'
            });
        }

        logger.info(`Assembly: Generating captcha for AC ${constituency}...`);

        // Step 1: Fetch polling parts using direct API
        logger.info(`Assembly: Fetching polling parts for district ${resolvedDistrict}, AC ${constituency}...`);
        const pollingParts = await getPollingPartsList(stateCode, resolvedDistrict, constituency, rollType, year);
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

async function runExtractionJob(body, progressId) {
    const {
        stateCode,
        year,
        rollType,
        district,
        constituency,
        language,
        captcha,
        captchaId,
        selectedParts = [],
        skipSlipGeneration = false,
        createPreviewSession: shouldCreatePreviewSession = false,
        candidate = { symbol: '', symbolName: '' },
        districtLabel = '',
        constituencyLabel = '',
    } = body;

    const resolvedDistrict = resolveDistrictCode(stateCode, constituency, district);

    // DEBUG: Log what we received
    logger.info('🎯 extractVotersAsync - Received candidate:', {
        candidateKeys: candidate ? Object.keys(candidate) : 'null/undefined',
        hasSymbol: !!candidate?.symbol,
        hasSymbolName: !!candidate?.symbolName,
        hasCandidatePhoto: !!candidate?.candidatePhoto,
        candidatePhotoLength: candidate?.candidatePhoto ? candidate.candidatePhoto.length : 0,
        candidatePhotoStart: candidate?.candidatePhoto ? candidate.candidatePhoto.substring(0, 50) : 'N/A'
    });

    if (!stateCode || !year || !rollType || !constituency || !language || !captcha || !captchaId || !resolvedDistrict) {
        throw createExtractionError('All fields including captcha and captcha ID are required', 400);
    }

    const captchaEntry = captchaStore.get(captchaId);
    logger.info(`Captcha validation: receivedId=${captchaId}, receivedValue=${captcha}`);
    if (!captchaEntry) {
        logger.warn(`Captcha validation failed: captchaId not found or expired. receivedId=${captchaId}`);
        throw createExtractionError('Invalid captcha', 400, 'Captcha mismatch or expired');
    }
    captchaStore.delete(captchaId);

    if (!selectedParts || selectedParts.length === 0) {
        throw createExtractionError('At least one polling part must be selected', 400);
    }

    logger.info(`Assembly: Starting voter extraction for AC ${constituency}`);
    logger.info(`Assembly: Request data - State: ${stateCode}, District: ${resolvedDistrict}, AC: ${constituency}`);
    logger.info(`Assembly: Roll Type: ${rollType}, Year: ${year}, Language: ${language}`);
    logger.info(`Assembly: Captcha ID: ${captchaId}, Selected ${selectedParts.length} polling parts`);
    logger.info(`Assembly: Selected parts: ${JSON.stringify(selectedParts).substring(0, 500)}`);

    const partNumbers = selectedParts.map(part => part.partNumber);
    logger.info(`Assembly: Part Numbers: ${partNumbers.join(', ')}`);

    updateProgress(progressId, {
        status: 'running',
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

    logger.info('Assembly: Requesting PDF generation from ECI API...');

        let pdfResult = await generatePublishedPDFs({
            stateCode,
            districtCode: resolvedDistrict,
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
        let refreshedPdfUrls = false;
        let rollNotFoundOnECI = false;
        
        for (let i = 0; i < pdfResult.pdfUrls.length; i++) {
            let pdfUrl = pdfResult.pdfUrls[i];
            const pdfFileName = `voter-list-${constituency}-${Date.now()}-${i + 1}.pdf`;
            const pdfPath = path.join(pdfDir, pdfFileName);

            let pdfDownloaded = false;
            let downloadAttempts = 0;
            const maxAttempts = 3;

            while (!pdfDownloaded && downloadAttempts < maxAttempts) {
                downloadAttempts++;
                const candidateUrls = (() => {
                    const urls = [pdfUrl];
                    try {
                        const parsed = new URL(pdfUrl);
                        const p = parsed.pathname || '';
                        const nakedPath = p.startsWith('/eroll/') ? p.slice('/eroll'.length) : p;
                        const erollPath = p.startsWith('/eroll/') ? p : `/eroll${p.startsWith('/') ? p : `/${p}`}`;

                        // Keep URL candidates aligned with the direct public ECI PDF host.
                        urls.push(`${parsed.protocol}//voters.eci.gov.in${erollPath}`);
                        urls.push(`${parsed.protocol}//voters.eci.gov.in${nakedPath.startsWith('/') ? nakedPath : `/${nakedPath}`}`);
                    } catch (_error) {
                        // Keep original URL if parsing fails.
                    }
                    return Array.from(new Set(urls.filter(Boolean)));
                })();

                try {
                    const eciCookieHeader = pdfResult?.downloadContext?.cookieHeader || '';
                    let response = null;
                    let lastCandidateError = null;
                    for (const candidateUrl of candidateUrls) {
                        try {
                            logger.info(`Assembly: Downloading PDF ${i + 1}/${pdfResult.pdfUrls.length} (Attempt ${downloadAttempts}) from ${candidateUrl}...`);
                            const stateParam = encodeURIComponent(String(stateCode || '').toUpperCase());
                            const downloadPageUrl = `https://voters.eci.gov.in/download-eroll?stateCode=${stateParam}`;
                            response = await axios.get(candidateUrl, {
                                responseType: 'arraybuffer',
                                timeout: 60000,
                                headers: {
                                    'Accept': '*/*',
                                    'Accept-Language': 'en-US,en;q=0.9',
                                    'Accept-Encoding': 'gzip, deflate, br',
                                    'Referer': downloadPageUrl,
                                    'Origin': 'https://voters.eci.gov.in',
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                                    'Connection': 'keep-alive',
                                    'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                                    'sec-ch-ua-mobile': '?0',
                                    'sec-ch-ua-platform': '"Windows"',
                                    'sec-fetch-dest': 'empty',
                                    'sec-fetch-mode': 'cors',
                                    'sec-fetch-site': 'same-origin',
                                    ...(eciCookieHeader ? { 'Cookie': eciCookieHeader } : {})
                                }
                            });

                            const payloadBuffer = Buffer.from(response.data);
                            const pdfHeader = payloadBuffer.subarray(0, 5).toString('ascii');
                            const contentType = String(response?.headers?.['content-type'] || '').toLowerCase();
                            if (!contentType.includes('application/pdf') || pdfHeader !== '%PDF-') {
                                throw new Error(`Non-PDF payload received (content-type: ${contentType || 'unknown'}, header: ${pdfHeader || 'empty'})`);
                            }

                            response.data = payloadBuffer;
                            pdfUrl = candidateUrl;
                            break;
                        } catch (candidateError) {
                            lastCandidateError = candidateError;
                        }
                    }

                    if (!response) {
                        throw lastCandidateError || new Error('PDF download failed for all candidate URLs');
                    }

                    fs.writeFileSync(pdfPath, response.data);
                    
                    const stats = fs.statSync(pdfPath);
                    logger.info(`Assembly: PDF ${i + 1} downloaded successfully - ${(stats.size / 1024).toFixed(2)} KB`);
                    logger.info(`Assembly: PDF saved to: ${pdfPath}`);

                    if (stats.size === 0) {
                        logger.warn(`Assembly: PDF ${i + 1} is empty, skipping...`);
                        break;
                    }

                    downloadedPDFs.push(pdfPath);

                    updateProgress(progressId, {
                        pdfDownloaded: downloadedPDFs.length,
                        pdfSizeKB: Math.round(stats.size / 1024),
                        stageLabel: `Downloaded PDF ${downloadedPDFs.length}/${pdfResult.pdfUrls.length} (${(stats.size / 1024).toFixed(0)} KB)`,
                        percent: 15 + Math.round((downloadedPDFs.length / pdfResult.pdfUrls.length) * 25)
                    });
                    
                    pdfDownloaded = true;
                    // Log the file path for debugging/preview
                    logger.info(`Assembly: ✅ PDF available at: file:///${pdfPath.replace(/\\/g, '/')}`);
                } catch (downloadError) {
                    logger.error(`Assembly: Failed to download PDF ${i + 1} on attempt ${downloadAttempts}:`, downloadError.message);

                    const statusCode = downloadError?.response?.status;
                    const is404 = statusCode === 404;
                    if (is404) {
                        rollNotFoundOnECI = true;
                    }

                    if (statusCode === 401 || statusCode === 403 || !statusCode) {
                        try {
                            logger.warn(`Assembly: Axios failed with status ${statusCode || 'unknown'}. Trying browser-session fallback...`);
                            const fallbackResult = await downloadPdfWithPlaywright(
                                candidateUrls,
                                pdfPath,
                                stateCode,
                                pdfResult?.downloadContext?.cookieHeader || ''
                            );

                            const stats = fs.statSync(pdfPath);
                            if (!stats.size) {
                                throw new Error('Browser fallback downloaded empty PDF');
                            }

                            logger.info(`Assembly: Browser fallback succeeded from ${fallbackResult.sourceUrl} - ${(stats.size / 1024).toFixed(2)} KB`);
                            downloadedPDFs.push(pdfPath);

                            updateProgress(progressId, {
                                pdfDownloaded: downloadedPDFs.length,
                                pdfSizeKB: Math.round(stats.size / 1024),
                                stageLabel: `Downloaded PDF ${downloadedPDFs.length}/${pdfResult.pdfUrls.length} (${(stats.size / 1024).toFixed(0)} KB)`,
                                percent: 15 + Math.round((downloadedPDFs.length / pdfResult.pdfUrls.length) * 25)
                            });

                            pdfDownloaded = true;
                            logger.info(`Assembly: ✅ PDF available at: file:///${pdfPath.replace(/\\/g, '/')}`);
                            continue;
                        } catch (browserFallbackError) {
                            logger.error(`Assembly: Browser fallback failed: ${browserFallbackError.message}`);
                        }
                    }

                    if (is404 && !refreshedPdfUrls) {
                        try {
                            logger.info('Assembly: PDF URL returned 404. Refreshing PDF URLs from ECI and retrying...');
                            pdfResult = await generatePublishedPDFs({
                                stateCode,
                                districtCode: resolvedDistrict,
                                acNumber: constituency,
                                rollType,
                                year,
                                language,
                                partNumbers,
                                captcha,
                                captchaId
                            });
                            if (Array.isArray(pdfResult?.pdfUrls) && pdfResult.pdfUrls[i]) {
                                pdfUrl = pdfResult.pdfUrls[i];
                                refreshedPdfUrls = true;
                                continue;
                            }
                        } catch (refreshError) {
                            logger.error(`Assembly: Failed to refresh PDF URLs: ${refreshError.message}`);
                        }
                    }

                    if (downloadAttempts < maxAttempts) {
                        const delayMs = downloadAttempts * 2500; // 2.5s, 5s delay
                        logger.info(`Assembly: Waiting ${delayMs}ms before retrying...`);
                        await new Promise(res => setTimeout(res, delayMs));
                    }
                }
            }
        }

        if (downloadedPDFs.length === 0) {
            if (rollNotFoundOnECI) {
                throw createExtractionError('Electoral Roll Not Found in ECI website Please try again later.', 404);
            }
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

        // Generate voter information slips with embedded images (unless skipped)
        let slipFileInfo = null;
        if (!skipSlipGeneration) {
            try {
                logger.info('Assembly: Generating voter information slips with images...');
                slipFileInfo = await saveVoterSnippetSlipsToFile(allVoterSnippets, {
                    constituency,
                    district,
                    districtLabel,
                    constituencyLabel,
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
                logger.info(`Assembly: voter information slips generated: ${slipFileInfo.htmlFileName || 'no-html'} and ${slipFileInfo.pdfFileName || 'no-pdf'}`);

                // Upload full PDF to Google Drive immediately so link is ready when order is paid
                if (slipFileInfo?.pdfFullPath) {
                    try {
                        const { uploadToGoogleDrive, isGoogleDriveConfigured } = await import('../utils/googleDrive.js');
                        if (isGoogleDriveConfigured()) {
                            logger.info(`📤 Assembly: Uploading full PDF to Google Drive: ${slipFileInfo.pdfFileName}`);
                            const driveLink = await uploadToGoogleDrive(slipFileInfo.pdfFullPath, slipFileInfo.pdfFileName?.replace('.pdf', ''));
                            if (driveLink) {
                                logger.info(`✅ Assembly: Google Drive upload successful: ${driveLink}`);
                                slipFileInfo.googleDriveLink = driveLink;
                            } else {
                                logger.warn('⚠️ Assembly: Google Drive upload returned no link');
                            }
                        } else {
                            logger.info('ℹ️ Assembly: Google Drive not configured, skipping upload');
                        }
                    } catch (driveErr) {
                        logger.warn(`⚠️ Assembly: Google Drive upload failed: ${driveErr.message}`);
                    }
                }
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
        let previewSlipFileInfo = null;
        if (shouldCreatePreviewSession) {
            const previewVoters = allVoterSnippets.slice(0, 10);

            // DEBUG: Log what will be stored in preview
            logger.info('💾 Creating preview session with candidate:', {
                candidateKeys: candidate ? Object.keys(candidate) : 'null',
                hasCandidatePhoto: !!candidate?.candidatePhoto,
                photoLength: candidate?.candidatePhoto ? candidate.candidatePhoto.length : 0
            });

            previewSessionInfo = createPreviewSession({
                orderId: `ASM-${Date.now()}`,
                // Preview needs only first 10 voters (2 pages at 5 slips/page).
                voters: previewVoters,
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

            // Generate and persist preview PDF once, then serve via stored DB URL.
            try {
                previewSlipFileInfo = await saveVoterSnippetSlipsToFile(previewVoters, {
                    constituency,
                    district,
                    districtLabel,
                    constituencyLabel,
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
                logger.info(`Assembly: Preview PDF generated: ${previewSlipFileInfo?.pdfFileName || 'none'}`);
            } catch (previewSlipError) {
                logger.warn(`Assembly: Preview PDF generation failed: ${previewSlipError.message}`);
            }
        }

        // Send response
        updateProgress(progressId, {
            stage: 'complete',
            stageLabel: `Done! ${allVoterSnippets.length} voters extracted`,
            votersExtracted: allVoterSnippets.length,
            percent: 100
        });
        cleanupProgress(progressId);

    return {
        success: true,
        status: 'success',
        data: {
            totalVoters: allVoterSnippets.length,
            voters: shouldCreatePreviewSession ? [] : allVoterSnippets,
            voterImages: allVoterSnippets.length,
            pdfUrls: pdfResult.pdfUrls,
            downloadedPdfPaths: downloadedPDFs,
            slipFile: slipFileInfo?.fileName ? `/voter-slips/${slipFileInfo.fileName}` : null,
            slipFileHtml: slipFileInfo?.htmlFileName ? `/voter-slips/${slipFileInfo.htmlFileName}` : null,
            slipFilePdf: slipFileInfo?.pdfFileName ? `/voter-slips/${slipFileInfo.pdfFileName}` : null,
            slipFilePdfDriveLink: slipFileInfo?.googleDriveLink || null,
            previewSlipFilePdf: previewSlipFileInfo?.pdfFileName ? `/voter-slips/${previewSlipFileInfo.pdfFileName}` : null,
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
}

/**
 * Extract voters using Direct ECI API
 */
export const extractVoters = async (req, res) => {
    const progressId = req.body?.captchaId || `asm_${Date.now()}_${crypto.randomUUID()}`;
    try {
        const responseData = await runExtractionJob(req.body, progressId);
        cleanupProgress(progressId);
        return res.json(responseData);
    } catch (error) {
        const normalized = normalizeExtractionError(error);
        cleanupProgress(progressId);
        return res.status(normalized.statusCode).json(normalized.body);
    }
};

export const extractVotersAsync = async (req, res) => {
    const progressId = req.body?.captchaId || `asm_${Date.now()}_${crypto.randomUUID()}`;

    updateProgress(progressId, {
        status: 'queued',
        stage: 'queued',
        stageLabel: 'Preparing extraction job...',
        percent: 1,
        totalParts: Array.isArray(req.body?.selectedParts) ? req.body.selectedParts.length : 0,
        votersExtracted: 0,
        pdfDownloaded: 0,
        pdfTotal: 0,
        pdfSizeKB: 0
    });

    setImmediate(async () => {
        try {
            const responseData = await runExtractionJob(req.body, progressId);
            updateProgress(progressId, {
                status: 'complete',
                stage: 'complete',
                stageLabel: responseData.message,
                votersExtracted: responseData.data?.totalVoters || 0,
                percent: 100,
                result: responseData
            });
        } catch (error) {
            const normalized = normalizeExtractionError(error);
            updateProgress(progressId, {
                status: 'error',
                stage: 'failed',
                stageLabel: normalized.body.message,
                errorMessage: normalized.body.message,
                error: normalized.body.error,
                details: normalized.body.details,
                percent: 100
            });
        } finally {
            cleanupProgress(progressId);
        }
    });

    return res.status(202).json({
        status: 'accepted',
        progressId,
        message: 'Extraction started'
    });
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

        let entry = assemblyPreviewSessions.get(previewId);
        if (!entry) {
            entry = readPersistedPreviewSession(previewId);
            if (entry) {
                assemblyPreviewSessions.set(previewId, entry);
            }
        }

        if (!entry) {
            return res.status(404).json({
                status: 'error',
                message: 'Preview data not found or expired'
            });
        }

        if (Date.now() > entry.expiresAt) {
            logger.info(`Assembly: Serving persisted preview ${previewId} after TTL for order preview recovery`);
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

    let entry = assemblyPreviewSessions.get(previewId);
    if (!entry) {
        entry = readPersistedPreviewSession(previewId);
        if (entry) {
            assemblyPreviewSessions.set(previewId, entry);
        }
    }

    if (!entry) {
        return null;
    }

    if (Date.now() > entry.expiresAt) {
        logger.info(`Assembly: Using persisted preview payload ${previewId} after TTL`);
    }

    return entry.payload;
};

export default {
    healthCheck,
    getCaptcha,
    extractVotersAsync,
    extractVoters,
    storePreviewData,
    getPreviewData,
    getPreviewPayloadById
};
