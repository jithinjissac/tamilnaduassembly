import express from 'express';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
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
  let driver;
  try {
    const proxyConfig = getProxyConfigWithFallback();
    const options = new chrome.Options();
    
    options.addArguments('--headless=new');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-setuid-sandbox');
    options.addArguments('--lang=ml-IN');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.setUserPreferences({ 
      'intl.accept_languages': 'ml-IN,ml,en-US,en',
      'language': 'ml-IN'
    });
    
    if (proxyConfig && proxyConfig.server) {
      options.addArguments(`--proxy-server=${proxyConfig.server}`);
    }
    
    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    // Execute anti-detection script
    await driver.executeScript(`
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    `);
    
    // Navigate with locale query param
    const urlWithLocale = `${SEC_BASE_URL}/public/voters/list?locale=ml&lang=ml`;
    await driver.get(urlWithLocale);
    await driver.sleep(1500);

    // Explicitly set language to Malayalam if language dropdown exists
    try {
      const langSelect = await driver.findElement(By.id('view_voters_list_language'));
      await driver.executeScript("arguments[0].value = 'M'; arguments[0].dispatchEvent(new Event('change'));", langSelect);
      await driver.sleep(800);
      console.log('[PLAYWRIGHT_STATIONS] Set language dropdown to Malayalam (M)');
    } catch (e) {
      console.log('[PLAYWRIGHT_STATIONS] Could not set language dropdown:', e.message);
    }

    // Make selects visible
    await driver.executeScript(`
      document.querySelectorAll('select').forEach(sel => {
        sel.style.display = 'block';
        sel.style.visibility = 'visible';
        sel.disabled = false;
      });
    `);

    // Select cascade: district -> local body -> ward
    const districtSelect = await driver.findElement(By.id('view_voters_list_district'));
    await driver.executeScript(`arguments[0].value = '${district}'; arguments[0].dispatchEvent(new Event('change'));`, districtSelect);
    await driver.sleep(2500);
    await driver.wait(async () => {
      const localBodyEl = await driver.findElement(By.id('view_voters_list_localBody'));
      const options = await localBodyEl.findElements(By.css('option'));
      return options.length > 1;
    }, 15000);

    const localBodySelect = await driver.findElement(By.id('view_voters_list_localBody'));
    await driver.executeScript(`arguments[0].value = '${localBody}'; arguments[0].dispatchEvent(new Event('change'));`, localBodySelect);
    await driver.sleep(2500);
    await driver.wait(async () => {
      const wardEl = await driver.findElement(By.id('view_voters_list_ward'));
      const options = await wardEl.findElements(By.css('option'));
      return options.length > 1;
    }, 15000);

    const wardSelect = await driver.findElement(By.id('view_voters_list_ward'));
    await driver.executeScript(`arguments[0].value = '${ward}'; arguments[0].dispatchEvent(new Event('change'));`, wardSelect);
    await driver.sleep(2500);

    // Re-confirm language selection after cascade
    try {
      const langSelect = await driver.findElement(By.id('view_voters_list_language'));
      const currentValue = await langSelect.getAttribute('value');
      if (currentValue !== 'M') {
        await driver.executeScript("arguments[0].value = 'M'; arguments[0].dispatchEvent(new Event('change'));", langSelect);
        await driver.sleep(500);
        console.log('[PLAYWRIGHT_STATIONS] Re-confirmed language as Malayalam after ward selection');
      }
    } catch (e) {
      console.log('[PLAYWRIGHT_STATIONS] Could not re-confirm language:', e.message);
    }

    // Wait for polling station options
    await driver.wait(async () => {
      const stationEl = await driver.findElement(By.id('view_voters_list_pollingStation'));
      const options = await stationEl.findElements(By.css('option'));
      return options.length > 1;
    }, 15000);

    // Take screenshot BEFORE form submission
    console.log('[PLAYWRIGHT_STATIONS] Submitting initial form to reveal Malayalam polling stations...');
    const timestamp = Date.now();
    const screenshotBefore = path.join(debugDir, `polling-before-submit-${timestamp}.png`);
    const beforeImg = await driver.takeScreenshot();
    fs.writeFileSync(screenshotBefore, beforeImg, 'base64');
    console.log('[PLAYWRIGHT_STATIONS] Screenshot BEFORE submission saved:', screenshotBefore);
    
    // Try form submission for Malayalam extraction
    try {
      // Select first polling station option
      const firstStation = await driver.executeScript(`
        const sel = document.querySelector('#view_voters_list_pollingStation');
        if (sel && sel.options.length > 1) {
          return sel.options[1].value;
        }
        return null;
      `);

      if (firstStation) {
        const stationSelect = await driver.findElement(By.id('view_voters_list_pollingStation'));
        await driver.executeScript(`arguments[0].value = '${firstStation}'; arguments[0].dispatchEvent(new Event('change'));`, stationSelect);
        await driver.sleep(500);
      }

      // Try to get captcha input and fill dummy value
      try {
        const captchaInput = await driver.findElement(By.id('view_voters_list_captcha'));
        await captchaInput.sendKeys('0000');
      } catch (e) {
        console.log('[PLAYWRIGHT_STATIONS] No captcha input found');
      }

      // Submit the form
      try {
        const submitButton = await driver.findElement(By.css('button[type="submit"], input[type="submit"], .btn-primary'));
        await submitButton.click();
        console.log('[PLAYWRIGHT_STATIONS] Form submitted, waiting for response...');
        
        await driver.sleep(3000);
        
        // Take screenshot AFTER form submission
        const screenshotAfter = path.join(debugDir, `polling-after-submit-${timestamp}.png`);
        const afterImg = await driver.takeScreenshot();
        fs.writeFileSync(screenshotAfter, afterImg, 'base64');
        console.log('[PLAYWRIGHT_STATIONS] Screenshot AFTER submission saved:', screenshotAfter);
        
        // Save page HTML
        const htmlContent = await driver.getPageSource();
        const htmlFile = path.join(debugDir, `polling-response-${timestamp}.html`);
        fs.writeFileSync(htmlFile, htmlContent, 'utf8');
        console.log('[PLAYWRIGHT_STATIONS] HTML response saved:', htmlFile);
        
        // Check page status
        const hasForm2 = await driver.findElements(By.id('form2')).then(els => els.length > 0);
        const hasError = await driver.findElements(By.css('.alert-danger, .error-message')).then(els => els.length > 0);
        
        console.log('[PLAYWRIGHT_STATIONS] Page status - hasForm2:', hasForm2, 'hasError:', hasError);
        
        if (hasForm2) {
          console.log('[PLAYWRIGHT_STATIONS] Form2 detected - extracting polling stations from response');
          
          const pollingStationFromResponse = await driver.executeScript(`
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
            
            const allText = document.body.innerText;
            const malayalamLines = allText.split('\\n')
              .filter(line => /[\u0D00-\u0D7F]/.test(line) && line.length > 10);
            
            return { malayalamContent: malayalamLines.slice(0, 5) };
          `);
          
          console.log('[PLAYWRIGHT_STATIONS] Response data:', JSON.stringify(pollingStationFromResponse, null, 2));
        }
        
        // Extract page analysis
        const pageAnalysis = await driver.executeScript(`
          const formFields = [];
          document.querySelectorAll('input, select, textarea').forEach(el => {
            const name = el.name || el.id || 'unnamed';
            const value = el.value || el.textContent?.trim();
            const type = el.type || el.tagName.toLowerCase();
            if (value) {
              formFields.push({ name, value, type, hasMalayalam: /[\u0D00-\u0D7F]/.test(value) });
            }
          });
          
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
        `);
        
        console.log('[PLAYWRIGHT_STATIONS] Page analysis:', JSON.stringify(pageAnalysis, null, 2));
      } catch (submitErr) {
        console.log('[PLAYWRIGHT_STATIONS] Submit button click failed:', submitErr.message);
      }
    } catch (submitError) {
      console.log('[PLAYWRIGHT_STATIONS] Form submission for Malayalam extraction failed (expected):', submitError.message);
      
      const screenshotError = path.join(debugDir, `polling-error-${timestamp}.png`);
      const errorImg = await driver.takeScreenshot();
      fs.writeFileSync(screenshotError, errorImg, 'base64');
      console.log('[PLAYWRIGHT_STATIONS] Error screenshot saved:', screenshotError);
    }

    // Extract options from the dropdown (original method as fallback)
    const stations = await driver.executeScript(`
      const sel = document.querySelector('#view_voters_list_pollingStation');
      if (!sel) return [];
      return Array.from(sel.options)
        .filter(o => o.value)
        .map(o => ({ value: o.value, text: o.textContent.trim() }));
    `);

    // Log what we got
    const malayalamCount = stations.filter(s => /[\u0D00-\u0D7F]/.test(s.text)).length;
    console.log(`[PLAYWRIGHT_STATIONS] Extracted ${stations.length} stations, ${malayalamCount} with Malayalam`);

    return stations;
  } finally {
    if (driver) await driver.quit();
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