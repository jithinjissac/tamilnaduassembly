import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const SEC_BASE_URL = process.env.SEC_BASE_URL || 'https://sec.kerala.gov.in';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store active browser sessions with captcha images (optimized for 20 concurrent users)
const activeSessions = new Map();
const MAX_ACTIVE_SESSIONS = 30; // Allow up to 30 concurrent captcha sessions

// Clean up old sessions periodically
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of activeSessions.entries()) {
        if (now - session.timestamp > 300000) { // 5 minutes
            session.browser?.close().catch(() => {});
            activeSessions.delete(id);
            // Delete old captcha file
            const oldCaptchaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'captcha-cache', `captcha-${id}.png`);
            if (fs.existsSync(oldCaptchaPath)) {
                fs.unlinkSync(oldCaptchaPath);
            }
        }
    }
}, 60000); // Run every minute

/**
 * GET /api/initCaptchaSession
 * Initializes a headless browser session and captures the captcha image
 * Returns a session ID and the captcha image path
 */
router.get('/initCaptchaSession', async (req, res) => {
  let browser;
  let sessionId;
  
  try {
    console.log('[CAPTCHA] Initializing captcha session...');
    
    sessionId = Date.now().toString();
    
    // Launch browser
    console.log('[CAPTCHA] Launching browser...');
    browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      timeout: 60000
    });

    console.log('[CAPTCHA] Creating context...');
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    // Set Malayalam locale cookies
    console.log('[CAPTCHA] Setting cookies...');
    await context.addCookies([
      {
        name: 'set_locale',
        value: 'ml',
        domain: '.sec.kerala.gov.in',
        path: '/'
      },
      {
        name: 'device_view',
        value: 'full',
        domain: '.sec.kerala.gov.in',
        path: '/'
      }
    ]);

    // Navigate to the page with retry logic
    console.log('[CAPTCHA] Loading SEC page:', `${SEC_BASE_URL}/public/voters/list`);
    
    let retries = 3;
    let pageLoaded = false;
    
    while (retries > 0 && !pageLoaded) {
      try {
        await page.goto(`${SEC_BASE_URL}/public/voters/list`, { 
          waitUntil: 'networkidle',
          timeout: 90000 
        });
        pageLoaded = true;
        console.log('[CAPTCHA] Page loaded successfully');
      } catch (error) {
        retries--;
        console.log(`[CAPTCHA] Page load failed, retries left: ${retries}`);
        if (retries === 0) throw error;
        await page.waitForTimeout(2000);
      }
    }

    console.log('[CAPTCHA] Page loaded, waiting for stabilization...');
    await page.waitForTimeout(3000);

    // Wait for captcha image to load - try multiple selectors
    console.log('[CAPTCHA] Waiting for captcha image...');
    
    let captchaElement = null;
    const captchaSelectors = [
      'img[src*="captcha"]',
      'img[alt*="captcha" i]',
      '#view_voters_list_captcha_image',
      '.captcha-image',
      'img[src*="Captcha"]'
    ];
    
    for (const selector of captchaSelectors) {
      try {
        console.log(`[CAPTCHA] Trying selector: ${selector}`);
        await page.waitForSelector(selector, { 
          state: 'visible',
          timeout: 5000 
        });
        captchaElement = await page.$(selector);
        if (captchaElement) {
          console.log(`[CAPTCHA] Found captcha with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`[CAPTCHA] Selector ${selector} not found, trying next...`);
      }
    }
    
    if (!captchaElement) {
      // Try finding any image near the captcha input field
      console.log('[CAPTCHA] Trying to find image near captcha input...');
      captchaElement = await page.$('label[for="view_voters_list_captcha"] ~ img, #view_voters_list_captcha ~ img, .form-group:has(#view_voters_list_captcha) img');
    }

    if (!captchaElement) {
      // Last resort: take screenshot of entire page for debugging
      const debugPath = path.join(__dirname, '..', 'public', 'captcha-cache', `debug-${sessionId}.png`);
      await page.screenshot({ path: debugPath, fullPage: true });
      console.log('[CAPTCHA] Debug screenshot saved to:', debugPath);
      throw new Error('Captcha image not found on page. Debug screenshot saved.');
    }

    // Take screenshot of the captcha element only
    const captchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${sessionId}.png`);
    console.log('[CAPTCHA] Taking screenshot to:', captchaPath);
    
    // Ensure directory exists
    const captchaDir = path.dirname(captchaPath);
    if (!fs.existsSync(captchaDir)) {
      fs.mkdirSync(captchaDir, { recursive: true });
    }

    await captchaElement.screenshot({ path: captchaPath });
    console.log(`Captcha screenshot saved: captcha-${sessionId}.png`);

    // Store the session
    activeSessions.set(sessionId, {
      browser,
      page,
      context,
      timestamp: Date.now()
    });

    // Clean up old sessions (older than 5 minutes)
    for (const [id, session] of activeSessions.entries()) {
      if (Date.now() - session.timestamp > 300000) {
        await session.browser.close();
        activeSessions.delete(id);
        // Delete old captcha file
        const oldCaptchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${id}.png`);
        if (fs.existsSync(oldCaptchaPath)) {
          fs.unlinkSync(oldCaptchaPath);
        }
      }
    }

    res.json({
      status: 'success',
      sessionId,
      captchaUrl: `/captcha-cache/captcha-${sessionId}.png`,
      message: 'Captcha session initialized'
    });

  } catch (error) {
    console.error('Error initializing captcha session:', error);
    
    // Provide more helpful error messages
    let errorMessage = 'Failed to initialize captcha session';
    if (error.name === 'TimeoutError') {
      errorMessage = 'Kerala SEC website is not responding. The website may be down or experiencing heavy traffic. Please try again in a few minutes.';
    } else if (error.message?.includes('net::ERR_')) {
      errorMessage = 'Cannot connect to Kerala SEC website. Please check your internet connection or try again later.';
    }
    
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
    if (sessionId && activeSessions.has(sessionId)) {
      activeSessions.delete(sessionId);
    }
    res.status(503).json({ 
      status: 'error', 
      message: errorMessage,
      technicalError: error.message,
      hint: 'The Kerala SEC website may be temporarily unavailable. Please try again in a few minutes.'
    });
  }
});

/**
 * POST /api/submitWithCaptcha
 * Submits the form using the existing browser session
 */
router.post('/submitWithCaptcha', async (req, res) => {
  try {
    const { sessionId, district, local_body, ward, polling_station, language, captcha } = req.body;

    if (!sessionId || !activeSessions.has(sessionId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired session. Please refresh captcha.'
      });
    }

    const session = activeSessions.get(sessionId);
    const { page } = session;

    console.log('Filling form with existing session...');

    // Force all select elements to be visible
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      selects.forEach(select => {
        select.style.display = 'block';
        select.style.visibility = 'visible';
        select.style.opacity = '1';
        select.style.position = 'static';
        select.disabled = false;
      });
    });

    // Check if district dropdown is visible
    const districtVisible = await page.isVisible('#view_voters_list_district');
    if (!districtVisible) {
      await page.evaluate(() => {
        const select = document.querySelector('#view_voters_list_district');
        if (select) {
          select.scrollIntoView();
          select.style.display = 'block';
          select.style.visibility = 'visible';
        }
      });
      await page.waitForTimeout(1000);
    }

    // Select district
    await page.selectOption('#view_voters_list_district', district);
    console.log('[CAPTCHA] District selected, waiting for local bodies...');
    await page.waitForTimeout(3000); // Wait for AJAX to load local bodies

    // Wait for local body options to be loaded (check if there are options with values)
    await page.waitForFunction(
      () => {
        const select = document.querySelector('#view_voters_list_localBody');
        return select && select.options.length > 1;
      },
      { timeout: 15000 }
    );
    
    // Force local body select to be visible
    await page.evaluate(() => {
      const select = document.querySelector('#view_voters_list_localBody');
      if (select) {
        select.style.display = 'block';
        select.style.visibility = 'visible';
        select.style.opacity = '1';
        select.disabled = false;
      }
    });
    
    // Select local body
    console.log('[CAPTCHA] Selecting local body...');
    await page.selectOption('#view_voters_list_localBody', local_body);
    await page.waitForTimeout(3000); // Wait for AJAX to load wards

    // Wait for ward options to be loaded
    await page.waitForFunction(
      () => {
        const select = document.querySelector('#view_voters_list_ward');
        return select && select.options.length > 1;
      },
      { timeout: 15000 }
    );
    
    // Force ward select to be visible
    await page.evaluate(() => {
      const select = document.querySelector('#view_voters_list_ward');
      if (select) {
        select.style.display = 'block';
        select.style.visibility = 'visible';
        select.style.opacity = '1';
        select.disabled = false;
      }
    });
    
    // Select ward
    console.log('[CAPTCHA] Selecting ward...');
    await page.selectOption('#view_voters_list_ward', ward);
    await page.waitForTimeout(3000); // Wait for AJAX to load polling stations

    // Wait for polling station options to be loaded
    await page.waitForFunction(
      () => {
        const select = document.querySelector('#view_voters_list_pollingStation');
        return select && select.options.length > 1;
      },
      { timeout: 15000 }
    );
    
    // Force polling station select to be visible
    await page.evaluate(() => {
      const select = document.querySelector('#view_voters_list_pollingStation');
      if (select) {
        select.style.display = 'block';
        select.style.visibility = 'visible';
        select.style.opacity = '1';
        select.disabled = false;
      }
    });
    
    // Select polling station
    console.log('[CAPTCHA] Selecting polling station...');
    await page.selectOption('#view_voters_list_pollingStation', polling_station);
    await page.waitForTimeout(1000);

    // Select language
    console.log('[CAPTCHA] Selecting language...');
    await page.selectOption('#view_voters_list_language', language);
    await page.waitForTimeout(500);

    // Fill captcha
    console.log('[CAPTCHA] Filling captcha...');
    await page.fill('#view_voters_list_captcha', captcha);
    await page.waitForTimeout(500);

    // Get CSRF token
    const csrfToken = await page.$eval('#view_voters_list__token', el => el.value).catch(() => '');
    console.log('[CAPTCHA] CSRF token retrieved');

    // Submit form via XHR
    console.log('[CAPTCHA] Submitting form via XHR...');
    const formData = new URLSearchParams({
      'view_voters_list[district]': district,
      'view_voters_list[localBody]': local_body,
      'view_voters_list[ward]': ward,
      'view_voters_list[pollingStation]': polling_station,
      'view_voters_list[language]': language,
      'view_voters_list[captcha]': captcha,
      'view_voters_list[_token]': csrfToken
    });

    const submitResult = await page.evaluate(async (params) => {
      const response = await fetch(params.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: params.data
      });
      const text = await response.text();
      
      // Try to parse as JSON first
      let jsonData = null;
      try {
        jsonData = JSON.parse(text);
      } catch (e) {
        // Not JSON, it's HTML
      }
      
      return {
        ok: response.ok,
        status: response.status,
        html: text,
        json: jsonData
      };
    }, { url: `${SEC_BASE_URL}/public/voters/list`, data: formData.toString() });

    console.log('[CAPTCHA] Form submission result:', submitResult.status);
    console.log('[CAPTCHA] Response HTML length:', submitResult.html.length);
    
    // Check if response is JSON with error
    if (submitResult.json) {
      console.log('[CAPTCHA] JSON Response status:', submitResult.json.status);
      
      if (submitResult.json.status === 'danger' || submitResult.json.status === 'error') {
        await session.browser.close();
        activeSessions.delete(sessionId);
        const captchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${sessionId}.png`);
        if (fs.existsSync(captchaPath)) {
          fs.unlinkSync(captchaPath);
        }
        
        return res.status(400).json({
          status: 'error',
          message: submitResult.json.message || 'Captcha validation failed. Please try again.'
        });
      }
      
      // If status is success, extract the voter HTML from form2
      if (submitResult.json.status === 'success' && submitResult.json.form2) {
        console.log('[CAPTCHA] Success! Extracting voter data from form2');
        submitResult.html = submitResult.json.form2;
      }
    }
    
    console.log('[CAPTCHA] Response preview:', submitResult.html.substring(0, 500));

    // Close the browser session
    await session.browser.close();
    activeSessions.delete(sessionId);

    // Delete captcha file
    const captchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${sessionId}.png`);
    if (fs.existsSync(captchaPath)) {
      fs.unlinkSync(captchaPath);
    }

    if (!submitResult.ok) {
      return res.status(400).json({
        status: 'error',
        message: `Form submission failed with status ${submitResult.status}`,
        html: submitResult.html.substring(0, 1000) // Include first 1000 chars for debugging
      });
    }

    // Check if response contains voter table or error/form
    const hasVoterTable = submitResult.html.includes('voters-list') || 
                         submitResult.html.includes('voter') ||
                         submitResult.html.includes('table');
    
    console.log('[CAPTCHA] Has voter table indicators:', hasVoterTable);

    // Return the HTML response to be parsed
    res.json({
      status: 'success',
      html: submitResult.html
    });

  } catch (error) {
    console.error('Error submitting with captcha:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to submit form',
      error: error.message
    });
  }
});

export default router;
