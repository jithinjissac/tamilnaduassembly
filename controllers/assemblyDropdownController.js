import { logger } from '../utils/logger.js';
import {
    fetchYearsFromECI,
    fetchRollTypesFromECI,
    fetchDistrictsFromECI,
    fetchConstituenciesFromECI,
    fetchLanguagesFromECI,
    discoverECIEndpoints
} from '../utils/eciApiClient.js';

// Base URL for ECI portal
const ECI_BASE_URL = 'https://voters.eci.gov.in';

// Cache for dropdown data to reduce ECI portal requests
const cache = {
    years: null,
    rollTypes: {},
    districts: null,
    constituencies: {},
    languages: null,
    lastUpdated: null,
    cacheDuration: 3600000 // 1 hour
};

/**
 * Get list of states from ECI portal
 */
export const getStates = async (req, res) => {
    try {
        logger.info('Assembly: Fetching states from ECI portal...');
        
        // For now, we'll use Playwright to extract states
        // ECI typically shows all Indian states
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(`${ECI_BASE_URL}/download-eroll`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        const states = await page.evaluate(() => {
            const stateSelect = document.querySelector('select[aria-label="Select State"]');
            if (!stateSelect) return [];
            
            return Array.from(stateSelect.querySelectorAll('option'))
                .filter(opt => opt.value && opt.value !== '')
                .map(opt => ({
                    value: opt.value,
                    text: opt.textContent.trim()
                }));
        });

        await browser.close();

        if (states.length === 0) {
            throw new Error('No states found on ECI portal');
        }

        res.json({
            status: 'success',
            states
        });

        logger.info(`Assembly: Fetched ${states.length} states from ECI`);
    } catch (error) {
        logger.error('Assembly: Error fetching states from ECI:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch states from ECI portal',
            error: error.message
        });
    }
};

/**
 * Get available years of revision from ECI portal (NO FALLBACK)
 */
export const getYears = async (req, res) => {
    try {
        const { stateCode } = req.body;

        if (!stateCode) {
            return res.status(400).json({
                status: 'error',
                message: 'State code is required'
            });
        }

        // Check cache first
        const now = Date.now();
        if (cache.years && cache.lastUpdated && (now - cache.lastUpdated) < cache.cacheDuration) {
            logger.info('Assembly: Returning cached years');
            return res.json({
                status: 'success',
                years: cache.years
            });
        }

        // Fetch years from ECI portal
        logger.info('Assembly: Fetching years from ECI portal...');
        const years = await fetchYearsFromECI(stateCode);

        if (years.length === 0) {
            return res.status(500).json({
                status: 'error',
                message: 'No years found on ECI portal'
            });
        }

        cache.years = years;
        cache.lastUpdated = now;
        logger.info(`Assembly: Fetched ${years.length} years from ECI`);

        res.json({
            status: 'success',
            years
        });
    } catch (error) {
        logger.error('Assembly: Error fetching years from ECI:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch years from ECI portal',
            error: error.message
        });
    }
};

/**
 * Get available roll types from ECI portal (NO FALLBACK)
 */
export const getRollTypes = async (req, res) => {
    try {
        const { stateCode, year } = req.body;

        if (!stateCode || !year) {
            return res.status(400).json({
                status: 'error',
                message: 'State code and year are required'
            });
        }

        // Check cache
        const cacheKey = `${stateCode}-${year}`;
        if (cache.rollTypes[cacheKey]) {
            logger.info('Assembly: Returning cached roll types');
            return res.json({
                status: 'success',
                rollTypes: cache.rollTypes[cacheKey]
            });
        }

        // Fetch roll types from ECI portal
        logger.info('Assembly: Fetching roll types from ECI portal...');
        const rollTypes = await fetchRollTypesFromECI(stateCode, year);

        if (rollTypes.length === 0) {
            return res.status(500).json({
                status: 'error',
                message: 'No roll types found on ECI portal'
            });
        }

        cache.rollTypes[cacheKey] = rollTypes;
        logger.info(`Assembly: Fetched ${rollTypes.length} roll types from ECI`);

        res.json({
            status: 'success',
            rollTypes
        });
    } catch (error) {
        logger.error('Assembly: Error fetching roll types from ECI:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch roll types from ECI portal',
            error: error.message
        });
    }
};

/**
 * Get districts for selected state from ECI portal (NO FALLBACK)
 */
export const getDistricts = async (req, res) => {
    try {
        const { stateCode } = req.body;

        if (!stateCode) {
            return res.status(400).json({
                status: 'error',
                message: 'State code is required'
            });
        }

        // Check cache
        if (cache.districts) {
            logger.info('Assembly: Returning cached districts');
            return res.json({
                status: 'success',
                districts: cache.districts
            });
        }

        // Fetch districts from ECI portal
        logger.info('Assembly: Fetching districts from ECI portal...');
        const districts = await fetchDistrictsFromECI(stateCode);

        if (districts.length === 0) {
            return res.status(500).json({
                status: 'error',
                message: 'No districts found on ECI portal'
            });
        }

        cache.districts = districts;
        logger.info(`Assembly: Fetched ${districts.length} districts from ECI`);

        res.json({
            status: 'success',
            districts
        });
    } catch (error) {
        logger.error('Assembly: Error fetching districts from ECI:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch districts from ECI portal',
            error: error.message
        });
    }
};

/**
 * Get Assembly Constituencies for selected district from ECI portal (NO FALLBACK)
 */
export const getAssemblyConstituencies = async (req, res) => {
    try {
        const { stateCode, district } = req.body;

        if (!stateCode || !district) {
            return res.status(400).json({
                status: 'error',
                message: 'State code and district are required'
            });
        }

        // Check cache
        const cacheKey = `${stateCode}-${district}`;
        if (cache.constituencies[cacheKey]) {
            logger.info('Assembly: Returning cached constituencies');
            return res.json({
                status: 'success',
                constituencies: cache.constituencies[cacheKey]
            });
        }

        // Fetch constituencies from ECI portal
        logger.info('Assembly: Fetching constituencies from ECI portal...');
        const constituencies = await fetchConstituenciesFromECI(stateCode, district);

        if (constituencies.length === 0) {
            return res.status(500).json({
                status: 'error',
                message: 'No constituencies found on ECI portal for this district'
            });
        }

        cache.constituencies[cacheKey] = constituencies;
        logger.info(`Assembly: Fetched ${constituencies.length} constituencies from ECI`);

        res.json({
            status: 'success',
            constituencies
        });
    } catch (error) {
        logger.error('Assembly: Error fetching constituencies from ECI:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch constituencies from ECI portal',
            error: error.message
        });
    }
};

/**
 * Get available languages from ECI portal (NO FALLBACK)
 */
export const getLanguages = async (req, res) => {
    try {
        // Check cache
        if (cache.languages) {
            logger.info('Assembly: Returning cached languages');
            return res.json({
                status: 'success',
                languages: cache.languages
            });
        }

        // Fetch languages from ECI portal
        logger.info('Assembly: Fetching languages from ECI portal...');
        const languages = await fetchLanguagesFromECI();

        cache.languages = languages;
        logger.info(`Assembly: Fetched ${languages.length} languages from ECI`);

        res.json({
            status: 'success',
            languages
        });
    } catch (error) {
        logger.error('Assembly: Error fetching languages from ECI:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch languages from ECI portal',
            error: error.message
        });
    }
};

export default {
    getStates,
    getYears,
    getRollTypes,
    getDistricts,
    getAssemblyConstituencies,
    getLanguages
};
