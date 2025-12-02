import express from 'express';
import { browserPool } from '../utils/browserPool.js';
import { sessionManager } from '../utils/sessionManager.js';
import { captchaQueue } from '../utils/requestQueue.js';
import { createLogger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const SEC_BASE_URL = process.env.SEC_BASE_URL || 'https://sec.kerala.gov.in';
const logger = createLogger('Captcha');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * GET /api/prewarm-captcha
 * Pre-warms a browser session by loading SEC page (no screenshot yet)
 * Returns sessionId for instant captcha later
 */
router.get('/prewarm-captcha', async (req, res) => {
  const sessionId = `prewarm-${Date.now()}`;
  
  try {
    console.log(`[PREWARM] Starting pre-warm for session ${sessionId}...`);
    
    // Check browser pool capacity - only prewarm if we have resources
    const stats = browserPool.getStats();
    if (stats.activeSessions >= 15) {
      console.log('[PREWARM] Browser pool busy, skipping pre-warm');
      return res.json({ 
        success: false, 
        message: 'System busy, will load captcha on demand',
        sessionId: null 
      });
    }
    
    // Queue the request
    captchaQueue.add(async () => {
      const context = await browserPool.getBrowserContext(sessionId);
      const page = await context.newPage();
      
      // Set higher default timeout for slow government website
      page.setDefaultTimeout(90000); // 90 seconds

      // Block unnecessary resources
      await page.route('**/*', (route) => {
        const url = route.request().url();
        const resourceType = route.request().resourceType();
        
        if (
          resourceType === 'font' ||
          resourceType === 'media' ||
          url.includes('google-analytics') ||
          url.includes('googletagmanager') ||
          url.includes('facebook') ||
          url.includes('doubleclick')
        ) {
          route.abort();
        } else {
          route.continue();
        }
      });

      try {
        // Load SEC page with domcontentloaded for speed
        console.log('[PREWARM] Loading SEC page...');
        await page.goto(`${SEC_BASE_URL}/public/voters/list`, { 
          waitUntil: 'domcontentloaded', // Faster than 'load'
          timeout: 60000
        });
        
        console.log('[PREWARM] Page loaded, minimal stabilization...');
        await page.waitForTimeout(100);
        
        // Verify captcha is present but don't screenshot yet
        const captchaExists = await page.$('img[src*="captcha"]');
        if (!captchaExists) {
          throw new Error('Captcha not found during pre-warm');
        }
        
        console.log(`✅ [PREWARM] Session ${sessionId} ready`);
        
        // Store session with page context (expires in 3 minutes)
        sessionManager.createSession(sessionId, context, page, {
          prewarmed: true,
          createdAt: Date.now()
        });
        
      } catch (error) {
        console.error('[PREWARM] Error:', error.message);
        await context.close();
        throw error;
      }
    }).catch(err => {
      console.error('[PREWARM] Queue error:', err.message);
    });
    
    // Return immediately - session will be ready in 1-2 seconds
    res.json({ 
      success: true, 
      sessionId,
      message: 'Pre-warming captcha session...'
    });
    
  } catch (error) {
    console.error('[PREWARM] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to pre-warm session' 
    });
  }
});

/**
 * GET /api/initCaptchaSession
 * Initializes a headless browser session and captures the captcha image
 * Returns a session ID and the captcha image path
 * Can optionally use a pre-warmed session for instant loading
 */
