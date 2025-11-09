import express from 'express';
import { chromium } from 'playwright';

const router = express.Router();
const SEC_BASE_URL = process.env.SEC_BASE_URL || 'https://sec.kerala.gov.in';

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
    browser = await chromium.launch({ 
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ml-IN']
    });
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

    // Extract options
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