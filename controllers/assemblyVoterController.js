import { logger } from '../utils/logger.js';
import { captureECICaptcha, fillECIForm } from '../utils/eciPlaywright.js';
import { parsePDFVoterData } from '../utils/pdfParser.js';

/**
 * Get captcha image from ECI portal
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

        // Launch browser and capture captcha
        const { captchaPath, sessionId, pollingParts } = await captureECICaptcha({
            stateCode,
            year,
            rollType,
            district,
            constituency,
            language
        });

        res.json({
            status: 'success',
            captchaUrl: `/captcha-cache/${captchaPath}`,
            sessionId,
            pollingParts,
            message: 'Captcha captured successfully'
        });

        logger.info(`Assembly: Captcha captured for session ${sessionId} with ${pollingParts.length} parts`);
    } catch (error) {
        logger.error('Assembly: Error capturing captcha:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to capture captcha',
            error: error.message
        });
    }
};

/**
 * Download and extract voter data from ECI portal
 */
export const extractVoters = async (req, res) => {
    try {
        const {
            stateCode,
            year,
            rollType,
            district,
            constituency,
            language,
            captcha,
            sessionId,
            selectAll = true,
            selectedParts = [] // Array of part indices to select
        } = req.body;

        // Validate required fields
        if (!stateCode || !year || !rollType || !district || !constituency || !language || !captcha || !sessionId) {
            return res.status(400).json({
                status: 'error',
                message: 'All fields including captcha and session ID are required'
            });
        }

        logger.info(`Assembly: Starting voter extraction for AC ${constituency}`);
        logger.info(`Assembly: Selection mode - ${selectAll ? 'All parts' : `${selectedParts.length} specific parts`}`);

        // Step 1: Submit form and download PDF (with polling parts selection)
        const pdfPath = await fillECIForm({
            sessionId,
            captcha,
            selectAll,
            selectedParts
        });

        logger.info(`Assembly: PDF downloaded to ${pdfPath}`);

        // Check if PDF exists and has content
        const fs = await import('fs');
        const stats = fs.statSync(pdfPath);
        if (stats.size === 0) {
            throw new Error('Downloaded PDF is empty');
        }

        logger.info(`Assembly: PDF size: ${(stats.size / 1024).toFixed(2)} KB`);

        // Step 2: Parse PDF to extract voter data
        const voters = await parsePDFVoterData(pdfPath);

        logger.info(`Assembly: Extracted ${voters.length} voters from PDF`);

        // Step 3: Structure the data
        const result = {
            status: 'success',
            data: {
                constituency,
                district,
                stateCode,
                year,
                rollType,
                language,
                totalVoters: voters.length,
                voters,
                extractedAt: new Date().toISOString(),
                source: 'ECI Portal'
            }
        };

        res.json(result);

        logger.info(`Assembly: Successfully returned ${voters.length} voters`);
    } catch (error) {
        logger.error('Assembly: Error extracting voters:', error);
        
        // Check for specific error types
        if (error.message.includes('captcha') || error.message.includes('Captcha')) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid captcha. Please try again.',
                error: error.message,
                hint: 'The captcha entered may be incorrect or expired. Please load a new captcha.'
            });
        }

        if (error.message.includes('timeout') || error.message.includes('Timeout')) {
            return res.status(408).json({
                status: 'error',
                message: 'Request timeout. The ECI portal may be slow. Please try again.',
                error: error.message
            });
        }

        if (error.message.includes('Session expired')) {
            return res.status(400).json({
                status: 'error',
                message: 'Session expired. Please load a new captcha.',
                error: error.message
            });
        }

        if (error.message.includes('Download button not found')) {
            return res.status(500).json({
                status: 'error',
                message: 'Could not find download button. The ECI portal structure may have changed.',
                error: error.message
            });
        }

        res.status(500).json({
            status: 'error',
            message: 'Failed to extract voter data',
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * Health check endpoint for assembly module
 */
export const healthCheck = async (req, res) => {
    res.json({
        status: 'success',
        module: 'Assembly Elections',
        source: 'ECI Portal',
        message: 'Assembly election module is running'
    });
};

export default {
    getCaptcha,
    extractVoters,
    healthCheck
};
