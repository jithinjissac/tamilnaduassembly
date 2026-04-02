/**
 * Direct API Client for ECI Portal
 * Uses the actual API endpoints discovered from network monitoring
 * Base URL: https://gateway-voters.eci.gov.in
 */

import axios from 'axios';
import { logger } from './logger.js';

const BASE_URL = 'https://gateway-voters.eci.gov.in';

const DEFAULT_ROLL_TYPE_REF_ID = 'S11-2026-FIR-2';

function normalizeRollTypeRefId(rollType, stateCode, year) {
    if (typeof rollType === 'string' && /^S\d+-\d{4}-[A-Z]+-\d+$/i.test(rollType)) {
        return rollType;
    }

    if (rollType === 'SIR-FinalRoll' || rollType === 'FinalRoll') {
        return `${stateCode}-${year}-FIR-2`;
    }

    if (rollType === 'SupplementRoll') {
        return `${stateCode}-${year}-SUP-1`;
    }

    return rollType || DEFAULT_ROLL_TYPE_REF_ID;
}

function extractRevisionNo(rollTypeRefId, fallback = 2) {
    const match = String(rollTypeRefId || '').match(/-(\d+)$/);
    return match ? Number(match[1]) : fallback;
}

// Common headers required by ECI API (verified from working curl command)
const getHeaders = () => ({
    'Accept': '*/*',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'Content-Type': 'application/json',
    'Origin': 'https://voters.eci.gov.in',
    'Referer': 'https://voters.eci.gov.in/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    'applicationname': 'VSP',
    'channelidobo': 'VSP',
    'platform-type': 'ECIWEB',
    'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site'
});

/**
 * Generate captcha 
 * GET /api/v1/captcha-service/generateCaptcha/EROLL
 */
export const generateCaptcha = async () => {
    try {
        logger.info('📸 Generating captcha from ECI API...');
        
        const response = await axios.get(
            `${BASE_URL}/api/v1/captcha-service/generateCaptcha/EROLL`,
            { headers: getHeaders() }
        );
        
        if (response.data && response.data.status === 'Success') {
            logger.info('✅ Captcha generated successfully');
            return {
                captchaImage: response.data.captcha,
                captchaId: response.data.id
            };
        }
        
        throw new Error('Failed to generate captcha');
    } catch (error) {
        logger.error('❌ Captcha generation failed:', error.message);
        throw error;
    }
};

/**
 * Get roll types for state and year
 * GET /api/v1/printing-publish/get-publish-eroll-type?stateCd={stateCd}&year={year}
 */
export const getRollTypes = async (stateCode, year) => {
    try {
        logger.info(`🔍 Fetching roll types for ${stateCode}, ${year}...`);
        
        const response = await axios.get(
            `${BASE_URL}/api/v1/printing-publish/get-publish-eroll-type`,
            {
                params: { stateCd: stateCode, year },
                headers: getHeaders()
            }
        );
        
        if (response.data && response.data.status === 'Success') {
            const rollTypes = response.data.payload.map(item => ({
                code: item.id || item.rollTypeRefId,
                name: item.displayName || item.id,  // Use displayName (e.g., "SIR FinalRoll - 2026")
                rollType: item.rollType,  // FinalRoll/DraftRoll
                rollTypeRefId: item.rollTypeRefId,  // e.g. S11-2026-FIR-2
                stateCd: item.stateCd,
                year: item.year,
                revisionNo: item.revisionNo
            }));
            
            logger.info(`✅ Found ${rollTypes.length} roll types`);
            return rollTypes;
        }
        
        throw new Error('Failed to fetch roll types');
    } catch (error) {
        logger.error('❌ Roll types fetch failed:', error.message);
        throw error;
    }
};

/**
 * Get languages for assembly constituency
 * POST /api/v1/printing-publish/get-ac-languages
 * Body should contain: { stateCd, districtCd, acNumber, rollType, year }
 */
export const getACLanguages = async (stateCode, districtCode, acNumber, rollType, year) => {
    try {
        logger.info(`🗣️  Fetching languages for AC ${acNumber}...`);
        
        const response = await axios.post(
            `${BASE_URL}/api/v1/printing-publish/get-ac-languages`,
            {
                stateCd: stateCode,
                districtCd: districtCode,
                acNumber: parseInt(acNumber),
                rollType,
                year: parseInt(year)
            },
            { headers: getHeaders() }
        );
        
        if (response.data && response.data.status === 'Success') {
            const languages = Object.entries(response.data.payload).map(([code, name]) => ({
                code,
                name
            }));
            
            logger.info(`✅ Found ${languages.length} languages`);
            return languages;
        }
        
        throw new Error('Failed to fetch languages');
    } catch (error) {
        logger.error('❌ Languages fetch failed:', error.message);
        throw error;
    }
};

