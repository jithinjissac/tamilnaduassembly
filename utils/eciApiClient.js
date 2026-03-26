import axios from 'axios';
import { chromium } from 'playwright';
import { logger } from './logger.js';

// Base URL for ECI portal
const ECI_BASE_URL = 'https://voters.eci.gov.in';

// Cache for discovered API endpoints
const apiEndpoints = {
    discovered: false,
    urls: {}
};

/**
 * Discover ECI API endpoints by intercepting network requests
 */
export const discoverECIEndpoints = async () => {
    if (apiEndpoints.discovered) {
        return apiEndpoints.urls;
    }

    logger.info('ECI API: Discovering API endpoints...');
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const interceptedRequests = [];

    // Intercept all network requests
    page.on('request', request => {
        const url = request.url();
        const method = request.method();
        
        // Capture API calls (typically to /api/ or backend endpoints)
        if (url.includes('/api/') || method === 'POST' || url.includes('eroll') || url.includes('constituency') || url.includes('district')) {
            interceptedRequests.push({
                url,
                method,
                resourceType: request.resourceType(),
                postData: request.postData()
            });
        }
    });

    page.on('response', async response => {
        const url = response.url();
        const request = response.request();
        
        if (url.includes('/api/') || url.includes('eroll')) {
            try {
                const contentType = response.headers()['content-type'];
                if (contentType && contentType.includes('application/json')) {
                    interceptedRequests.push({
                        url,
                        method: request.method(),
                        status: response.status(),
                        isJson: true
                    });
                }
            } catch (e) {
                // Ignore response parsing errors
            }
        }
    });

    try {
        // Navigate and interact with the page to trigger API calls
        await page.goto(`${ECI_BASE_URL}/download-eroll`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);

        // Try to interact with dropdowns to trigger API calls
        try {
            await page.selectOption('select[aria-label="Select State"]', 'S11');
            await page.waitForTimeout(2000);
            
            const yearOptions = await page.$$('select[aria-label="Select Year of Revision"] option');
            if (yearOptions.length > 1) {
                const yearValue = await yearOptions[1].getAttribute('value');
                if (yearValue) {
                    await page.selectOption('select[aria-label="Select Year of Revision"]', yearValue);
                    await page.waitForTimeout(2000);
                }
            }

            const districtOptions = await page.$$('select[aria-label="Select District"] option');
            if (districtOptions.length > 1) {
                const districtValue = await districtOptions[1].getAttribute('value');
                if (districtValue) {
                    await page.selectOption('select[aria-label="Select District"]', districtValue);
                    await page.waitForTimeout(2000);
                }
            }
        } catch (e) {
            logger.warn('ECI API: Error during interaction:', e.message);
        }

        await browser.close();

        // Analyze intercepted requests
        logger.info(`ECI API: Intercepted ${interceptedRequests.length} requests`);
        
        interceptedRequests.forEach(req => {
            logger.info(`  ${req.method} ${req.url}`);
        });

        // Try to identify endpoint patterns
        const apiUrls = {};
        interceptedRequests.forEach(req => {
            if (req.url.includes('year')) apiUrls.years = req.url;
            if (req.url.includes('rolltype')) apiUrls.rollTypes = req.url;
            if (req.url.includes('district')) apiUrls.districts = req.url;
            if (req.url.includes('constituency') || req.url.includes('ac-')) apiUrls.constituencies = req.url;
        });

        apiEndpoints.urls = apiUrls;
        apiEndpoints.discovered = true;

        logger.info('ECI API: Discovered endpoints:', apiUrls);
        
        return apiUrls;
    } catch (error) {
        await browser.close();
        logger.error('ECI API: Error discovering endpoints:', error);
        throw error;
    }
};

/**
 * Fetch years from ECI API
 */
