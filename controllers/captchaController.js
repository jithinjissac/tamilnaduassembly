import express from 'express';
import { browserPool } from '../utils/browserPool.js';
import { sessionManager } from '../utils/sessionManager.js';
import { captchaQueue } from '../utils/requestQueue.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const SEC_BASE_URL = process.env.SEC_BASE_URL || 'https://sec.kerala.gov.in';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * GET /api/initCaptchaSession
 * Initializes a headless browser session and captures the captcha image
 * Returns a session ID and the captcha image path
 */
router.get('/initCaptchaSession', async (req, res) => {
  const sessionId = Date.now().toString();
  const startTime = Date.now();
  
  try {
    console.log(`[CAPTCHA] Initializing session ${sessionId}...`);
    
    // Queue the request to prevent overload
    const result = await captchaQueue.add(async () => {
      const contextStartTime = Date.now();
      // Get isolated context from browser pool
      const context = await browserPool.getBrowserContext(sessionId);
      const contextTime = Date.now() - contextStartTime;
      console.log(`[CAPTCHA] ⏱️  Browser context acquired in ${contextTime}ms`);
      
      const page = await context.newPage();

      try {
        // Skip cookie setting for speed - page works without it
        // Saves ~200ms per captcha load

        // Navigate to the page with extended timeout and retry logic
        const pageLoadStartTime = Date.now();
        console.log('[CAPTCHA] Loading SEC page...');
        let pageLoaded = false;
        let retries = 3;
        
        while (!pageLoaded && retries > 0) {
          try {
            await page.goto(`${SEC_BASE_URL}/public/voters/list`, { 
              waitUntil: 'domcontentloaded',
              timeout: 60000 // Reduced from 90s - fail faster if SEC is down
            });
            pageLoaded = true;
            const pageLoadTime = Date.now() - pageLoadStartTime;
            console.log(`[CAPTCHA] ⏱️  Page loaded successfully in ${pageLoadTime}ms`);
          } catch (error) {
            retries--;
            const attemptTime = Date.now() - pageLoadStartTime;
            console.log(`[CAPTCHA] ⏱️  Page load timeout after ${attemptTime}ms, retries remaining: ${retries}`);
            if (retries === 0) {
              throw new Error('SEC website is too slow. Please try again later.');
            }
            await page.waitForTimeout(2000); // Wait before retry
          }
        }

        console.log('[CAPTCHA] Page loaded, waiting for stabilization...');
        await page.waitForTimeout(500); // Reduced from 3s to 500ms for speed

        // Wait for captcha image to load - try multiple selectors with extended timeout
        const captchaSearchStartTime = Date.now();
        console.log('[CAPTCHA] Waiting for captcha image...');
        
        let captchaElement = null;
        // Reordered for fastest detection - most reliable selector first
        const captchaSelectors = [
          'img[src*="captcha"]',           // Fastest & most reliable
          '#view_voters_list_captcha_image', // Direct ID
          'img[src*="Captcha"]',           // Uppercase variant
          'img[alt*="captcha" i]',          // Alt text fallback
          '.captcha-image'                   // Class fallback
        ];
        
        for (const selector of captchaSelectors) {
          try {
            console.log(`[CAPTCHA] Trying selector: ${selector}`);
            await page.waitForSelector(selector, { 
              state: 'visible',
              timeout: 5000 // Fast timeout - captcha should be immediate
            });
            captchaElement = await page.$(selector);
            if (captchaElement) {
              const captchaSearchTime = Date.now() - captchaSearchStartTime;
              console.log(`[CAPTCHA] ⏱️  Found captcha with selector: ${selector} in ${captchaSearchTime}ms`);
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
        const screenshotStartTime = Date.now();
        const captchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${sessionId}.png`);
        console.log('[CAPTCHA] Taking screenshot to:', captchaPath);
        
        // Ensure directory exists (concurrent with screenshot)
        const captchaDir = path.dirname(captchaPath);
        const dirPromise = fs.promises.mkdir(captchaDir, { recursive: true }).catch(() => {});

        // Take screenshot immediately (don't wait for dir check)
        const screenshotPromise = captchaElement.screenshot({ path: captchaPath });
        
        // Wait for both
        await Promise.all([dirPromise, screenshotPromise]);
        const screenshotTime = Date.now() - screenshotStartTime;
        console.log(`✅ Captcha screenshot saved: captcha-${sessionId}.png (took ${screenshotTime}ms)`);

        const totalTime = Date.now() - startTime;
        console.log(`[CAPTCHA] ⏱️  Total session initialization time: ${totalTime}ms`);

        // Store the session using session manager
        sessionManager.create(sessionId, context, page, {
          userId: req.user?.id || 'anonymous',
          createdFor: 'captcha',
          timings: {
            total: totalTime,
            context: contextTime,
            pageLoad: Date.now() - pageLoadStartTime,
            captchaSearch: Date.now() - captchaSearchStartTime,
            screenshot: screenshotTime
          }
        });

        return {
          status: 'success',
          sessionId,
          captchaUrl: `/captcha-cache/captcha-${sessionId}.png`,
          message: 'Captcha session initialized',
          timings: {
            total: totalTime,
            pageLoad: Date.now() - pageLoadStartTime
          }
        };

      } catch (error) {
        // Release context on error
        await browserPool.releaseContext(context);
        throw error;
      }
    });

    res.json(result);

  } catch (error) {
    console.error('❌ Error initializing captcha session:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to initialize captcha session',
      error: error.message 
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

    // Get session from session manager
    const session = sessionManager.get(sessionId);
    
    if (!session) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired session. Please refresh captcha.'
      });
    }

    const { page } = session;

    console.log('[CAPTCHA] Filling form with existing session...');

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
    await page.waitForTimeout(2000); // Optimized - most AJAX loads in 1-2s

    // Wait for local body options to be loaded (check if there are options with values)
    await page.waitForFunction(
      () => {
        const select = document.querySelector('#view_voters_list_localBody');
        return select && select.options.length > 1;
      },
      { timeout: 30000 } // Increased from 15s to 30s
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
    await page.waitForTimeout(2000); // Optimized - most AJAX loads in 1-2s

    // Wait for ward options to be loaded
    await page.waitForFunction(
      () => {
        const select = document.querySelector('#view_voters_list_ward');
        return select && select.options.length > 1;
      },
      { timeout: 30000 } // Increased from 15s to 30s
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
    await page.waitForTimeout(2000); // Optimized - most AJAX loads in 1-2s

    // Wait for polling station options to be loaded
    await page.waitForFunction(
      () => {
        const select = document.querySelector('#view_voters_list_pollingStation');
        return select && select.options.length > 1;
      },
      { timeout: 30000 } // Increased from 15s to 30s
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
    await page.waitForTimeout(100); // Reduced for speed

    // Select language
    console.log('[CAPTCHA] Selecting language...');
    await page.selectOption('#view_voters_list_language', language);
    await page.waitForTimeout(100); // Reduced for speed

    // Fill captcha
    console.log('[CAPTCHA] Filling captcha...');
    await page.fill('#view_voters_list_captcha', captcha);
    await page.waitForTimeout(100); // Reduced for speed

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
        // Cleanup session
        await sessionManager.cleanup(sessionId);
        
        // Delete captcha file
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

    // Cleanup session after use
    await sessionManager.cleanup(sessionId);

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
