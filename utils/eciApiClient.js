import axios from 'axios';
import { chromium } from 'playwright';
import { logger } from './logger.js';

// Base URL for ECI portal
const ECI_BASE_URL = 'https://voters.eci.gov.in';

const getDownloadErollUrl = (stateCode) => {
    if (stateCode) {
        return `${ECI_BASE_URL}/download-eroll?stateCode=${encodeURIComponent(stateCode)}`;
    }

    return `${ECI_BASE_URL}/download-eroll`;
};

const DISTRICT_SELECTORS = [
    'select[aria-label="District"]',
    'select[aria-label="Select District"]',
    'select[name="district"]',
    'select[id*="district"]',
];

const getDistrictsFromPage = async (page) => {
    return page.evaluate((selectors) => {
        for (const selector of selectors) {
            const districtSelect = document.querySelector(selector);
            if (!districtSelect) {
                continue;
            }

            const districts = Array.from(districtSelect.querySelectorAll('option'))
                .filter((option) => option.value && option.value !== '')
                .map((option) => ({
                    value: option.value,
                    text: option.textContent.trim(),
                }));

            if (districts.length > 0) {
                return districts;
            }
        }

        return [];
    }, DISTRICT_SELECTORS);
};

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

        await page.goto(getDownloadErollUrl(stateCode), { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Select state
        const stateSelect = await page.$('select[aria-label="State"], select[aria-label="Select State"], select[name="stateCode"]');
        if (stateSelect) {
            await stateSelect.selectOption(stateCode);
            await page.waitForTimeout(2000);
        }

        const districts = await getDistrictsFromPage(page);

        await browser.close();

        logger.info(`ECI API: Scraped ${districts.length} districts for ${stateCode}`);
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
        logger.info(`ECI API: fetchConstituenciesFromECI start state=${stateCode}, district=${district}`);
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(getDownloadErollUrl(stateCode), { waitUntil: 'networkidle', timeout: 30000 });
        logger.info('ECI API: download-eroll page loaded');
        await page.waitForTimeout(2000);

        await page.waitForSelector('select[aria-label="Year Of Revision"], select[aria-label="Select Year of Revision"], select[name="revyear"]', { timeout: 10000 });

        // Select state (if selector is present and enabled)
        const stateSelect = await page.$('select[aria-label="State"], select[aria-label="Select State"], select[name="stateCode"]');
        if (stateSelect) {
            try {
                await stateSelect.selectOption(stateCode);
                await page.waitForTimeout(1000);
            } catch (error) {
                logger.warn(`ECI API: Could not change state dropdown (${error.message})`);
            }
        }

        // Get any year to enable district dropdown
        const yearValue = await page.evaluate(() => {
            const yearSelect = document.querySelector('select[aria-label="Year Of Revision"], select[aria-label="Select Year of Revision"], select[name="revyear"]');
            const options = yearSelect ? Array.from(yearSelect.querySelectorAll('option')) : [];
            const validOption = options.find(opt => opt.value && opt.value !== '');
            return validOption ? validOption.value : null;
        });

        if (yearValue) {
            await page.selectOption('select[aria-label="Year Of Revision"], select[aria-label="Select Year of Revision"], select[name="revyear"]', yearValue);
            await page.waitForTimeout(1500);
            logger.info(`ECI API: year selected ${yearValue}`);
        }

        // Select roll type to enable district/constituency flow
        const rollTypeValue = await page.evaluate(() => {
            const rollTypeSelect = document.querySelector('select[aria-label="Roll Type"], select[aria-label="Select Roll Type"], select[name="roleType"]');
            if (!rollTypeSelect) return null;
            const options = Array.from(rollTypeSelect.querySelectorAll('option'));
            const preferred = options.find((opt) => opt.value && String(opt.value).includes('-FIR'));
            if (preferred) return preferred.value;
            const fallback = options.find((opt) => opt.value && opt.value !== '');
            return fallback ? fallback.value : null;
        });

        if (rollTypeValue) {
            await page.selectOption('select[aria-label="Roll Type"], select[aria-label="Select Roll Type"], select[name="roleType"]', rollTypeValue);
            await page.waitForTimeout(1500);
            logger.info(`ECI API: roll type selected ${rollTypeValue}`);
        }

        // Select district
        await page.waitForSelector('select[aria-label="District"], select[aria-label="Select District"], select[name="district"]', { timeout: 10000 });
        await page.selectOption('select[aria-label="District"], select[aria-label="Select District"], select[name="district"]', district);
        await page.waitForTimeout(2000);

        logger.info(`ECI API: Selected district ${district}, waiting for constituencies to load...`);

        // Open the React-select constituency dropdown and scrape option HTML
        await page.waitForSelector('input[role="combobox"][id^="react-select-"][id$="-input"], input[aria-label*="Constituency"], input[placeholder*="Constituency"], input[aria-label*="Assembly"]', { timeout: 10000 });
        const constituencyInput = await page.$('input[role="combobox"][id^="react-select-"][id$="-input"], input[aria-label*="Constituency"], input[placeholder*="Constituency"], input[aria-label*="Assembly"]');
        if (!constituencyInput) {
            logger.error('ECI API: Constituency combobox input not found');
            await browser.close();
            return [];
        }

        await constituencyInput.click();
        await page.waitForTimeout(400);
        await constituencyInput.press('ArrowDown');
        await page.waitForTimeout(1200);
        logger.info('ECI API: constituency dropdown interaction triggered');

        const dropdownSnapshot = await page.evaluate(() => {
            const listbox = document.querySelector('[id^="react-select-"][id$="-listbox"], [role="listbox"]');
            return {
                hasListbox: !!listbox,
                html: listbox ? listbox.innerHTML : '',
                optionCount: listbox ? listbox.querySelectorAll('[role="option"], div').length : 0,
            };
        });

        if (dropdownSnapshot.hasListbox) {
            logger.info(`ECI API: Constituency dropdown opened with ${dropdownSnapshot.optionCount} raw nodes`);
        } else {
            logger.warn('ECI API: Constituency listbox not detected after opening dropdown');
        }

        const constituencies = await page.evaluate(() => {
            const listbox = document.querySelector('[id^="react-select-"][id$="-listbox"], [role="listbox"]');
            if (!listbox) {
                return [];
            }

            const optionNodes = listbox.querySelectorAll('[role="option"], .css-tr4s17-option, [id^="react-select-"][id*="-option-"]');
            const seen = new Set();
            const rows = [];

            optionNodes.forEach((node) => {
                const text = (node.textContent || '').trim();
                if (!text) return;
                const lower = text.toLowerCase();
                if (lower.includes('select ac') || lower.includes('no options') || lower.includes('loading')) return;
                if (seen.has(text)) return;
                seen.add(text);

                const match = text.match(/^(\d+)\s*[-:]\s*(.+)$/);
                rows.push({
                    value: match ? match[1] : text,
                    text,
                    acNumber: match ? Number(match[1]) : null,
                    acName: match ? match[2].trim() : text,
                });
            });

            return rows;
        });

        logger.info(`ECI API: Found ${constituencies.length} constituencies for district ${district}`);

        // If no constituencies found, take a debug screenshot
        if (constituencies.length === 0) {
            logger.warn('ECI API: No constituencies found, taking debug screenshot');
            await page.screenshot({ path: `debug-constituency-${Date.now()}.png`, fullPage: true });
            
            // Log page information for debugging
            const debugInfo = await page.evaluate(() => {
                return {
                    hasInput: !!document.querySelector('input[role="combobox"][id^="react-select-"][id$="-input"], input[aria-label*="Constituency"]'),
                    hasListbox: !!document.querySelector('[role="listbox"]'),
                    hasOptions: document.querySelectorAll('[role="option"]').length,
                    inputValue: document.querySelector('input[role="combobox"][id^="react-select-"][id$="-input"], input[aria-label*="Constituency"]')?.value || 'not found'
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