export const fetchYearsFromECI = async (stateCode) => {
    try {
        // Method 1: Try direct API call (if we discover the endpoint)
        const endpoints = await discoverECIEndpoints();
        
        if (endpoints.years) {
            logger.info('ECI API: Fetching years from discovered endpoint');
            const response = await axios.get(endpoints.years);
            return response.data;
        }

        // Method 2: Parse from page HTML using Playwright
        logger.info('ECI API: Fetching years using Playwright fallback');
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(`${ECI_BASE_URL}/download-eroll`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        const years = await page.evaluate(() => {
            const yearSelect = document.querySelector('select[aria-label="Select Year of Revision"]');
            if (!yearSelect) return [];
            
            return Array.from(yearSelect.querySelectorAll('option'))
                .filter(opt => opt.value && opt.value !== '')
                .map(opt => ({
                    value: opt.value,
                    text: opt.textContent.trim()
                }));
        });

        await browser.close();
        return years;
    } catch (error) {
        logger.error('ECI API: Error fetching years:', error);
        throw error;
    }
};

/**
 * Fetch roll types from ECI API
 */
export const fetchRollTypesFromECI = async (stateCode, year) => {
    try {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(`${ECI_BASE_URL}/download-eroll`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Select state
        await page.selectOption('select[aria-label="Select State"]', stateCode);
        await page.waitForTimeout(1000);

        // Select year
        await page.selectOption('select[aria-label="Select Year of Revision"]', year);
        await page.waitForTimeout(2000);

        // Extract roll types
        const rollTypes = await page.evaluate(() => {
            const rollTypeSelect = document.querySelector('select[aria-label="Select Roll Type"]');
            if (!rollTypeSelect) return [];
            
            return Array.from(rollTypeSelect.querySelectorAll('option'))
                .filter(opt => opt.value && opt.value !== '')
                .map(opt => ({
                    value: opt.value,
                    text: opt.textContent.trim()
                }));
        });

        await browser.close();
        return rollTypes;
    } catch (error) {
        logger.error('ECI API: Error fetching roll types:', error);
        throw error;
    }
};

/**
 * Fetch districts from ECI API
 */
export const fetchDistrictsFromECI = async (stateCode) => {
    try {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(`${ECI_BASE_URL}/download-eroll`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Select state
        await page.selectOption('select[aria-label="Select State"]', stateCode);
        await page.waitForTimeout(2000);

        // Extract districts
        const districts = await page.evaluate(() => {
            const districtSelect = document.querySelector('select[aria-label="Select District"]');
            if (!districtSelect) return [];
            
            return Array.from(districtSelect.querySelectorAll('option'))
                .filter(opt => opt.value && opt.value !== '')
                .map(opt => ({
                    value: opt.value,
                    text: opt.textContent.trim()
                }));
        });

        await browser.close();
        return districts;
    } catch (error) {
        logger.error('ECI API: Error fetching districts:', error);
        throw error;
    }
};

/**
 * Fetch constituencies from ECI API
 */
export const fetchConstituenciesFromECI = async (stateCode, district) => {
    try {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(`${ECI_BASE_URL}/download-eroll`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Select state
        await page.selectOption('select[aria-label="Select State"]', stateCode);
        await page.waitForTimeout(1000);

        // Get any year to enable district dropdown
        const yearValue = await page.evaluate(() => {
            const yearSelect = document.querySelector('select[aria-label="Select Year of Revision"]');
            const options = yearSelect ? Array.from(yearSelect.querySelectorAll('option')) : [];
            const validOption = options.find(opt => opt.value && opt.value !== '');
            return validOption ? validOption.value : null;
        });

        if (yearValue) {
            await page.selectOption('select[aria-label="Select Year of Revision"]', yearValue);
            await page.waitForTimeout(1500);
        }

        // Select district
        await page.selectOption('select[aria-label="Select District"]', district);
        await page.waitForTimeout(2000);

        logger.info(`ECI API: Selected district ${district}, waiting for constituencies to load...`);

        // Find and interact with constituency autocomplete field
        const constituencyInput = await page.$('input[aria-label*="Constituency"], input[placeholder*="Constituency"], input[aria-label*="Assembly"]');
        
        if (!constituencyInput) {
            logger.error('ECI API: Constituency input field not found');
            await browser.close();
            return [];
        }

        // Focus and clear the input
        await constituencyInput.click();
        await page.waitForTimeout(500);
        
        // Try typing a space or empty string to trigger dropdown
        await constituencyInput.fill('');
        await page.waitForTimeout(500);
        
        // Press ArrowDown to open dropdown
        await constituencyInput.press('ArrowDown');
        await page.waitForTimeout(1000);

        // Alternative: trigger all possible events
        await page.evaluate(() => {
            const input = document.querySelector('input[aria-label*="Constituency"], input[placeholder*="Constituency"], input[aria-label*="Assembly"]');
            if (input) {
                input.focus();
                input.click();
                input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
            }
        });

        await page.waitForTimeout(2000);

        // Wait for autocomplete dropdown to appear
        try {
            await page.waitForSelector('[role="listbox"], [role="option"], .MuiAutocomplete-listbox, .MuiAutocomplete-option', { timeout: 5000 });
        } catch (e) {
            logger.warn('ECI API: Autocomplete dropdown did not appear, trying to extract visible options');
        }

        // Extract constituency suggestions with multiple selectors
        const constituencies = await page.evaluate(() => {
            // Try multiple possible selectors for Material-UI autocomplete
            const selectors = [
                '[role="listbox"] [role="option"]',
                '.MuiAutocomplete-option',
                'li[data-option-index]',
                '[role="option"]',
                '.autocomplete-item',
                'ul[role="listbox"] li'
            ];

            let results = [];
            
            for (const selector of selectors) {
                const items = document.querySelectorAll(selector);
                if (items.length > 0) {
                    items.forEach(item => {
                        const text = item.textContent.trim();
                        // Filter out empty, "no option", or duplicate entries
                        if (text && 
                            text.length > 0 && 
                            !text.toLowerCase().includes('no option') &&
                            !text.toLowerCase().includes('loading') &&
                            !results.find(r => r.text === text)) {
                            results.push({
                                value: text,
                                text: text
                            });
                        }
                    });
                    
                    if (results.length > 0) {
                        break; // Found results with this selector
                    }
                }
            }
            
            return results;
        });

        logger.info(`ECI API: Found ${constituencies.length} constituencies for district ${district}`);

        // If no constituencies found, take a debug screenshot
        if (constituencies.length === 0) {
            logger.warn('ECI API: No constituencies found, taking debug screenshot');
            await page.screenshot({ path: `debug-constituency-${Date.now()}.png`, fullPage: true });
            
            // Log page information for debugging
            const debugInfo = await page.evaluate(() => {
                return {
                    hasInput: !!document.querySelector('input[aria-label*="Constituency"]'),
                    hasListbox: !!document.querySelector('[role="listbox"]'),
                    hasOptions: document.querySelectorAll('[role="option"]').length,
                    inputValue: document.querySelector('input[aria-label*="Constituency"]')?.value || 'not found'
                };
            });
            logger.warn('ECI API: Debug info:', debugInfo);
        }

        await browser.close();
        return constituencies;
    } catch (error) {
        logger.error('ECI API: Error fetching constituencies:', error);
        throw error;
    }
};

/**
 * Fetch languages from ECI page
 */
export const fetchLanguagesFromECI = async () => {
    try {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(`${ECI_BASE_URL}/download-eroll`, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Extract languages from language selector
        const languages = await page.evaluate(() => {
            const languageSelect = document.querySelector('select[aria-label="Select Language"], select[aria-label*="Language"]');
            if (!languageSelect) {
                // Return common languages if selector not found
                return [
                    { value: 'MAL', text: 'Malayalam' },
                    { value: 'ENG', text: 'English' },
                    { value: 'HIN', text: 'Hindi' }
                ];
            }
            
            return Array.from(languageSelect.querySelectorAll('option'))
                .filter(opt => opt.value && opt.value !== '')
                .map(opt => ({
                    value: opt.value,
                    text: opt.textContent.trim()
                }));
        });

        await browser.close();
        return languages;
    } catch (error) {
        logger.error('ECI API: Error fetching languages:', error);
        // Return default languages
        return [
            { value: 'MAL', text: 'Malayalam' },
            { value: 'ENG', text: 'English' },
            { value: 'HIN', text: 'Hindi' }
        ];
    }
};

export default {
    discoverECIEndpoints,
    fetchYearsFromECI,
    fetchRollTypesFromECI,
    fetchDistrictsFromECI,
    fetchConstituenciesFromECI,
    fetchLanguagesFromECI
};
