import express from 'express';
import { browserPool } from '../utils/browserPool.js';
import { sessionManager } from '../utils/sessionManager.js';
import { captchaQueue } from '../utils/requestQueue.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { Storage } from '@google-cloud/storage';

const router = express.Router();
const SEC_BASE_URL = process.env.SEC_BASE_URL || 'https://sec.kerala.gov.in';

// Initialize Google Cloud Storage
let storage;
let bucket;
let USE_CLOUD_STORAGE = false;
let CLOUD_STORAGE_PATH = null; // For mounted volumes

try {
  // Check if bucket is mounted as a volume (Cloud Run volume mount)
  const mountedBucketPath = process.env.GCS_MOUNT_PATH || '/slipsdata';
  
  if (fs.existsSync(mountedBucketPath)) {
    // Bucket is mounted as filesystem - use it directly
    CLOUD_STORAGE_PATH = path.join(mountedBucketPath, 'captcha-cache');
    
    // Create captcha-cache directory in mounted bucket
    if (!fs.existsSync(CLOUD_STORAGE_PATH)) {
      fs.mkdirSync(CLOUD_STORAGE_PATH, { recursive: true });
      console.log(`☁️ [CLOUD STORAGE MOUNT] Created directory: ${CLOUD_STORAGE_PATH}`);
    }
    
    USE_CLOUD_STORAGE = true;
    console.log(`☁️ [CLOUD STORAGE MOUNT] Using mounted bucket at: ${mountedBucketPath}`);
    console.log(`📁 [CLOUD STORAGE MOUNT] Captcha path: ${CLOUD_STORAGE_PATH}`);
  } else {
    // No mounted volume, check if we should use Storage API
    const shouldUseCloud = process.env.USE_CLOUD_STORAGE === 'true' || 
                           process.env.NODE_ENV === 'production' ||
                           process.env.RAILWAY_ENVIRONMENT === 'production';
    
    if (shouldUseCloud) {
      storage = new Storage();
      const bucketName = process.env.GCS_BUCKET_NAME || 'slipsdata';
      bucket = storage.bucket(bucketName);
      USE_CLOUD_STORAGE = true;
      console.log(`☁️ [CLOUD STORAGE API] Enabled - Bucket: ${bucketName}`);
    } else {
      console.log(`💾 [LOCAL STORAGE] Using filesystem for captcha images`);
    }
  }
} catch (error) {
  console.error(`❌ [CLOUD STORAGE] Failed to initialize:`, error.message);
  console.log(`💾 [LOCAL STORAGE] Falling back to filesystem`);
  USE_CLOUD_STORAGE = false;
  CLOUD_STORAGE_PATH = null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants for timeouts and retries
const CONFIG = {
  PAGE_LOAD_TIMEOUT: 60000,       // 60s for page load
  CAPTCHA_WAIT_TIMEOUT: 15000,    // 15s to find captcha
  FORM_SUBMIT_TIMEOUT: 90000,     // 90s for form submission
  SESSION_TIMEOUT: 10 * 60 * 1000, // 10 minutes
  MAX_PAGE_RETRIES: 2,            // Retry page load twice
  CAPTCHA_DIR: path.join(__dirname, '..', 'public', 'captcha-cache'),
  
  // Selectors
  CAPTCHA_SELECTORS: [
    'img[src*="captcha"]',
    '#view_voters_list_captcha_image',
    'img[src*="Captcha"]',
    'img[alt*="captcha" i]',
    '.captcha-image'
  ],
  
  // Form selectors
  FORM_SELECTORS: {
    district: '#view_voters_list_district',
    localBody: '#view_voters_list_localBody',
    ward: '#view_voters_list_ward',
    pollingStation: '#view_voters_list_pollingStation',
    language: '#view_voters_list_language',
    captcha: '#view_voters_list_captcha',
    token: '#view_voters_list__token',
    submitButton: 'button[data-success-path="/public/voters/list"]'
  }
};

// Ensure captcha directory exists
if (!fs.existsSync(CONFIG.CAPTCHA_DIR)) {
  fs.mkdirSync(CONFIG.CAPTCHA_DIR, { recursive: true });
  console.log('✅ Captcha directory created:', CONFIG.CAPTCHA_DIR);
}

/**
 * Helper: Load SEC page with retry logic
 */
async function loadSECPage(page, url, retries = CONFIG.MAX_PAGE_RETRIES) {
  const startTime = Date.now();
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`[CAPTCHA] Loading ${url} (attempt ${attempt + 1}/${retries + 1})...`);
      
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: CONFIG.PAGE_LOAD_TIMEOUT
      });
      
      const loadTime = Date.now() - startTime;
      console.log(`[CAPTCHA] ✅ Page loaded in ${loadTime}ms`);
      return loadTime;
      
    } catch (error) {
      const attemptTime = Date.now() - startTime;
      console.log(`[CAPTCHA] ⚠️ Load failed after ${attemptTime}ms (attempt ${attempt + 1})`);
      
      if (attempt === retries) {
        throw new Error(`SEC website unreachable after ${retries + 1} attempts`);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

/**
 * Helper: Find captcha element
 */
async function findCaptchaElement(page) {
  const startTime = Date.now();
  
  for (const selector of CONFIG.CAPTCHA_SELECTORS) {
    try {
      const element = await page.waitForSelector(selector, { 
        state: 'visible',
        timeout: CONFIG.CAPTCHA_WAIT_TIMEOUT
      });
      
      if (element) {
        const findTime = Date.now() - startTime;
        console.log(`[CAPTCHA] ✅ Found captcha: ${selector} (${findTime}ms)`);
        return element;
      }
    } catch (e) {
      // Try next selector
      continue;
    }
  }
  
  throw new Error('Captcha element not found with any selector');
}

/**
 * Helper: Save captcha screenshot
 */
async function saveCaptchaScreenshot(element, sessionId) {
  const filename = `captcha-${sessionId}.png`;
  
  // Take screenshot to buffer
  const screenshotBuffer = await element.screenshot();
  
  const storageType = CLOUD_STORAGE_PATH ? 'Cloud Storage Mount' : 
                      USE_CLOUD_STORAGE ? 'Cloud Storage API' : 
                      'Local Filesystem';
  console.log(`[CAPTCHA] 📸 Screenshot captured (${screenshotBuffer.length} bytes) - Using: ${storageType}`);
  
  // If bucket is mounted as a volume, use it as regular filesystem
  if (CLOUD_STORAGE_PATH) {
    const captchaPath = path.join(CLOUD_STORAGE_PATH, filename);
    
    await fs.promises.writeFile(captchaPath, screenshotBuffer);
    console.log(`[CAPTCHA] ☁️✅ Saved to mounted bucket: ${captchaPath} (${screenshotBuffer.length} bytes)`);
    
    // Schedule deletion after 5 minutes
    scheduleFileDeletion(sessionId, 5 * 60 * 1000, CLOUD_STORAGE_PATH);
    
    // Return path relative to mounted bucket for serving via Cloud Run
    // Cloud Run will serve files from /slipsdata as public URL
    return `/slipsdata/captcha-cache/${filename}?t=${Date.now()}`;
  }
  
  if (USE_CLOUD_STORAGE) {
    try {
      // Upload to Google Cloud Storage
      console.log(`[CAPTCHA] ☁️ Uploading to Cloud Storage: ${filename}`);
      
      const bucketName = process.env.GCS_BUCKET_NAME || 'slipsdata';
      const file = bucket.file(`captcha-cache/${filename}`);
    
      await file.save(screenshotBuffer, {
        metadata: {
          contentType: 'image/png',
          cacheControl: 'no-cache, no-store, must-revalidate',
          metadata: {
            sessionId: sessionId,
            createdAt: new Date().toISOString()
          }
        }
      });
      
      // Make file publicly readable
      await file.makePublic();
      
      // Generate public URL
      const publicUrl = `https://storage.googleapis.com/${bucketName}/captcha-cache/${filename}`;
      
      console.log(`[CAPTCHA] ✅ Uploaded to Cloud Storage (${screenshotBuffer.length} bytes)`);
      console.log(`[CAPTCHA] 🔗 Public URL: ${publicUrl}`);
      
      // Schedule deletion after 5 minutes
      scheduleCloudFileDeletion(sessionId, 5 * 60 * 1000);
      
      return publicUrl + `?t=${Date.now()}`;
      
    } catch (cloudError) {
      console.error(`[CAPTCHA] ❌ Cloud Storage upload failed:`, cloudError.message);
      console.log(`[CAPTCHA] 💾 Falling back to local filesystem`);
      // Fall through to local storage
    }
  }
  
  // Local file system (development or fallback)
  const captchaPath = path.join(CONFIG.CAPTCHA_DIR, filename);
  
  await fs.promises.writeFile(captchaPath, screenshotBuffer);
  
  // Wait a moment to ensure file is fully written
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Verify file exists and has content
  let retries = 3;
  while (retries > 0) {
    if (fs.existsSync(captchaPath)) {
      const stats = fs.statSync(captchaPath);
      if (stats.size > 0) {
        console.log(`[CAPTCHA] ✅ Screenshot saved locally: ${filename} (${stats.size} bytes)`);
        console.log(`[CAPTCHA] 📁 File location: ${captchaPath}`);
        
        // Verify file is readable
        try {
          fs.accessSync(captchaPath, fs.constants.R_OK);
          console.log(`[CAPTCHA] ✅ File is readable`);
        } catch (err) {
          console.error(`[CAPTCHA] ❌ File exists but not readable:`, err.message);
        }
        
        // Schedule local file deletion
        scheduleFileDeletion(sessionId, 5 * 60 * 1000);
        
        return `/captcha-cache/${filename}?t=${Date.now()}`;
      }
    }
    
    retries--;
    if (retries > 0) {
      console.log(`[CAPTCHA] ⚠️ File not ready, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  throw new Error('Captcha screenshot failed - file not created or empty after retries');
}

/**
 * Helper: Setup page optimizations
 */
async function setupPageOptimizations(page) {
  // Set timeout
  page.setDefaultTimeout(CONFIG.PAGE_LOAD_TIMEOUT);
  
  // Block unnecessary resources
  await page.route('**/*', (route) => {
    const url = route.request().url();
    const resourceType = route.request().resourceType();
    
    const shouldBlock = 
      resourceType === 'font' ||
      resourceType === 'media' ||
      url.includes('google-analytics') ||
      url.includes('googletagmanager') ||
      url.includes('facebook') ||
      url.includes('doubleclick');
    
    shouldBlock ? route.abort() : route.continue();
  });
}

/**
 * Helper: Set Malayalam locale
 */
async function setMalayalamLocale(page) {
  console.log('[CAPTCHA] Setting Malayalam locale...');
  
  await page.goto(`${SEC_BASE_URL}/?set_locale=ml`, { 
    waitUntil: 'domcontentloaded',
    timeout: CONFIG.PAGE_LOAD_TIMEOUT
  });
  
  await page.waitForTimeout(500);
  
  // Verify locale cookie
  const cookies = await page.context().cookies();
  const localeCookie = cookies.find(c => c.name === 'set_locale');
  console.log('[CAPTCHA] 📍 Locale cookie:', localeCookie?.value || 'NOT SET');
  
  return localeCookie?.value === 'ml';
}

/**
 * Helper: Make select visible
 */
async function makeSelectVisible(page, selector) {
  await page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (element) {
      element.style.display = 'block';
      element.style.visibility = 'visible';
      element.style.opacity = '1';
      element.style.position = 'static';
      element.disabled = false;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, selector);
}

/**
 * Helper: Wait for dropdown to load
 */
async function waitForDropdownLoaded(page, selector, timeout = 30000) {
  await page.waitForFunction(
    (sel) => {
      const select = document.querySelector(sel);
      return select && select.options.length > 1;
    },
    selector,
    { timeout }
  );
}

/**
 * Helper: Extract Malayalam polling station
 */
function extractMalayalamPollingStation(html, pollingStationValue) {
  try {
    const $ = cheerio.load(html);
    
    // Try selected option first
    let pollingStationMalayalam = $(`#view_voters_list_pollingStation option[selected="selected"]`).text().trim();
    
    // Fallback to value match
    if (!pollingStationMalayalam) {
      pollingStationMalayalam = $(`#view_voters_list_pollingStation option[value="${pollingStationValue}"]`).text().trim();
    }
    
    if (pollingStationMalayalam) {
      console.log('[CAPTCHA] ✅ Malayalam polling station:', pollingStationMalayalam);
      return pollingStationMalayalam;
    }
  } catch (error) {
    console.error('[CAPTCHA] Failed to extract Malayalam polling station:', error.message);
  }
  
  return null;
}

/**
 * Helper: Get custom SEC error message
 */
async function getCustomSECError() {
  try {
    const Settings = (await import('../models/Settings.js')).default;
    const secErrorSettings = await Settings.getSettings('secError');
    
    return {
      title: secErrorSettings?.title || 'SEC Website Unavailable',
      message: secErrorSettings?.message || 'The SEC website is currently experiencing technical difficulties. Please try again later.'
    };
  } catch (error) {
    return {
      title: 'SEC Website Unavailable',
      message: 'The SEC website is currently experiencing technical difficulties. Please try again later.'
    };
  }
}

/**
 * Helper: Cleanup session
 */
async function cleanupSession(sessionId, deleteFile = false) {
  try {
    await sessionManager.cleanup(sessionId);
    
    if (deleteFile) {
      // Try mounted bucket first
      if (CLOUD_STORAGE_PATH) {
        const captchaPath = path.join(CLOUD_STORAGE_PATH, `captcha-${sessionId}.png`);
        if (fs.existsSync(captchaPath)) {
          fs.unlinkSync(captchaPath);
          console.log(`[CAPTCHA] 🗑️ Mounted bucket file deleted: captcha-${sessionId}.png`);
        }
      } else if (USE_CLOUD_STORAGE && bucket) {
        const filename = `captcha-cache/captcha-${sessionId}.png`;
        const file = bucket.file(filename);
        
        try {
          await file.delete();
          console.log(`[CAPTCHA] 🗑️ Cloud API file deleted: ${filename}`);
        } catch (error) {
          if (error.code !== 404) {
            console.error(`[CAPTCHA] Error deleting cloud file:`, error.message);
          }
        }
      } else {
        const captchaPath = path.join(CONFIG.CAPTCHA_DIR, `captcha-${sessionId}.png`);
        if (fs.existsSync(captchaPath)) {
          fs.unlinkSync(captchaPath);
          console.log(`[CAPTCHA] 🗑️ Local file deleted: captcha-${sessionId}.png`);
        }
      }
    }
  } catch (error) {
    console.error('[CAPTCHA] Error during cleanup:', error.message);
  }
}

/**
 * Schedule captcha file deletion after delay (to allow frontend to load it)
 */
function scheduleFileDeletion(sessionId, delayMs = 5 * 60 * 1000, customPath = null) {
  setTimeout(() => {
    const captchaPath = customPath 
      ? path.join(customPath, `captcha-${sessionId}.png`)
      : path.join(CONFIG.CAPTCHA_DIR, `captcha-${sessionId}.png`);
      
    if (fs.existsSync(captchaPath)) {
      try {
        fs.unlinkSync(captchaPath);
        const location = customPath ? 'mounted bucket' : 'local';
        console.log(`[CAPTCHA] 🗑️ Scheduled cleanup: captcha-${sessionId}.png deleted from ${location}`);
      } catch (error) {
        console.error(`[CAPTCHA] Error deleting captcha file:`, error.message);
      }
    }
  }, delayMs);
}

/**
 * Schedule cloud file deletion after delay
 */
function scheduleCloudFileDeletion(sessionId, delayMs = 5 * 60 * 1000) {
  setTimeout(async () => {
    const filename = `captcha-cache/captcha-${sessionId}.png`;
    const file = bucket.file(filename);
    
    try {
      await file.delete();
      console.log(`[CAPTCHA] ☁️🗑️ Scheduled cloud cleanup: ${filename} deleted`);
    } catch (error) {
      if (error.code !== 404) {
        console.error(`[CAPTCHA] Error deleting cloud file:`, error.message);
      }
    }
  }, delayMs);
}

/**
 * GET /api/initCaptchaSession
 * Initialize browser session and capture captcha
 */
router.get('/initCaptchaSession', async (req, res) => {
  const sessionId = Date.now().toString();
  const startTime = Date.now();
  
  try {
    console.log(`[CAPTCHA] 🚀 Initializing session ${sessionId}...`);
    
    const result = await captchaQueue.add(async () => {
      let context = null;
      let page = null;
      
      try {
        // Get browser context
        const contextStartTime = Date.now();
        context = await browserPool.getBrowserContext(sessionId);
        console.log(`[CAPTCHA] ⏱️ Context acquired in ${Date.now() - contextStartTime}ms`);
        
        // Create page
        page = await context.newPage();
        await setupPageOptimizations(page);
        
        // Set Malayalam locale
        await setMalayalamLocale(page);
        
        // Load voter list page
        const pageLoadTime = await loadSECPage(page, `${SEC_BASE_URL}/public/voters/list`);
        
        // Find captcha element
        const captchaElement = await findCaptchaElement(page);
        
        // Save screenshot
        const captchaUrl = await saveCaptchaScreenshot(captchaElement, sessionId);
        
        // Store session
        sessionManager.create(sessionId, context, page, {
          userId: req.user?.id || 'anonymous',
          createdFor: 'captcha',
          timings: {
            total: Date.now() - startTime,
            pageLoad: pageLoadTime
          }
        }, CONFIG.SESSION_TIMEOUT);
        
        // Schedule file deletion after 5 minutes (gives frontend time to load)
        scheduleFileDeletion(sessionId, 5 * 60 * 1000);
        
        console.log(`[CAPTCHA] ✅ Session ${sessionId} created successfully`);
        console.log(`[CAPTCHA] 📤 Returning captchaUrl: ${captchaUrl}`);
        console.log(`[CAPTCHA] ⏰ Session will timeout in ${CONFIG.SESSION_TIMEOUT / 1000}s`);
        
        return {
          status: 'success',
          sessionId,
          captchaUrl,
          message: 'Captcha session initialized',
          timings: {
            total: Date.now() - startTime,
            pageLoad: pageLoadTime
          }
        };
        
      } catch (error) {
        // Cleanup on error
        if (context) {
          await browserPool.releaseContext(context);
        }
        throw error;
      }
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('[CAPTCHA] ❌ Error initializing session:', error);
    
    const isShutdownError = error.message?.includes('shutting down') || 
                           error.message?.includes('has been closed');
    
    res.status(isShutdownError ? 503 : 500).json({ 
      status: 'error', 
      message: isShutdownError 
        ? 'Service temporarily unavailable. Please try again.'
        : error.message || 'Failed to initialize captcha session',
      retryable: isShutdownError
    });
  }
});

/**
 * POST /api/submitWithCaptcha
 * Submit form with captcha
 */
router.post('/submitWithCaptcha', async (req, res) => {
  const { sessionId, district, local_body, ward, polling_station, language, captcha } = req.body;
  
  console.log(`[CAPTCHA] 📝 Submitting form for session ${sessionId}...`);
  console.log(`[CAPTCHA] 🔍 Checking session availability...`);
  
  try {
    // Get session
    const session = sessionManager.get(sessionId);
    if (!session) {
      console.error(`[CAPTCHA] ❌ Session ${sessionId} not found or expired`);
      console.log(`[CAPTCHA] 📊 Active sessions: ${sessionManager.getActiveSessions().length}`);
      
      // List active session IDs for debugging
      const activeSessions = sessionManager.getActiveSessions();
      if (activeSessions.length > 0) {
        console.log(`[CAPTCHA] 🔑 Active session IDs:`, activeSessions.map(s => s.sessionId).join(', '));
      }
      
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired session. Please refresh captcha.',
        sessionId: sessionId,
        debug: {
          requestedSessionId: sessionId,
          activeSessionsCount: activeSessions.length,
          activeSessions: activeSessions.map(s => s.sessionId)
        }
      });
    }
    
    console.log(`[CAPTCHA] ✅ Session ${sessionId} found and valid`);
    
    const { page } = session;
    const startTime = Date.now();
    
    // Make all selects visible
    await page.evaluate(() => {
      document.querySelectorAll('select').forEach(select => {
        select.style.display = 'block';
        select.style.visibility = 'visible';
        select.style.opacity = '1';
        select.disabled = false;
      });
    });
    
    // Fill form step by step
    console.log('[CAPTCHA] Selecting district...');
    await makeSelectVisible(page, CONFIG.FORM_SELECTORS.district);
    await page.selectOption(CONFIG.FORM_SELECTORS.district, district);
    await page.waitForTimeout(1500);
    
    console.log('[CAPTCHA] Waiting for local bodies...');
    await waitForDropdownLoaded(page, CONFIG.FORM_SELECTORS.localBody);
    await makeSelectVisible(page, CONFIG.FORM_SELECTORS.localBody);
    await page.selectOption(CONFIG.FORM_SELECTORS.localBody, local_body);
    await page.waitForTimeout(1500);
    
    console.log('[CAPTCHA] Waiting for wards...');
    await waitForDropdownLoaded(page, CONFIG.FORM_SELECTORS.ward);
    await makeSelectVisible(page, CONFIG.FORM_SELECTORS.ward);
    await page.selectOption(CONFIG.FORM_SELECTORS.ward, ward);
    await page.waitForTimeout(1500);
    
    console.log('[CAPTCHA] Waiting for polling stations...');
    await waitForDropdownLoaded(page, CONFIG.FORM_SELECTORS.pollingStation);
    await makeSelectVisible(page, CONFIG.FORM_SELECTORS.pollingStation);
    await page.selectOption(CONFIG.FORM_SELECTORS.pollingStation, polling_station);
    await page.waitForTimeout(500);
    
    console.log('[CAPTCHA] Selecting language...');
    await page.selectOption(CONFIG.FORM_SELECTORS.language, language);
    await page.waitForTimeout(300);
    
    console.log('[CAPTCHA] Filling captcha...');
    await page.fill(CONFIG.FORM_SELECTORS.captcha, captcha);
    await page.waitForTimeout(300);
    
    // Submit form
    console.log('[CAPTCHA] Submitting form...');
    try {
      await page.click(CONFIG.FORM_SELECTORS.submitButton);
    } catch (clickError) {
      console.error('[CAPTCHA] ❌ Submit button click failed:', clickError.message);
      
      const customError = await getCustomSECError();
      await cleanupSession(sessionId);
      
      return res.status(503).json({
        status: 'error',
        errorType: 'SEC_WEBSITE_ERROR',
        message: customError.message,
        customErrorTitle: customError.title,
        customErrorMessage: customError.message
      });
    }
    
    // Wait for response
    console.log('[CAPTCHA] ⏳ Waiting for response...');
    await page.waitForTimeout(5000);
    
    // Get page content
    let html;
    try {
      html = await page.content();
    } catch (contentError) {
      console.error('[CAPTCHA] ❌ Failed to get page content:', contentError.message);
      
      const customError = await getCustomSECError();
      await cleanupSession(sessionId);
      
      return res.status(503).json({
        status: 'error',
        errorType: 'SEC_WEBSITE_ERROR',
        message: customError.message,
        customErrorTitle: customError.title,
        customErrorMessage: customError.message
      });
    }
    
    console.log('[CAPTCHA] ✅ Form submitted in', Date.now() - startTime, 'ms');
    
    // Check for server errors
    const hasServerError = html.includes('500 Internal Server Error') ||
                          html.includes('503 Service Unavailable') ||
                          html.includes('502 Bad Gateway') ||
                          html.includes('504 Gateway Timeout') ||
                          html.includes('Application Error') ||
                          html.includes('temporarily unavailable');
    
    if (hasServerError) {
      const customError = await getCustomSECError();
      await cleanupSession(sessionId);
      
      return res.status(503).json({
        status: 'error',
        errorType: 'SEC_WEBSITE_ERROR',
        message: customError.message,
        customErrorTitle: customError.title,
        customErrorMessage: customError.message
      });
    }
    
    // Extract Malayalam polling station
    const pollingStationMalayalam = extractMalayalamPollingStation(html, polling_station);
    
    // Return success
    res.json({
      status: 'success',
      html,
      pollingStationMalayalam
    });
    
    // Schedule cleanup after 60 seconds
    setTimeout(async () => {
      console.log('[CAPTCHA] ⏰ Scheduled cleanup executing...');
      await cleanupSession(sessionId);
    }, 60000);
    
  } catch (error) {
    console.error('[CAPTCHA] ❌ Error submitting form:', error);
    
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to submit form',
      errorType: error.constructor.name
    });
  }
});

export default router;