/**
 * Get polling parts list for assembly constituency
 * POST /api/v1/printing-publish/get-publish-part-list
 * Body: { stateCd, districtCd, acNumber, rollType, year }
 */
export const getPollingPartsList = async (stateCode, districtCode, acNumber, rollType, year) => {
    try {
        logger.info(`📋 Fetching polling parts for AC ${acNumber}...`);
        const rollTypeRefId = normalizeRollTypeRefId(rollType, stateCode, year);
        const revisionNo = extractRevisionNo(rollTypeRefId);
        
        const requestBody = {
            stateCd: stateCode,
            acNumber: parseInt(acNumber),
            rollTypeRefId,
            pdfGenType: 'EROLLGEN',
            revisionNo,
            year: parseInt(year)
        };
        
        logger.info(`📤 Request body: ${JSON.stringify(requestBody)}`);
        
        const response = await axios.post(
            `${BASE_URL}/api/v1/printing-publish/get-publish-part-list`,
            requestBody,
            { headers: getHeaders() }
        );
        
        logger.info(`📥 Response status: ${response.data?.status}`);
        logger.info(`📥 Response data: ${JSON.stringify(response.data).substring(0, 500)}`);
        
        if (response.data && response.data.status === 'Success') {
            // ✅ FIXED: API returns data in "payload" array, not "response.partInfo"
            const partInfo = response.data.payload || [];
            const parts = partInfo.map(part => ({
                partId: part.partId,
                partNumber: part.partNumber,
                partName: part.partName || part.partname,
                districtCd: part.districtCd,
                stateCd: part.stateCd,
                acNumber: part.acNumber
            }));
            
            logger.info(`✅ Found ${parts.length} polling parts`);
            return parts;
        }
        
        logger.warn(`⚠️ API returned status: ${response.data?.status}, message: ${response.data?.message || 'none'}`);
        return []; // Return empty array instead of throwing error
    } catch (error) {
        logger.error('❌ Polling parts fetch failed:', error.message);
        if (error.response) {
            logger.error(`   Status: ${error.response.status}`);
            logger.error(`   Data: ${JSON.stringify(error.response.data)}`);
        }
        return []; // Return empty array instead of throwing error
    }
};

/**
 * Generate PDF for specific parts
 * POST /api/v1/printing-publish/generate-published-pdfs
 * Body: { stateCd, districtCd, acNumber, rollType, year, language, partIds: [], captchaText, captchaId }
 */
