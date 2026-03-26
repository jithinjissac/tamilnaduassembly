import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store active browser sessions
const activeSessions = new Map();

// Base URL for ECI portal
const ECI_BASE_URL = 'https://voters.eci.gov.in';

/**
 * Launch browser and navigate to ECI portal
 */
export const launchBrowser = async () => {
    try {
        const browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            acceptDownloads: true
        });

        const page = await context.newPage();

        // Enable request/response logging for debugging
        if (process.env.DEBUG_ECI === 'true') {
            page.on('request', request => {
                if (request.url().includes('/api/') || request.method() === 'POST') {
                    logger.debug(`ECI Request: ${request.method()} ${request.url()}`);
                    if (request.postData()) {
                        logger.debug(`Payload: ${request.postData()}`);
                    }
                }
            });

            page.on('response', response => {
                if (response.url().includes('/api/')) {
                    logger.debug(`ECI Response: ${response.status()} ${response.url()}`);
                }
            });
        }

        logger.info('Assembly: Browser launched successfully');
        return { browser, context, page };
    } catch (error) {
        logger.error('Assembly: Error launching browser:', error);
        throw error;
    }
};

/**
 * Capture captcha from ECI portal (React-based form)
 */
export const captureECICaptcha = async (formData) => {
    try {
        const { stateCode, year, rollType, district, constituency, language } = formData;

        // Launch browser
        const { browser, context, page } = await launchBrowser();

        // Navigate to download page
        const url = `${ECI_BASE_URL}/download-eroll?stateCode=${stateCode}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        logger.info(`Assembly: Navigated to ${url}`);

        // Wait for React app to load
        await page.waitForTimeout(1000);

        // Select Year dropdown
        await page.waitForSelector('select[aria-label="Year Of Revision"]', { timeout: 10000 });
        await page.selectOption('select[aria-label="Year Of Revision"]', year);
        await page.waitForTimeout(500);

        logger.info(`Assembly: Selected year ${year}`);

        // Select Roll Type
        await page.selectOption('select[aria-label="Roll Type"]', rollType);
        await page.waitForTimeout(500);

        logger.info(`Assembly: Selected roll type ${rollType}`);

        // Select District
        await page.selectOption('select[aria-label="District"]', district);
        await page.waitForTimeout(1000);

        logger.info(`Assembly: Selected district ${district}`);

        // Handle Assembly Constituency (React Autocomplete Combobox)
        await page.waitForSelector('input[role="combobox"]', { timeout: 10000 });
        await page.click('input[role="combobox"]');
        await page.waitForTimeout(300);
        
        // Type constituency name
        await page.fill('input[role="combobox"]', constituency);
        await page.waitForTimeout(500);
        
        // Press Enter to select first match
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);

        logger.info(`Assembly: Selected constituency ${constituency}`);

        // Wait for polling parts table to load
        await page.waitForSelector('text=Select All', { timeout: 15000 });
        
        logger.info('Assembly: Parts table loaded successfully');

        // Wait for the table to be fully loaded
        await page.waitForTimeout(1000);

        // Extract polling parts from the table - try multiple selectors
        let pollingParts = [];
        
        try {
            // Try the table with contenttable-eroll class
            const tableExists = await page.$('table.contenttable-eroll');
            
            if (tableExists) {
                pollingParts = await page.$$eval('table.contenttable-eroll tbody tr', rows => {
                    return rows.map((row, index) => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 2) {
                            const checkbox = cells[0].querySelector('input[type="checkbox"]');
                            const partText = cells[1].textContent.trim();
                            
                            // Skip if it's the header row or empty
                            if (!partText || partText.toLowerCase().includes('select all')) {
                                return null;
                            }
                            
                            // Extract part number and name
                            const match = partText.match(/^(\d+)\s*-\s*(.+)$/);
                            
                            return {
                                index: index,
                                partNumber: match ? match[1] : (index + 1).toString(),
                                partName: match ? match[2] : partText,
                                fullText: partText
                            };
                        }
                        return null;
                    }).filter(part => part !== null);
                });
            } else {
                // Try alternative selector - any table with checkboxes
                logger.warn('Assembly: contenttable-eroll not found, trying alternative selector');
                
                pollingParts = await page.$$eval('table tbody tr', rows => {
                    const validParts = [];
                    rows.forEach((row, index) => {
                        const cells = row.querySelectorAll('td');
                        const checkbox = row.querySelector('input[type="checkbox"]');
                        
                        if (checkbox && cells.length >= 2 && !checkbox.id.includes('selectAll')) {
                            const partText = cells[1].textContent.trim();
                            
                            if (partText && !partText.toLowerCase().includes('select all')) {
                                const match = partText.match(/^(\d+)\s*-\s*(.+)$/);
                                
                                validParts.push({
                                    index: validParts.length,
                                    partNumber: match ? match[1] : (validParts.length + 1).toString(),
                                    partName: match ? match[2] : partText,
                                    fullText: partText
                                });
                            }
                        }
                    });
                    return validParts;
                });
            }
        } catch (error) {
            logger.error(`Assembly: Error extracting polling parts: ${error.message}`);
            pollingParts = [];
        }

        logger.info(`Assembly: Extracted ${pollingParts.length} polling parts`);
        
        // If no parts found, log page content for debugging
        if (pollingParts.length === 0) {
            logger.warn('Assembly: No polling parts found! Debugging...');
            
            // Try to find what tables exist on the page
            const tableInfo = await page.evaluate(() => {
                const tables = document.querySelectorAll('table');
                const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                
                return {
                    tableCount: tables.length,
                    checkboxCount: checkboxes.length,
                    tableClasses: Array.from(tables).map(t => t.className),
                    checkboxIds: Array.from(checkboxes).map(c => c.id)
                };
            });
            
            logger.warn(`Assembly: Page has ${tableInfo.tableCount} tables: ${JSON.stringify(tableInfo.tableClasses)}`);
            logger.warn(`Assembly: Page has ${tableInfo.checkboxCount} checkboxes: ${JSON.stringify(tableInfo.checkboxIds)}`);
            
            // Take a debug screenshot
            const debugDir = path.join(__dirname, '..', 'public', 'captcha-cache');
            const debugPath = path.join(debugDir, `debug-no-parts-${Date.now()}.png`);
            await page.screenshot({ path: debugPath, fullPage: true });
            logger.warn(`Assembly: Debug screenshot saved to ${debugPath}`);
        }

        // Select language (MAL is default, only change if different)
        if (language && language !== 'MAL') {
            try {
                await page.selectOption('select[aria-label="Select Language"]', language);
                await page.waitForTimeout(500);
                logger.info(`Assembly: Selected language ${language}`);
            } catch (error) {
                logger.warn(`Assembly: Could not select language ${language}, using default MAL`);
            }
        } else {
            logger.info('Assembly: Using default language MAL (Malayalam)');
        }

        // Wait for captcha to load
        await page.waitForSelector('img[alt="captcha"], img[alt="Captcha"]', { timeout: 10000 });

        // Take screenshot of captcha
        const captchaElement = await page.$('img[alt="captcha"], img[alt="Captcha"]');
        
        // Generate unique session ID
        const sessionId = crypto.randomUUID();
        
        // Ensure captcha-cache directory exists
        const captchaDir = path.join(__dirname, '..', 'public', 'captcha-cache');
        if (!fs.existsSync(captchaDir)) {
            fs.mkdirSync(captchaDir, { recursive: true });
        }

        const captchaFilename = `assembly-captcha-${sessionId}.png`;
        const captchaPath = path.join(captchaDir, captchaFilename);

        // Screenshot the captcha
        await captchaElement.screenshot({ path: captchaPath });

        logger.info(`Assembly: Captcha saved to ${captchaPath}`);

        // Store session data
        activeSessions.set(sessionId, {
            browser,
            context,
            page,
            formData,
            createdAt: Date.now()
        });

        // Clean up old sessions (older than 10 minutes)
        cleanupOldSessions();

        return {
            captchaPath: captchaFilename,
            sessionId,
            pollingParts
        };
    } catch (error) {
        logger.error('Assembly: Error capturing captcha:', error);
        throw error;
    }
};

/**
 * Fill ECI form and download PDF (handles React-based form with polling parts selection)
 */
export const fillECIForm = async (formData) => {
    try {
        const { sessionId, captcha, selectAll = true, selectedParts = [] } = formData;

        // Get session
        const session = activeSessions.get(sessionId);
        if (!session) {
            throw new Error('Session expired or not found. Please load captcha again.');
        }

        const { page } = session;

        logger.info(`Assembly: Filling captcha for session ${sessionId}`);

        // Verify page is still on the form
        try {
            await page.waitForSelector('text=Select All', { timeout: 5000 });
        } catch (error) {
            throw new Error('Form page not found. Please load captcha again.');
        }

        // Find and fill captcha input - try multiple selectors
        let captchaInput = await page.$('input[placeholder*="captcha" i]');
        if (!captchaInput) {
            captchaInput = await page.$('input[name="captcha"]');
        }
        if (!captchaInput) {
            captchaInput = await page.$('input[aria-label*="captcha" i]');
        }
        if (!captchaInput) {
            // Try to find any text input near captcha image
            captchaInput = await page.$('img[alt*="captcha" i] ~ input[type="text"]');
        }
        
        if (!captchaInput) {
            throw new Error('Captcha input field not found. The page structure may have changed.');
        }
        
        await captchaInput.fill(captcha);
        await page.waitForTimeout(500);

        logger.info('Assembly: Captcha filled successfully');

        // Wait for any React re-rendering to complete
        await page.waitForTimeout(500);

        // Select polling parts
        if (selectAll) {
            // Select all parts using the "Select All" checkbox
            try {
                const selectAllCheckbox = await page.$('input[type="checkbox"]#selectAll');
                if (selectAllCheckbox) {
                    logger.info('Assembly: Found Select All checkbox, checking it...');
                    await selectAllCheckbox.check();
                    await page.waitForTimeout(500);
                    logger.info('Assembly: Checked Select All - all polling parts selected');
                } else {
                    logger.warn('Assembly: Select All checkbox not found, checking all individually');
                    const checkboxes = await page.$$('table.contenttable-eroll tbody tr input[type="checkbox"]');
                    logger.info(`Assembly: Found ${checkboxes.length} part checkboxes`);
                    
                    for (const checkbox of checkboxes) {
                        try {
                            const isChecked = await checkbox.isChecked();
                            if (!isChecked) {
                                await checkbox.check({ timeout: 1000 });
                            }
                        } catch (e) {
                            // Skip if checkbox can't be checked
                        }
                    }
                    logger.info('Assembly: Checked all available part checkboxes');
                }
            } catch (error) {
                logger.warn('Assembly: Could not select all polling parts:', error.message);
            }
        } else if (selectedParts && selectedParts.length > 0) {
            // Select specific parts by their index
            try {
                const checkboxes = await page.$$('table.contenttable-eroll tbody tr input[type="checkbox"]');
                logger.info(`Assembly: Found ${checkboxes.length} part checkboxes, selecting ${selectedParts.length} specific parts`);
                
                for (const partIndex of selectedParts) {
                    if (partIndex >= 0 && partIndex < checkboxes.length) {
                        try {
                            await checkboxes[partIndex].check({ timeout: 1000 });
                            logger.info(`Assembly: Checked part at index ${partIndex}`);
                        } catch (e) {
                            logger.warn(`Assembly: Could not check part at index ${partIndex}: ${e.message}`);
                        }
                    }
                }
                
                await page.waitForTimeout(500);
                logger.info(`Assembly: Selected ${selectedParts.length} specific polling parts`);
            } catch (error) {
                logger.error('Assembly: Error selecting specific polling parts:', error.message);
                throw new Error('Failed to select polling parts. Please try again.');
            }
        } else {
            throw new Error('No polling parts selected. Please select at least one part.');
        }

        // Prepare download directory
        const downloadDir = path.join(__dirname, '..', 'temp-pdfs');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        // Instead of waiting for download event, let's intercept the response
        let downloadStarted = false;
        let pdfUrl = null;
        
        // Listen for PDF responses
        page.on('response', async (response) => {
            const url = response.url();
            const contentType = response.headers()['content-type'];
            
            if (contentType && contentType.includes('application/pdf')) {
                logger.info(`Assembly: PDF response detected: ${url}`);
                pdfUrl = url;
                downloadStarted = true;
            }
        });

        // Find and click download/submit button - try multiple selectors
        let downloadButton = await page.$('button:has-text("Download Selected PDFs")');
        if (!downloadButton) {
            downloadButton = await page.$('button[value="Download Selected PDFs"]');
        }
        if (!downloadButton) {
            downloadButton = await page.$('button.submit[type="submit"]');
        }
        if (!downloadButton) {
            downloadButton = await page.$('button:has-text("Download")');
        }
        if (!downloadButton) {
            downloadButton = await page.$('input[type="submit"]');
        }
        if (!downloadButton) {
            downloadButton = await page.$('input[type="submit"]');
        }
        
        if (!downloadButton) {
            downloadButton = await page.$('button:has-text("View")');
        }
        
        if (!downloadButton) {
            throw new Error('Download/Submit button not found. Please check the form.');
        }

        logger.info('Assembly: Clicking submit button');
        await downloadButton.click();

        // Wait for PDF response or navigation
        logger.info('Assembly: Waiting for PDF response...');
        
        let pdfPath = null;
        
        // Wait up to 30 seconds for PDF URL to be detected
        for (let i = 0; i < 120 && !downloadStarted; i++) {
            await page.waitForTimeout(250);
        }
        
        if (pdfUrl) {
            // Download the PDF from the captured URL
            logger.info(`Assembly: Downloading PDF from: ${pdfUrl}`);
            
            const response = await page.goto(pdfUrl, { waitUntil: 'networkidle', timeout: 60000 });
            const pdfBuffer = await response.body();
            
            const downloadFilename = `assembly-${sessionId}.pdf`;
            pdfPath = path.join(downloadDir, downloadFilename);
            
            fs.writeFileSync(pdfPath, pdfBuffer);
            logger.info(`Assembly: PDF saved to ${pdfPath} (${(pdfBuffer.length / 1024).toFixed(2)} KB)`);
        } else {
            // Try alternative: check if page navigated to a PDF
            logger.info('Assembly: Checking for PDF in current page...');
            const currentUrl = page.url();
            
            if (currentUrl.includes('.pdf') || currentUrl.includes('download')) {
                logger.info(`Assembly: PDF URL detected: ${currentUrl}`);
                
                const response = await page.goto(currentUrl, { waitUntil: 'networkidle', timeout: 60000 });
                const pdfBuffer = await response.body();
                
                const downloadFilename = `assembly-${sessionId}.pdf`;
                pdfPath = path.join(downloadDir, downloadFilename);
                
                fs.writeFileSync(pdfPath, pdfBuffer);
                logger.info(`Assembly: PDF saved to ${pdfPath}`);
            } else {
                // Check for error messages on the page
                const pageText = await page.textContent('body');
                
                if (pageText.includes('Invalid Captcha') || pageText.includes('invalid captcha')) {
                    throw new Error('Invalid captcha. Please try again with the correct captcha code.');
                }
                
                if (pageText.includes('error') || pageText.includes('Error')) {
                    throw new Error('Form submission error. Please check the form and try again.');
                }
                
                throw new Error('No PDF download detected. The form may have validation errors or the captcha was incorrect.');
            }
        }

        // Close browser session
        await session.browser.close();
        activeSessions.delete(sessionId);
        logger.info(`Assembly: Session ${sessionId} closed successfully`);

        return pdfPath;
    } catch (error) {
        logger.error('Assembly: Error filling form:', error);
        
        // Take screenshot for debugging
        const session = activeSessions.get(formData.sessionId);
        if (session && session.page) {
            try {
                const errorScreenshotPath = path.join(__dirname, '..', 'public', 'debug-screenshots', `error-${formData.sessionId}.png`);
                await session.page.screenshot({ path: errorScreenshotPath, fullPage: true });
                logger.info(`Assembly: Error screenshot saved to ${errorScreenshotPath}`);
            } catch (screenshotError) {
                logger.error('Assembly: Could not take error screenshot:', screenshotError);
            }
        }

        // Clean up session on error
        if (session) {
            try {
                await session.browser.close();
            } catch (e) {
                logger.error('Assembly: Error closing browser:', e);
            }
            activeSessions.delete(formData.sessionId);
        }

        throw error;
    }
};

/**
 * Clean up old sessions (older than 10 minutes)
 */
const cleanupOldSessions = () => {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [sessionId, session] of activeSessions.entries()) {
        if (now - session.createdAt > maxAge) {
            logger.info(`Assembly: Cleaning up old session ${sessionId}`);
            try {
                session.browser.close();
            } catch (error) {
                logger.error(`Assembly: Error closing old session ${sessionId}:`, error);
            }
            activeSessions.delete(sessionId);
        }
    }
};

/**
 * Close all active sessions (called on server shutdown)
 */
export const closeAllSessions = async () => {
    logger.info('Assembly: Closing all active sessions');
    
    for (const [sessionId, session] of activeSessions.entries()) {
        try {
            await session.browser.close();
            logger.info(`Assembly: Closed session ${sessionId}`);
        } catch (error) {
            logger.error(`Assembly: Error closing session ${sessionId}:`, error);
        }
    }
    
    activeSessions.clear();
};

// Periodic cleanup every 5 minutes
setInterval(cleanupOldSessions, 5 * 60 * 1000);

export default {
    launchBrowser,
    captureECICaptcha,
    fillECIForm,
    closeAllSessions
};
