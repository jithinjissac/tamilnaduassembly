/**
 * Debug utility to compare constituencies between app and ECI portal
 */
import { chromium } from 'playwright';
import { logger } from './logger.js';

const ECI_BASE_URL = 'https://voters.eci.gov.in';

/**
 * Debug constituency fetching - opens browser in non-headless mode and logs everything
 */
export const debugConstituencyFetch = async (stateCode, district) => {
    logger.info('=== DEBUG MODE: Fetching constituencies ===');
    logger.info(`State: ${stateCode}, District: ${district}`);

    const browser = await chromium.launch({ 
        headless: false, // Show browser for debugging
        slowMo: 1000 // Slow down actions
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(`${ECI_BASE_URL}/download-eroll`, { waitUntil: 'networkidle', timeout: 30000 });
        logger.info('Page loaded');
        await page.waitForTimeout(2000);

        // Select state
        logger.info(`Selecting state: ${stateCode}`);
        await page.selectOption('select[aria-label="Select State"]', stateCode);
        await page.waitForTimeout(1500);

        // Get and select year
        const yearValue = await page.evaluate(() => {
            const yearSelect = document.querySelector('select[aria-label="Select Year of Revision"]');
            const options = yearSelect ? Array.from(yearSelect.querySelectorAll('option')) : [];
            const validOption = options.find(opt => opt.value && opt.value !== '');
            return validOption ? validOption.value : null;
        });

        if (yearValue) {
            logger.info(`Selecting year: ${yearValue}`);
            await page.selectOption('select[aria-label="Select Year of Revision"]', yearValue);
            await page.waitForTimeout(1500);
        }

        // Select district
        logger.info(`Selecting district: ${district}`);
        await page.selectOption('select[aria-label="Select District"]', district);
        await page.waitForTimeout(3000);

        // Check district text
        const districtText = await page.evaluate((dist) => {
            const districtSelect = document.querySelector('select[aria-label="Select District"]');
            const selectedOption = districtSelect ? districtSelect.options[districtSelect.selectedIndex] : null;
            return selectedOption ? selectedOption.textContent : 'Not found';
        }, district);
        logger.info(`Selected district shows as: ${districtText}`);

        // Find constituency input
        const inputInfo = await page.evaluate(() => {
            const input = document.querySelector('input[aria-label*="Constituency"], input[placeholder*="Constituency"], input[aria-label*="Assembly"]');
            if (!input) return { found: false };
            
            return {
                found: true,
                ariaLabel: input.getAttribute('aria-label'),
                placeholder: input.getAttribute('placeholder'),
                id: input.id,
                value: input.value,
                disabled: input.disabled
            };
        });
        logger.info('Constituency input field:', inputInfo);

        if (!inputInfo.found) {
            logger.error('❌ Constituency input field not found!');
            await page.screenshot({ path: 'debug-no-input.png', fullPage: true });
            await browser.close();
            return [];
        }

        // Click and interact with constituency field
        logger.info('Clicking constituency input...');
        await page.click('input[aria-label*="Constituency"], input[placeholder*="Constituency"]');
        await page.waitForTimeout(1000);

        // Try pressing ArrowDown to open dropdown
        logger.info('Pressing ArrowDown to open dropdown...');
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(2000);

        // Check for dropdown/autocomplete
        const dropdownInfo = await page.evaluate(() => {
            const listbox = document.querySelector('[role="listbox"]');
            const options = document.querySelectorAll('[role="option"]');
            const muiOptions = document.querySelectorAll('.MuiAutocomplete-option');
            
            return {
                hasListbox: !!listbox,
                listboxId: listbox?.id || 'none',
                optionCount: options.length,
                muiOptionCount: muiOptions.length,
                listboxVisible: listbox ? window.getComputedStyle(listbox).display !== 'none' : false
            };
        });
        logger.info('Dropdown info:', dropdownInfo);

        // Extract all visible constituency options
        const constituencies = await page.evaluate(() => {
            const selectors = [
                '[role="listbox"] [role="option"]',
                '.MuiAutocomplete-option',
                'li[data-option-index]',
                '[role="option"]'
            ];

            const results = [];
            
            for (const selector of selectors) {
                const items = document.querySelectorAll(selector);
                if (items.length > 0) {
                    console.log(`Found ${items.length} items with selector: ${selector}`);
                    items.forEach((item, index) => {
                        const text = item.textContent.trim();
                        if (text && !results.find(r => r.text === text)) {
                            results.push({
                                index,
                                value: text,
                                text: text,
                                visible: window.getComputedStyle(item).display !== 'none'
                            });
                        }
                    });
                    if (results.length > 0) break;
                }
            }
            
            return results;
        });

        logger.info(`\n=== FOUND ${constituencies.length} CONSTITUENCIES ===`);
        constituencies.forEach((ac, i) => {
            logger.info(`${i + 1}. ${ac.text} (visible: ${ac.visible})`);
        });

        // Take screenshot
        await page.screenshot({ path: 'debug-constituencies.png', fullPage: true });
        logger.info('Screenshot saved as debug-constituencies.png');

        // Keep browser open for manual inspection
        logger.info('\n⏰ Browser will stay open for 30 seconds for manual inspection...');
        await page.waitForTimeout(30000);

        await browser.close();
        return constituencies;

    } catch (error) {
        logger.error('Error during debug:', error);
        await page.screenshot({ path: 'debug-error.png', fullPage: true });
        await browser.close();
        throw error;
    }
};

/**
 * Compare constituencies from our app vs ECI portal
 */
export const compareConstituencies = async (stateCode, district, appConstituencies) => {
    logger.info('=== COMPARING CONSTITUENCIES ===');
    
    const eciConstituencies = await debugConstituencyFetch(stateCode, district);
    
    logger.info(`\nApp has: ${appConstituencies.length} constituencies`);
    logger.info(`ECI has: ${eciConstituencies.length} constituencies`);
    
    // Find missing in app
    const missingInApp = eciConstituencies.filter(eci => 
        !appConstituencies.find(app => app.text === eci.text || app.value === eci.text)
    );
    
    // Find extra in app
    const extraInApp = appConstituencies.filter(app => 
        !eciConstituencies.find(eci => eci.text === app.text || eci.text === app.value)
    );
    
    if (missingInApp.length > 0) {
        logger.warn(`\n❌ Missing in App (${missingInApp.length}):`);
        missingInApp.forEach(ac => logger.warn(`  - ${ac.text}`));
    }
    
    if (extraInApp.length > 0) {
        logger.warn(`\n⚠️  Extra in App (${extraInApp.length}):`);
        extraInApp.forEach(ac => logger.warn(`  - ${ac.text}`));
    }
    
    if (missingInApp.length === 0 && extraInApp.length === 0) {
        logger.info('\n✅ Perfect match! All constituencies match.');
    }
    
    return {
        match: missingInApp.length === 0 && extraInApp.length === 0,
        eciCount: eciConstituencies.length,
        appCount: appConstituencies.length,
        missingInApp,
        extraInApp
    };
};

export default {
    debugConstituencyFetch,
    compareConstituencies
};