router.get('/initCaptchaSession', async (req, res) => {
  const prewarmSessionId = req.query.sessionId; // Optional pre-warmed session
  const sessionId = prewarmSessionId || Date.now().toString();
  const startTime = Date.now();
  
  try {
    console.log(`[CAPTCHA] Initializing session ${sessionId}...`);
    
    // Check if this is a pre-warmed session
    const existingSession = sessionManager.getSession(sessionId);
    if (existingSession && existingSession.metadata?.prewarmed) {
      console.log(`[CAPTCHA] ⚡ Using pre-warmed session ${sessionId} - instant load!`);
      
      // Just take screenshot of captcha from existing page
      const result = await captchaQueue.add(async () => {
        const page = existingSession.page;
        const context = existingSession.context;
        
        // Find captcha element (should be instant)
        const captchaElement = await page.$('img[src*="captcha"]') || 
                             await page.$('#view_voters_list_captcha_image');
        
        if (!captchaElement) {
          throw new Error('Captcha not found in pre-warmed session');
        }
        
        // Take screenshot of captcha element
        const captchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${sessionId}.png`);
        const captchaDir = path.dirname(captchaPath);
        await fs.promises.mkdir(captchaDir, { recursive: true });
        
        await captchaElement.screenshot({ path: captchaPath });
        console.log(`✅ [CAPTCHA] Instant screenshot from pre-warmed session`);
        
        // Update session - no longer pre-warmed, now active
        sessionManager.updateSession(sessionId, {
          ...existingSession.metadata,
          prewarmed: false,
          screenshotTaken: true
        });
        
        return {
          sessionId,
          captchaImageUrl: `/captcha-cache/captcha-${sessionId}.png`,
          context,
          page,
          timings: {
            total: Date.now() - startTime,
            instant: true
          }
        };
      });
      
      const totalTime = Date.now() - startTime;
      console.log(`[CAPTCHA] ⏱️  Total session initialization time: ${totalTime}ms (pre-warmed)`);

      return res.json({
        success: true,
        sessionId: result.sessionId,
        captchaUrl: result.captchaImageUrl, // Use captchaUrl for consistency
        timings: result.timings
      });
    }
    
    // Not pre-warmed - do full initialization
    console.log(`[CAPTCHA] No pre-warm available, loading fresh session...`);
    
    // Queue the request to prevent overload
    const result = await captchaQueue.add(async () => {
      const contextStartTime = Date.now();
      
      let context;
      try {
        // Get isolated context from browser pool
        context = await browserPool.getBrowserContext(sessionId);
      } catch (contextError) {
        console.error(`❌ Failed to get browser context:`, contextError.message);
        throw new Error('Browser pool unavailable. Please try again.');
      }
      
      const contextTime = Date.now() - contextStartTime;
      console.log(`[CAPTCHA] ⏱️  Browser context acquired in ${contextTime}ms`);
      
      let page;
      try {
        page = await context.newPage();
      } catch (pageError) {
        console.error(`❌ Failed to create new page:`, pageError.message);
        // Clean up context before throwing
        try {
          await browserPool.releaseContext(context);
        } catch (cleanupError) {
          console.error(`⚠️ Error during context cleanup:`, cleanupError.message);
        }
        throw new Error('Failed to initialize browser page. Please try again.');
      }
      
      // Set higher default timeout for slow government website
      page.setDefaultTimeout(120000); // 120 seconds (2 minutes)

      // Block unnecessary resources for faster loading (like ad blockers)
      await page.route('**/*', (route) => {
        const url = route.request().url();
        const resourceType = route.request().resourceType();
        
        // Block ads, analytics, fonts that slow down page
        if (
          resourceType === 'font' ||
          resourceType === 'media' ||
          url.includes('google-analytics') ||
          url.includes('googletagmanager') ||
          url.includes('facebook') ||
          url.includes('doubleclick')
        ) {
          route.abort();
        } else {
          route.continue();
        }
      });

      try {
        // First, navigate to home page and set Malayalam locale by actually navigating to it
        console.log('[CAPTCHA] Setting locale to Malayalam...');
        await page.goto(`${SEC_BASE_URL}/?set_locale=ml`, { 
          waitUntil: 'domcontentloaded',
          timeout: 120000 // Increased to 120 seconds
        });
        
        console.log('[CAPTCHA] Malayalam locale set via URL, waiting...');
        await page.waitForTimeout(1000);
        
        // Verify cookie is set
        const cookies = await page.context().cookies();
        const localeCookie = cookies.find(c => c.name === 'set_locale');
        console.log('[CAPTCHA] 📍 Locale cookie:', localeCookie ? localeCookie.value : 'NOT SET');

        // Navigate to the page with extended timeout and retry logic
        const pageLoadStartTime = Date.now();
        console.log('[CAPTCHA] Loading SEC voter list page in Malayalam...');
        let pageLoaded = false;
        let retries = 3;
        
        while (!pageLoaded && retries > 0) {
          try {
            await page.goto(`${SEC_BASE_URL}/public/voters/list`, { 
              waitUntil: 'domcontentloaded', // Much faster than 'load'
              timeout: 120000 // Increased to 120 seconds
            });
            pageLoaded = true;
            const pageLoadTime = Date.now() - pageLoadStartTime;
            console.log(`[CAPTCHA] ⏱️  Page loaded successfully in ${pageLoadTime}ms`);
          } catch (error) {
            retries--;
            const attemptTime = Date.now() - pageLoadStartTime;
            console.log(`[CAPTCHA] ⏱️  Page load timeout after ${attemptTime}ms, retries remaining: ${retries}`);
            if (retries === 0) {
              throw new Error('Kerala SEC website is currently unreachable or experiencing heavy traffic. Please try again in a few minutes.');
            }
            await page.waitForTimeout(2000); // Wait 2 seconds before retry
          }
        }

        console.log('[CAPTCHA] Page loaded, waiting for captcha to appear...');
        
        // Wait for captcha image to load - try multiple selectors
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
            captchaElement = await page.waitForSelector(selector, { 
              state: 'visible',
              timeout: 30000
            });
            
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
          // Last resort: take screenshot of entire page for debugging
          const debugPath = path.join(__dirname, '..', 'public', 'captcha-cache', `debug-${sessionId}.png`);
          await page.screenshot({ path: debugPath, fullPage: true });
          console.log('[CAPTCHA] Debug screenshot saved to:', debugPath);
          throw new Error('Captcha image not found on page. Debug screenshot saved.');
        }

        // Take screenshot of captcha element
        const screenshotStartTime = Date.now();
        const captchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${sessionId}.png`);
        console.log('[CAPTCHA] Taking screenshot to:', captchaPath);
        
        // Ensure directory exists
        const captchaDir = path.dirname(captchaPath);
        try {
          await fs.promises.mkdir(captchaDir, { recursive: true });
          console.log('[CAPTCHA] Directory verified:', captchaDir);
        } catch (dirError) {
          console.error('[CAPTCHA] ❌ Failed to create directory:', dirError.message);
          console.error('[CAPTCHA] Directory path:', captchaDir);
          console.error('[CAPTCHA] Process CWD:', process.cwd());
          throw new Error(`Cannot create captcha directory: ${dirError.message}`);
        }

        // Take screenshot of the captcha element
        try {
          await captchaElement.screenshot({ path: captchaPath });
          const screenshotTime = Date.now() - screenshotStartTime;
          console.log(`✅ Captcha screenshot saved: captcha-${sessionId}.png (took ${screenshotTime}ms)`);
          
          // Verify file exists
          const fileExists = await fs.promises.access(captchaPath).then(() => true).catch(() => false);
          if (!fileExists) {
            throw new Error('Screenshot saved but file not accessible');
          }
          console.log('[CAPTCHA] ✅ File verified accessible at:', captchaPath);
        } catch (screenshotError) {
          console.error('[CAPTCHA] ❌ Screenshot failed:', screenshotError.message);
          console.error('[CAPTCHA] Target path:', captchaPath);
          throw new Error(`Failed to save captcha screenshot: ${screenshotError.message}`);
        }
        
        const screenshotTime = Date.now() - screenshotStartTime;
        const totalTime = Date.now() - startTime;
        console.log(`[CAPTCHA] ⏱️  Total session initialization time: ${totalTime}ms`);

        // Store the session using session manager with extended timeout (10 minutes for form filling)
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
        
        // Extend session timeout to 10 minutes to give user time to fill form
        sessionManager.extend(sessionId, 10 * 60 * 1000); // 10 minutes

        return {
          status: 'success',
          sessionId,
          captchaUrl: `/captcha-cache/captcha-${sessionId}.png?t=${Date.now()}`,
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
    
    // Check if error is due to shutdown
    const isShutdownError = error.message && (
      error.message.includes('shutting down') || 
      error.message.includes('has been closed') ||
      error.message.includes('Target page, context or browser')
    );
    
    res.status(isShutdownError ? 503 : 500).json({ 
      status: 'error', 
      message: isShutdownError 
        ? 'Service is temporarily unavailable. Please try again in a moment.'
        : 'Failed to initialize captcha session',
      error: error.message,
      retryable: isShutdownError
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

    console.log('[CAPTCHA SUBMIT] Request body:', {
      sessionId,
      district,
      local_body,
      ward,
      polling_station,
      language,
      captchaLength: captcha?.length
    });

    // Get session from session manager
    const session = sessionManager.get(sessionId);
    
    if (!session) {
      console.error('[CAPTCHA SUBMIT] Session not found:', sessionId);
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
      { timeout: 90000 } // Increased to 90s for slow government website
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
      { timeout: 90000 } // Increased to 90s for slow government website
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
      { timeout: 90000 } // Increased to 90s for slow government website
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

    // ✅ EXTRACT MALAYALAM POLLING STATION NAME HERE - AFTER locale set and option selected
    // The page is already in Malayalam locale, and the option text is in Malayalam
    let pollingStationMalayalam = null;
    try {
      // Wait a bit for Chosen.js to update the dropdown
      await page.waitForTimeout(500);
      
      pollingStationMalayalam = await page.$eval(
        `#view_voters_list_pollingStation option[value="${polling_station}"]`,
        el => el.textContent.trim()
      );
      console.log('[CAPTCHA] 📍 Malayalam Polling Station extracted from page (AFTER locale set):', pollingStationMalayalam);
    } catch (extractError) {
      console.error('[CAPTCHA] Failed to extract Malayalam polling station from page:', extractError);
      
      // Try to debug - log all options
      try {
        const allOptions = await page.$$eval(
          '#view_voters_list_pollingStation option',
          options => options.map(opt => ({ value: opt.value, text: opt.textContent.trim().substring(0, 50) }))
        );
        console.log('[CAPTCHA] Available polling station options:', JSON.stringify(allOptions.slice(0, 5), null, 2));
      } catch (debugErr) {
        console.error('[CAPTCHA] Could not debug options:', debugErr.message);
      }
    }

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

    // Click the submit button instead of using XHR in evaluate
    // This allows the page to naturally update with the response
    console.log('[CAPTCHA] Clicking submit button...');
    
    try {
      await page.click('button[data-success-path="/public/voters/list"]');
    } catch (clickError) {
      console.error('[CAPTCHA] ❌ Failed to click submit button:', clickError.message);
      
      // Cleanup
      await sessionManager.cleanup(sessionId);
      const captchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${sessionId}.png`);
      if (fs.existsSync(captchaPath)) {
        fs.unlinkSync(captchaPath);
      }
      
      // Get custom error message from settings
      let customTitle = 'SEC Website Unavailable';
      let customMessage = 'The SEC website appears to be unavailable or experiencing issues. Please try again later.';
      
      try {
        const Settings = (await import('../models/Settings.js')).default;
        const secErrorSettings = await Settings.getSettings('secError');
        if (secErrorSettings) {
          customTitle = secErrorSettings.title || customTitle;
          customMessage = secErrorSettings.message || customMessage;
        }
      } catch (settingsError) {
        console.error('[CAPTCHA] Failed to load SEC error settings:', settingsError.message);
      }
      
      return res.status(503).json({
        status: 'error',
        errorType: 'SEC_WEBSITE_ERROR',
        message: customMessage,
        customErrorTitle: customTitle,
        customErrorMessage: customMessage,
        technicalDetails: clickError.message
      });
    }
    
    // Wait for the page to update with the response
    // The page will update .ajxpos div with voter data and update the form
    console.log('[CAPTCHA] ⏳ Waiting for page to update with response...');
    await page.waitForTimeout(5000); // Give more time for XHR response and DOM update (increased from 3s to 5s)
    
    // Get the entire page HTML after it's been updated
    let submitResult;
    try {
      submitResult = {
        ok: true,
        status: 200,
        html: await page.content()
      };
    } catch (contentError) {
      console.error('[CAPTCHA] ❌ Failed to get page content:', contentError.message);
      
      // Cleanup
      await sessionManager.cleanup(sessionId);
      const captchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${sessionId}.png`);
      if (fs.existsSync(captchaPath)) {
        fs.unlinkSync(captchaPath);
      }
      
      // Get custom error message from settings
      let customTitle = 'SEC Website Unavailable';
      let customMessage = 'The SEC website appears to be unavailable or experiencing issues. Please try again later.';
      
      try {
        const Settings = (await import('../models/Settings.js')).default;
        const secErrorSettings = await Settings.getSettings('secError');
        if (secErrorSettings) {
          customTitle = secErrorSettings.title || customTitle;
          customMessage = secErrorSettings.message || customMessage;
        }
      } catch (settingsError) {
        console.error('[CAPTCHA] Failed to load SEC error settings:', settingsError.message);
      }
      
      return res.status(503).json({
        status: 'error',
        errorType: 'SEC_WEBSITE_ERROR',
        message: customMessage,
        customErrorTitle: customTitle,
        customErrorMessage: customMessage,
        technicalDetails: contentError.message
      });
    }

    console.log('[CAPTCHA] Form submission result:', submitResult.status);
    console.log('[CAPTCHA] Response HTML length:', submitResult.html.length);
    
    // Check if the page contains error indicators from SEC website
    const hasServerError = submitResult.html.includes('500 Internal Server Error') ||
                          submitResult.html.includes('503 Service Unavailable') ||
                          submitResult.html.includes('502 Bad Gateway') ||
                          submitResult.html.includes('504 Gateway Timeout') ||
                          submitResult.html.includes('Application Error') ||
                          submitResult.html.includes('temporarily unavailable');
    
    if (hasServerError) {
      console.error('[CAPTCHA] ❌ SEC website returned server error');
      
      // Get custom error message from settings
      let customTitle = 'SEC Website Unavailable';
      let customMessage = 'The SEC Kerala website is currently experiencing technical difficulties. Please try again after some time.';
      
      try {
        const Settings = (await import('../models/Settings.js')).default;
        const secErrorSettings = await Settings.getSettings('secError');
        if (secErrorSettings) {
          customTitle = secErrorSettings.title || customTitle;
          customMessage = secErrorSettings.message || customMessage;
        }
      } catch (settingsError) {
        console.error('[CAPTCHA] Failed to load SEC error settings:', settingsError.message);
      }
      
      // Cleanup
      await sessionManager.cleanup(sessionId);
      const captchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${sessionId}.png`);
      if (fs.existsSync(captchaPath)) {
        fs.unlinkSync(captchaPath);
      }
      
      return res.status(503).json({
        status: 'error',
        errorType: 'SEC_WEBSITE_ERROR',
        message: customMessage,
        customErrorTitle: customTitle,
        customErrorMessage: customMessage,
        technicalDetails: 'Server error detected in response'
      });
    }

    if (!submitResult.ok) {
      // Cleanup before returning error
      await sessionManager.cleanup(sessionId);
      
      // Delete captcha file
      const captchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${sessionId}.png`);
      if (fs.existsSync(captchaPath)) {
        fs.unlinkSync(captchaPath);
      }
      
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

    // After form submission, the ENTIRE response HTML contains the updated form with Malayalam
    // Extract Malayalam polling station from the response HTML, not from the page
    console.log('[CAPTCHA] 🔍 Extracting Malayalam polling station from response HTML...');
    try {
      const cheerio = await import('cheerio');
      const $ = cheerio.load(submitResult.html);
      
      // Find the selected polling station option
      const selectedOption = $(`#view_voters_list_pollingStation option[selected="selected"]`);
      if (selectedOption.length > 0) {
        pollingStationMalayalam = selectedOption.text().trim();
        console.log('[CAPTCHA] 📍 ✅ Malayalam Polling Station from response HTML:', pollingStationMalayalam);
      } else {
        // Fallback: try to find by value
        const optionByValue = $(`#view_voters_list_pollingStation option[value="${polling_station}"]`);
        if (optionByValue.length > 0) {
          pollingStationMalayalam = optionByValue.text().trim();
          console.log('[CAPTCHA] 📍 ✅ Malayalam Polling Station (by value):', pollingStationMalayalam);
        } else {
          console.log('[CAPTCHA] ⚠️ Could not find polling station in response HTML');
          // Log available options for debugging
          const allOptions = $(`#view_voters_list_pollingStation option`);
          console.log('[CAPTCHA] Available options count:', allOptions.length);
          allOptions.each((i, el) => {
            if (i < 3) { // Log first 3 for debugging
              console.log(`[CAPTCHA]   Option ${i}: value="${$(el).attr('value')}", text="${$(el).text().trim().substring(0, 50)}"`);
            }
          });
        }
      }
    } catch (parseError) {
      console.error('[CAPTCHA] ❌ Failed to parse Malayalam from response:', parseError.message);
    }

    // Return the HTML response to be parsed FIRST
    res.json({
      status: 'success',
      html: submitResult.html,
      pollingStationMalayalam: pollingStationMalayalam || null
    });

    // Keep browser open and captcha file for 1 minute for user to view results
    console.log('[CAPTCHA] ⏳ Keeping browser and captcha file for 60 seconds...');
    await new Promise(resolve => setTimeout(resolve, 60000)); // Changed from 5s to 60s
    console.log('[CAPTCHA] ✅ Now cleaning up session...');

    // NOW cleanup session after delay
    await sessionManager.cleanup(sessionId);

    // Delete captcha file after 1 minute
    const captchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${sessionId}.png`);
    if (fs.existsSync(captchaPath)) {
      fs.unlinkSync(captchaPath);
      console.log(`🗑️ Captcha file deleted: captcha-${sessionId}.png`);
    }

  } catch (error) {
    console.error('❌ Error submitting with captcha:', error);
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Send detailed error for debugging
    res.status(500).json({
      status: 'error',
      message: 'Failed to submit form',
      error: error.message,
      errorType: error.constructor.name
    });
  }
});

export default router;
