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

        // Navigate to the voter list page to establish session and get captcha token
        const pageLoadStartTime = Date.now();
        console.log('[CAPTCHA] Loading SEC page to establish session...');
        
        await page.goto(`${SEC_BASE_URL}/public/voters/list`, { 
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        
        const pageLoadTime = Date.now() - pageLoadStartTime;
        console.log(`[CAPTCHA] ⏱️  Page loaded in ${pageLoadTime}ms`);
        
        // Extract the captcha token from the page
        console.log('[CAPTCHA] Extracting captcha token from page...');
        const captchaToken = await page.evaluate(() => {
          // Try to find the captcha image src with the token
          const captchaImg = document.querySelector('img[src*="generate-captcha"]');
          if (captchaImg) {
            const src = captchaImg.src;
            const match = src.match(/n=([a-f0-9]+)/);
            return match ? match[1] : null;
          }
          return null;
        });

        if (!captchaToken) {
          console.log('[CAPTCHA] Could not extract captcha token, falling back to page screenshot');
          // Fallback: screenshot captcha from page
          const captchaElement = await page.$('img[src*="captcha"]') || 
                                  await page.$('#view_voters_list_captcha_image') ||
                                  await page.$('.captcha-image');
          
          if (!captchaElement) {
            throw new Error('Captcha element not found on page');
          }

          const screenshotStartTime = Date.now();
          const captchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${sessionId}.png`);
          
          const captchaDir = path.dirname(captchaPath);
          if (!fs.existsSync(captchaDir)) {
            fs.mkdirSync(captchaDir, { recursive: true });
          }

          await captchaElement.screenshot({ path: captchaPath });
          const screenshotTime = Date.now() - screenshotStartTime;
          console.log(`✅ Captcha screenshot saved: captcha-${sessionId}.png (took ${screenshotTime}ms)`);

          const totalTime = Date.now() - startTime;
          console.log(`[CAPTCHA] ⏱️  Total session initialization time: ${totalTime}ms`);

          sessionManager.create(sessionId, context, page, {
            userId: req.user?.id || 'anonymous',
            createdFor: 'captcha',
            timings: {
              total: totalTime,
              context: contextTime,
              pageLoad: pageLoadTime,
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
              pageLoad: pageLoadTime
            }
          };
        }

        // Now load the captcha directly using the token
        const captchaLoadStartTime = Date.now();
        console.log(`[CAPTCHA] Loading captcha image directly with token: ${captchaToken}`);
        
        const captchaImageUrl = `${SEC_BASE_URL}/generate-captcha/_captcha_captcha?n=${captchaToken}`;
        await page.goto(captchaImageUrl, {
          waitUntil: 'networkidle',
          timeout: 10000
        });
        
        const captchaLoadTime = Date.now() - captchaLoadStartTime;
        console.log(`[CAPTCHA] ⏱️  Captcha image loaded in ${captchaLoadTime}ms`);

        // Take screenshot of the entire viewport (which should just be the captcha image)
        const screenshotStartTime = Date.now();
        const captchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${sessionId}.png`);
        console.log('[CAPTCHA] Taking screenshot to:', captchaPath);
        
        // Ensure directory exists
        const captchaDir = path.dirname(captchaPath);
        if (!fs.existsSync(captchaDir)) {
          fs.mkdirSync(captchaDir, { recursive: true });
        }

        await page.screenshot({ path: captchaPath });
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
            pageLoad: pageLoadTime,
            captchaLoad: captchaLoadTime,
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
            pageLoad: pageLoadTime,
            captchaLoad: captchaLoadTime
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
    await page.waitForTimeout(5000); // Increased wait for slow AJAX

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
    await page.waitForTimeout(5000); // Increased wait for slow AJAX

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
    await page.waitForTimeout(5000); // Increased wait for slow AJAX

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
