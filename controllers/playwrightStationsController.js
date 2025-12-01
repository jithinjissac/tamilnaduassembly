import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getProxyConfigWithFallback } from '../utils/proxyConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const SEC_BASE_URL = process.env.SEC_BASE_URL || 'https://sec.kerala.gov.in';

// Create debug screenshots directory if it doesn't exist
const debugDir = path.join(__dirname, '..', 'public', 'debug-screenshots');
if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir, { recursive: true });
  console.log('[PLAYWRIGHT_STATIONS] Created debug directory:', debugDir);
} else {
  console.log('[PLAYWRIGHT_STATIONS] Debug directory exists:', debugDir);
}

// Simple in-memory cache for Malayalam polling stations
// Key: `${district}|${localBody}|${ward}` => { stations: [...], cachedAt }
const STATION_CACHE = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hasMalayalam(str) {
  return /[\u0D00-\u0D7F]/.test(str || '');
}

async function fetchStationsPlaywright({ district, localBody, ward }) {
  let browser;
  let page;
  try {
    const proxyConfig = getProxyConfigWithFallback();
    const launchOptions = { 
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ml-IN']
    };
    
    if (proxyConfig) {
      launchOptions.proxy = proxyConfig;
    }
    
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      locale: 'ml-IN',
      extraHTTPHeaders: {
        'Accept-Language': 'ml-IN,ml;q=0.9,en-US;q=0.7,en;q=0.6'
      }
    });

    // Pre-set Malayalam cookies
    await context.addCookies([
      { name: 'set_locale', value: 'ml', domain: '.sec.kerala.gov.in', path: '/' },
      { name: 'device_view', value: 'full', domain: '.sec.kerala.gov.in', path: '/' },
      { name: 'language', value: 'ml', domain: '.sec.kerala.gov.in', path: '/' }
    ]);

    page = await context.newPage();
    
    // Navigate with locale query param if supported
    const urlWithLocale = `${SEC_BASE_URL}/public/voters/list?locale=ml&lang=ml`;
    await page.goto(urlWithLocale, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);

    // Explicitly set language to Malayalam if language dropdown exists
    try {
      const langSelect = await page.$('#view_voters_list_language');
      if (langSelect) {
        await page.selectOption('#view_voters_list_language', 'M');
        await page.waitForTimeout(800);
        console.log('[PLAYWRIGHT_STATIONS] Set language dropdown to Malayalam (M)');
      }
    } catch (e) {
      console.log('[PLAYWRIGHT_STATIONS] Could not set language dropdown:', e.message);
    }

    // Make selects visible (defensive in case of display:none)
    await page.evaluate(() => {
      document.querySelectorAll('select').forEach(sel => {
        sel.style.display = 'block';
        sel.style.visibility = 'visible';
        sel.disabled = false;
      });
    });

    // Select cascade: district -> local body -> ward
    await page.selectOption('#view_voters_list_district', district);
    await page.waitForTimeout(2500);
    await page.waitForFunction(() => {
      const el = document.querySelector('#view_voters_list_localBody');
      return el && el.options.length > 1;
    }, { timeout: 15000 });

    await page.selectOption('#view_voters_list_localBody', localBody);
    await page.waitForTimeout(2500);
    await page.waitForFunction(() => {
      const el = document.querySelector('#view_voters_list_ward');
      return el && el.options.length > 1;
    }, { timeout: 15000 });

    await page.selectOption('#view_voters_list_ward', ward);
    await page.waitForTimeout(2500);

    // Re-confirm language selection after cascade (SEC might reset it)
    try {
      const langSelect = await page.$('#view_voters_list_language');
      if (langSelect) {
        const currentValue = await page.$eval('#view_voters_list_language', el => el.value);
        if (currentValue !== 'M') {
          await page.selectOption('#view_voters_list_language', 'M');
          await page.waitForTimeout(500);
          console.log('[PLAYWRIGHT_STATIONS] Re-confirmed language as Malayalam after ward selection');
        }
      }
    } catch (e) {
      console.log('[PLAYWRIGHT_STATIONS] Could not re-confirm language:', e.message);
    }

    // Wait for polling station options
    await page.waitForFunction(() => {
      const el = document.querySelector('#view_voters_list_pollingStation');
      return el && el.options.length > 1;
    }, { timeout: 15000 });

    // ===== NEW APPROACH: Submit initial form to get Malayalam polling stations =====
    console.log('[PLAYWRIGHT_STATIONS] Submitting initial form to reveal Malayalam polling stations...');
    
    // Take screenshot BEFORE form submission
    const timestamp = Date.now();
    const screenshotBefore = path.join(debugDir, `polling-before-submit-${timestamp}.png`);
    await page.screenshot({ path: screenshotBefore, fullPage: true });
    console.log('[PLAYWRIGHT_STATIONS] Screenshot BEFORE submission saved:', screenshotBefore);
    
    // Fill in a dummy captcha (or try to submit without it if possible)
    try {
      // Select first polling station option
      const firstStation = await page.evaluate(() => {
        const sel = document.querySelector('#view_voters_list_pollingStation');
        if (sel && sel.options.length > 1) {
          return sel.options[1].value; // First real option (skip empty)
        }
        return null;
      });

      if (firstStation) {
        await page.selectOption('#view_voters_list_pollingStation', firstStation);
        await page.waitForTimeout(500);
      }

      // Try to get captcha input and fill dummy value
      const captchaInput = await page.$('#view_voters_list_captcha');
      if (captchaInput) {
        await page.fill('#view_voters_list_captcha', '0000'); // Dummy - will fail but triggers form processing
      }

      // Submit the form
      const submitButton = await page.$('button[type="submit"], input[type="submit"], .btn-primary');
      if (submitButton) {
        await submitButton.click();
        console.log('[PLAYWRIGHT_STATIONS] Form submitted, waiting for response...');
        
        // Wait for either success page or error response
        await page.waitForTimeout(3000);
        
        // Take screenshot AFTER form submission
        const screenshotAfter = path.join(debugDir, `polling-after-submit-${timestamp}.png`);
        await page.screenshot({ path: screenshotAfter, fullPage: true });
        console.log('[PLAYWRIGHT_STATIONS] Screenshot AFTER submission saved:', screenshotAfter);
        
        // Save page HTML for inspection
        const htmlContent = await page.content();
        const htmlFile = path.join(debugDir, `polling-response-${timestamp}.html`);
        fs.writeFileSync(htmlFile, htmlContent, 'utf8');
        console.log('[PLAYWRIGHT_STATIONS] HTML response saved:', htmlFile);
        
        // Check if form2 appeared or if there's new content with polling station data
        const hasForm2 = await page.$('#form2');
        const hasError = await page.$('.alert-danger, .error-message');
        
        console.log('[PLAYWRIGHT_STATIONS] Page status - hasForm2:', !!hasForm2, 'hasError:', !!hasError);
        
        if (hasForm2) {
          console.log('[PLAYWRIGHT_STATIONS] Form2 detected - extracting polling stations from response');
          
          // Extract polling station from form2 or response headers/hidden fields
          const pollingStationFromResponse = await page.evaluate(() => {
            // Try multiple selectors where polling station name might appear in Malayalam
            const selectors = [
              '#form2 input[name="polling_station"]',
              '#form2 input[name="pollingStation"]',
              '#form2 .polling-station-name',
              '.voter-details .polling-station',
              'input[type="hidden"][name*="polling"]',
              '.form-group:has(label:contains("Polling Station")) input'
            ];
            
            for (const selector of selectors) {
              try {
                const el = document.querySelector(selector);
                if (el) {
                  const value = el.value || el.textContent?.trim();
                  if (value && /[\u0D00-\u0D7F]/.test(value)) {
                    return { selector, value };
                  }
                }
              } catch (e) {}
            }
            
            // Try to find polling station in any text content with Malayalam
            const allText = document.body.innerText;
            const malayalamLines = allText.split('\n')
              .filter(line => /[\u0D00-\u0D7F]/.test(line) && line.length > 10);
            
            return { malayalamContent: malayalamLines.slice(0, 5) };
          });
          
          console.log('[PLAYWRIGHT_STATIONS] Response data:', JSON.stringify(pollingStationFromResponse, null, 2));
        }
        
        // Extract all form fields and visible text for analysis
        const pageAnalysis = await page.evaluate(() => {
          // Get all form fields
          const formFields = [];
          document.querySelectorAll('input, select, textarea').forEach(el => {
            const name = el.name || el.id || 'unnamed';
            const value = el.value || el.textContent?.trim();
            const type = el.type || el.tagName.toLowerCase();
            if (value) {
              formFields.push({ name, value, type, hasMalayalam: /[\u0D00-\u0D7F]/.test(value) });
            }
          });
          
          // Get visible text with Malayalam
          const visibleText = [];
          document.querySelectorAll('div, p, span, td, th, label').forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length > 5 && /[\u0D00-\u0D7F]/.test(text)) {
              const classes = el.className || '';
              const id = el.id || '';
              visibleText.push({ text: text.substring(0, 100), classes, id });
            }
          });
          
          return { formFields, visibleText: visibleText.slice(0, 20) };
        });
        
        console.log('[PLAYWRIGHT_STATIONS] Page analysis:', JSON.stringify(pageAnalysis, null, 2));
      }
    } catch (submitError) {
      console.log('[PLAYWRIGHT_STATIONS] Form submission for Malayalam extraction failed (expected):', submitError.message);
      
      // Take error screenshot
      const screenshotError = path.join(debugDir, `polling-error-${timestamp}.png`);
      await page.screenshot({ path: screenshotError, fullPage: true });
      console.log('[PLAYWRIGHT_STATIONS] Error screenshot saved:', screenshotError);
    }
    // ===== END NEW APPROACH =====

    // Extract options from the dropdown (original method as fallback)
    const stations = await page.evaluate(() => {
      const sel = document.querySelector('#view_voters_list_pollingStation');
      if (!sel) return [];
      return Array.from(sel.options)
        .filter(o => o.value)
        .map(o => ({ value: o.value, text: o.textContent.trim() }));
    });

    // Log what we got
    const malayalamCount = stations.filter(s => /[\u0D00-\u0D7F]/.test(s.text)).length;
    console.log(`[PLAYWRIGHT_STATIONS] Extracted ${stations.length} stations, ${malayalamCount} with Malayalam`);

    return stations;
  } finally {
    if (browser) await browser.close();
  }
}

router.post('/getPollingStationsMl', async (req, res) => {
  try {
    const { district_id, local_body_id, ward_id } = req.body;

    if (!district_id || !local_body_id || !ward_id) {
      return res.status(400).json({ status: 'error', message: 'district_id, local_body_id, ward_id are required' });
    }

    const key = `${district_id}|${local_body_id}|${ward_id}`;
    const cached = STATION_CACHE.get(key);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
      return res.json({ status: 'success', source: 'cache', polling_stations: cached.stations });
    }

    const stations = await fetchStationsPlaywright({ district: district_id, localBody: local_body_id, ward: ward_id });

    // If no Malayalam detected, return as-is but don't cache long-term (cache briefly maybe?)
    const anyMalayalam = stations.some(s => hasMalayalam(s.text));
    STATION_CACHE.set(key, { stations, cachedAt: Date.now() });

    res.json({ status: 'success', source: 'playwright', polling_stations: stations, malayalamDetected: anyMalayalam });
  } catch (err) {
    console.error('[PLAYWRIGHT_STATIONS] Error:', err.message);
    res.status(500).json({ status: 'error', message: 'Failed to fetch Malayalam polling stations', error: err.message });
  }
});

export default router;