export const generatePublishedPDFs = async (payload) => {
    try {
        const { stateCode, districtCode, acNumber, rollType, year, language, partNumbers, captcha, captchaId } = payload;
        
        logger.info(`📄 Generating PDFs for ${partNumbers.length} parts...`);
        logger.info(`   State: ${stateCode}, District: ${districtCode}, AC: ${acNumber}`);
        logger.info(`   Roll Type: ${rollType}, Year: ${year}, Language: ${language}`);
        logger.info(`   Captcha ID: ${captchaId}, Captcha Text: ${captcha}`);
        logger.info(`   Part Numbers: ${partNumbers.join(', ')}`);
        
        const publishedRollId = normalizeRollTypeRefId(rollType, stateCode, year);
        
        // Language code mapping - For Kerala (S11), use MAL
        // ECI accepts specific language codes per state
        let langCode = 'MAL';  // Default to Malayalam for Kerala
        
        if (language === 'en' && stateCode === 'S11') {
            langCode = 'MAL';  // Kerala only accepts MAL
        } else if (language === 'ml' || language === 'mal') {
            langCode = 'MAL';
        } else {
            // Other states might have different codes
            const langCodeMap = {
                'hi': 'HIN',
                'ta': 'TAM',
                'te': 'TEL',
                'kn': 'KAN',
                'ur': 'URD'
            };
            langCode = langCodeMap[language] || 'MAL';
        }
        
        const requestBody = {
            stateCd: stateCode,
            acNumber: parseInt(acNumber),
            partNumberList: partNumbers,  // Correct field name
            districtCd: "",                // Empty string
            captcha: captcha,
            captchaId: captchaId,
            langCd: langCode,              // Use uppercase language code
            publishedRollId: publishedRollId  // Format: S11-2026-FIR
        };
        
        logger.info(`   Published Roll ID: ${publishedRollId}, Lang Code: ${langCode}`);
        logger.info(`📤 Request body: ${JSON.stringify(requestBody)}`);
        
        const response = await axios.post(
            `${BASE_URL}/api/v1/printing-publish/generate-published-pdfs`,
            requestBody,
            { headers: getHeaders() }
        );
        
        logger.info(`📥 Response status: ${response.data?.status}`);
        logger.info(`📥 Full Response: ${JSON.stringify(response.data)}`);
        
        if (response.data && response.data.status === 'Success') {
            // Try different response structures
            let pdfPaths = response.data.payload || response.data.response?.pdfPaths || response.data.file || [];
            
            logger.info(`📄 PDF paths type: ${typeof pdfPaths}, isArray: ${Array.isArray(pdfPaths)}`);
            logger.info(`📄 PDF paths raw: ${JSON.stringify(pdfPaths)}`);
            
            // Handle if it's a single file instead of array
            if (!Array.isArray(pdfPaths)) {
                if (typeof pdfPaths === 'string') {
                    pdfPaths = [pdfPaths];
                } else if (pdfPaths && typeof pdfPaths === 'object') {
                    // Might be an object with file path
                    pdfPaths = [pdfPaths.path || pdfPaths.url || pdfPaths.file || JSON.stringify(pdfPaths)];
                } else {
                    pdfPaths = [];
                }
            }
            
            if (pdfPaths.length === 0) {
                logger.error('⚠️ No PDF paths in response');
                logger.error('⚠️ Response payload:', response.data.payload);
                logger.error('⚠️ Response file:', response.data.file);
                throw new Error('No PDF paths returned from API');
            }
            
            logger.info(`✅ Generated ${pdfPaths.length} PDFs`);
            
            // Convert relative paths to full URLs
            // PDFs are hosted on voters.eci.gov.in under /eroll/ path
            const pdfUrls = pdfPaths.map(path => {
                if (typeof path !== 'string') {
                    logger.warn(`Non-string PDF path: ${JSON.stringify(path)}`);
                    return null;
                }
                
                // Handle different path formats
                if (path.startsWith('http')) {
                    return path;
                } else if (path.startsWith('/')) {
                    return `https://voters.eci.gov.in${path}`;
                } else {
                    // API returns relative paths like "2026/s11/sir-finalroll/138/..."
                    // Need to prepend /eroll/
                    return `https://voters.eci.gov.in/eroll/${path}`;
                }
            }).filter(url => url !== null);
            
            logger.info(`📎 PDF URLs: ${pdfUrls.join(', ')}`);
            
            return {
                status: 'success',
                refId: response.data.refId,
                pdfUrls,
                pdfPaths
            };
        }
        
        logger.error(`❌ API returned failed status: ${response.data?.status}`);
        logger.error(`   Message: ${response.data?.message || 'none'}`);
        throw new Error(response.data?.message || 'Failed to generate PDFs');
    } catch (error) {
        logger.error('❌ PDF generation failed:', error.message);
        if (error.response) {
            logger.error('   Status:', error.response.status);
            logger.error('   Data:', JSON.stringify(error.response.data));
        }
        throw error;
    }
};

/**
 * Get complete workflow data for a constituency
 * This is a convenience method that fetches all related data
 */
export const getConstituencyData = async (stateCode, districtCode, acNumber, rollType, year) => {
    try {
        logger.info(`🔄 Fetching complete data for AC ${acNumber}...`);
        
        // Fetch languages and parts in parallel
        const [languages, parts] = await Promise.all([
            getACLanguages(stateCode, districtCode, acNumber, rollType, year),
            getPollingPartsList(stateCode, districtCode, acNumber, rollType, year)
        ]);
        
        logger.info('✅ Complete constituency data fetched');
        
        return {
            acNumber,
            districtCode,
            stateCode,
            year,
            rollType,
            languages,
            parts,
            totalParts: parts.length
        };
    } catch (error) {
        logger.error('❌ Failed to fetch constituency data:', error.message);
        throw error;
    }
};

export default {
    generateCaptcha,
    getRollTypes,
    getACLanguages,
    getPollingPartsList,
    generatePublishedPDFs,
    getConstituencyData
};
