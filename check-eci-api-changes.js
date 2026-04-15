/**
 * ECI API Change Detector — Tamil Nadu (S22)
 *
 * Opens a visible browser, navigates through the ECI voter portal for TN,
 * intercepts all API calls, compares them with what utils/eciDirectApiClient.js
 * currently uses, and patches the file if stable headers have changed.
 *
 * Dynamic per-request tokens (accept_yek, accept_rotcev) are detected and
 * reported but NOT hardcoded into the patch — they must be handled via the
 * Playwright browser flow.
 *
 * Usage:
 *   node check-eci-api-changes.js
 *   node check-eci-api-changes.js --district "CHENNAI" --constituency "Harbour"
 *   node check-eci-api-changes.js --year 2026
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, def) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
};
const STATE_CODE   = 'S22';                                  // Tamil Nadu — fixed
const DISTRICT     = getArg('--district',     'CHENNAI');
const CONSTITUENCY = getArg('--constituency', 'Harbour');
const YEAR         = getArg('--year',         '2026');
// ─────────────────────────────────────────────────────────────────────────────

// ── What getHeaders() currently returns in eciDirectApiClient.js ─────────────
const KNOWN_HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Content-Type': 'application/json',
    'Origin': 'https://voters.eci.gov.in',
    'Referer': 'https://voters.eci.gov.in/',
    'Pragma': 'no-cache',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    'applicationname': 'VSP',
    'appname': 'VSP',
    'channelidobo': 'VSP',
    'platform-type': 'ECIWEB',
    'currentrole': 'citizen',
    'atkn_bnd': 'null',
    'rtkn_bnd': 'null',
    'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
};

// Known ECI API endpoints the code currently calls
const KNOWN_ENDPOINTS = [
    '/api/v1/captcha-service/generateCaptcha/EROLL',
    '/api/v1/printing-publish/get-publish-eroll-type',
    '/api/v1/printing-publish/get-ac-languages',
    '/api/v1/printing-publish/get-publish-part-list',
    '/api/v1/printing-publish/generate-published-pdfs',
];

// Headers that are intentionally dynamic per-request (don't patch these)
const DYNAMIC_HEADER_PATTERNS = [/^accept_yek$/i, /^accept_rotcev$/i];
// Headers to skip patching (complex values / noise from browser capture)
const SKIP_PATCH_HEADERS = ['sec-ch-ua', 'referer']; // sec-ch-ua has embedded quotes that break regex; referer is empty noise
const isDynamic = (key) => DYNAMIC_HEADER_PATTERNS.some(p => p.test(key));
const isSkipPatch = (key) => SKIP_PATCH_HEADERS.some(s => s.toLowerCase() === key.toLowerCase());

// Headers that aren't meaningful to track
const IGNORE_HEADERS = ['host', 'connection', 'content-length', 'accept-encoding', 'cookie'];

// ─────────────────────────────────────────────────────────────────────────────
const OUTPUT_FILE = path.join(__dirname, 'eci-api-capture-s22.json');

const captured = {
    timestamp: new Date().toISOString(),
    state: STATE_CODE,
    district: DISTRICT,
    constituency: CONSTITUENCY,
    year: YEAR,
    requests: [],
};

function isEciApiRequest(url, resourceType, method) {
    return (
        url.includes('gateway-voters.eci.gov.in') ||
        url.includes('voters.eci.gov.in/api') ||
        url.includes('/api/v1/') ||
        ((method === 'POST' || resourceType === 'fetch' || resourceType === 'xhr') &&
            (url.includes('eci.gov.in') || url.includes('eroll')))
    );
}

function getPathname(url) {
    try { return new URL(url).pathname; } catch { return url; }
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  ECI API Change Detector — Tamil Nadu (S22)');
    console.log('══════════════════════════════════════════════════');
    console.log(`  District: ${DISTRICT}  Constituency: ${CONSTITUENCY}  Year: ${YEAR}`);
    console.log('══════════════════════════════════════════════════\n');

    const browser = await chromium.launch({
        headless: false,
        slowMo: 400,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
        ],
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        viewport: { width: 1440, height: 900 },
        acceptDownloads: true,
    });

    const page = await context.newPage();

    // ── Route interception (more reliable than events for capturing POST bodies) ─
    await page.route('**/*gateway-voters.eci.gov.in/api/**', async (route) => {
        const request = route.request();
        const url = request.url();
        const method = request.method();
        const ep = getPathname(url);

        // Capture raw post body
        let rawBody = null;
        let parsedBody = null;
        try {
            rawBody = request.postData();
        } catch { /* ignore */ }
        if (rawBody) {
            try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = rawBody; }
        }

        const h = request.headers();
        const entry = {
            url, method,
            headers: h,
            postData: parsedBody,
            rawPostData: rawBody,
            response: null,
        };
        captured.requests.push(entry);

        const custom = ['applicationname', 'channelidobo', 'platform-type', 'appname', 'currentrole', 'atkn_bnd', 'rtkn_bnd'];
        const presentCustom = custom.filter(k => h[k]);
        console.log(`📤  ${method} ${ep}`);
        if (presentCustom.length) {
            console.log('    headers:', presentCustom.map(k => `${k}=${h[k]}`).join(', '));
        }
        if (h['accept_yek']) console.log('    🔑 accept_yek present (dynamic token)');
        if (rawBody) {
            // Show first 200 chars of body - if encrypted it will look like base64/gibberish
            const preview = rawBody.length > 200 ? rawBody.substring(0, 200) + '...' : rawBody;
            console.log(`    body(${rawBody.length}B): ${preview}`);
        } else {
            console.log('    body: (empty)');
        }

        // Continue the request unchanged
        const response = await route.fetch();
        let respBody = null;
        try {
            const ct = response.headers()['content-type'] || '';
            if (ct.includes('application/json')) {
                respBody = await response.json();
            }
        } catch { /* ignore */ }

        entry.response = { status: response.status(), headers: response.headers(), body: respBody };
        console.log(`📥  ${response.status()} ${ep}${respBody?.status ? ' → ' + respBody.status : ''}`);

        route.fulfill({ response });
    });

    // Also keep event listeners for non-gateway requests
    page.on('request', (request) => {
        const url = request.url();
        const method = request.method();
        const resourceType = request.resourceType();
        if (!isEciApiRequest(url, resourceType, method)) return;
        if (url.includes('gateway-voters.eci.gov.in')) return; // handled by route

        const entry = {
            url, method, resourceType,
            headers: request.headers(),
            postData: (() => {
                try { const raw = request.postData(); return raw ? JSON.parse(raw) : null; } catch { return request.postData(); }
            })(),
            response: null,
        };
        captured.requests.push(entry);
        console.log(`📤  ${method} ${getPathname(url)}`);
    });

    page.on('response', async (response) => {
        const url = response.url();
        if (!isEciApiRequest(url, response.request().resourceType(), response.request().method())) return;
        if (url.includes('gateway-voters.eci.gov.in')) return; // handled by route

        let body = null;
        try {
            const ct = response.headers()['content-type'] || '';
            if (ct.includes('application/json')) body = await response.json();
        } catch { /* ignore */ }

        console.log(`📥  ${response.status()} ${getPathname(url)}${body?.status ? ' → ' + body.status : ''}`);
        const entry = [...captured.requests].reverse().find(r => r.url === url);
        if (entry) entry.response = { status: response.status(), headers: response.headers(), body };
    });

    // ── Navigate & interact ──────────────────────────────────────────────────
    try {
        console.log('\n[1] Opening ECI portal (Tamil Nadu S22)...');
        await page.goto(`https://voters.eci.gov.in/download-eroll?stateCode=${STATE_CODE}`, {
            waitUntil: 'networkidle',
            timeout: 60000,
        });
        console.log('    ✅ Page loaded');
        await page.waitForTimeout(2000);

        // Year
        console.log(`\n[2] Selecting year: ${YEAR}`);
        try {
            await page.waitForSelector('select[aria-label="Year Of Revision"]', { timeout: 10000 });
            await page.selectOption('select[aria-label="Year Of Revision"]', YEAR);
            await page.waitForTimeout(1000);
            console.log('    ✅ Year selected');
        } catch (e) {
            console.log('    ⚠️  Year dropdown not found:', e.message);
        }

        // Roll Type — pick first available
        console.log('\n[3] Selecting roll type (first available)...');
        try {
            const rollTypeOptions = await page.$$eval(
                'select[aria-label="Roll Type"] option',
                opts => opts.filter(o => o.value).map(o => ({ value: o.value, text: o.textContent.trim() }))
            );
            console.log('    Available:', rollTypeOptions.map(o => `${o.value}="${o.text}"`).join(' | '));
            if (rollTypeOptions.length > 0) {
                await page.selectOption('select[aria-label="Roll Type"]', rollTypeOptions[0].value);
                await page.waitForTimeout(1000);
                console.log(`    ✅ Selected: ${rollTypeOptions[0].value}`);
            }
        } catch (e) {
            console.log('    ⚠️  Roll type dropdown not found:', e.message);
        }

        // District
        console.log(`\n[4] Selecting district: ${DISTRICT}`);
        try {
            const districtOptions = await page.$$eval(
                'select[aria-label="District"] option',
                opts => opts.filter(o => o.value).map(o => ({ value: o.value, text: o.textContent.trim() }))
            );
            console.log('    Available (first 5):', districtOptions.slice(0, 5).map(o => `${o.value}="${o.text}"`).join(' | '));
            const target = districtOptions.find(
                o => o.value.toUpperCase().includes(DISTRICT.toUpperCase()) ||
                     o.text.toUpperCase().includes(DISTRICT.toUpperCase())
            );
            const toSelect = target || districtOptions[0];
            if (toSelect) {
                await page.selectOption('select[aria-label="District"]', toSelect.value);
                await page.waitForTimeout(1500);
                console.log(`    ✅ Selected: ${toSelect.value} "${toSelect.text}"`);
            }
        } catch (e) {
            console.log('    ⚠️  District dropdown not found:', e.message);
        }

        // Constituency (combobox)
        console.log(`\n[5] Typing constituency: ${CONSTITUENCY}`);
        try {
            await page.waitForSelector('input[role="combobox"]', { timeout: 8000 });
            await page.click('input[role="combobox"]');
            await page.waitForTimeout(300);
            await page.fill('input[role="combobox"]', CONSTITUENCY);
            await page.waitForTimeout(1500);

            const options = await page.$$('ul[role="listbox"] li, [role="option"]');
            console.log(`    Found ${options.length} autocomplete option(s)`);
            if (options.length > 0) {
                await options[0].click();
            } else {
                await page.keyboard.press('Enter');
            }
            await page.waitForTimeout(2000);
            console.log('    ✅ Constituency selected');
        } catch (e) {
            console.log('    ⚠️  Constituency combobox not found:', e.message);
        }

        // Wait for polling parts
        console.log('\n[6] Waiting for polling parts to load...');
        try {
            await Promise.race([
                page.waitForSelector('text=Select All', { timeout: 15000 }),
                page.waitForSelector('table', { timeout: 15000 }),
                page.waitForTimeout(12000),
            ]);
            console.log('    ✅ Parts table reached');
        } catch (e) {
            console.log('    ⚠️  Parts table not detected:', e.message);
        }

        await page.waitForTimeout(3000);

        // Inspect language options
        console.log('\n[7] Inspecting form elements...');
        try {
            const langOptions = await page.$$eval(
                'select[aria-label="Language"] option, select[aria-label*="lang" i] option',
                opts => opts.filter(o => o.value).map(o => ({ value: o.value, text: o.textContent.trim() }))
            );
            if (langOptions.length) {
                console.log('    Language options:', langOptions.map(o => `${o.value}="${o.text}"`).join(' | '));
            }
        } catch { /* ignore */ }

        // Captcha screenshot
        try {
            const captchaEl = await page.$('img[alt*="captcha" i], img[src*="captcha" i]');
            if (captchaEl) {
                const p = path.join(__dirname, 'eci-captcha-check-s22.png');
                await captchaEl.screenshot({ path: p });
                console.log(`    📸 Captcha saved: eci-captcha-check-s22.png`);
            } else {
                console.log('    ℹ️  Captcha not visible yet (appears after selecting parts)');
            }
        } catch { /* ignore */ }

    } catch (err) {
        console.error('\n❌ Navigation error:', err.message);
    }

    // ── Analysis ─────────────────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════════');
    console.log('  ANALYSIS: Comparing with current eciDirectApiClient.js');
    console.log('══════════════════════════════════════════════════\n');

    const apiRequests = captured.requests.filter(r =>
        r.url.includes('gateway-voters.eci.gov.in') || r.url.includes('/api/v1/')
    );

    if (apiRequests.length === 0) {
        console.log('⚠️  No gateway-voters API requests captured.');
        console.log('   All captured requests:');
        captured.requests.forEach(r => console.log(`   ${r.method} ${getPathname(r.url)}`));
    } else {
        console.log(`✅ Captured ${apiRequests.length} API request(s)\n`);

        const seenEndpoints = [...new Set(apiRequests.map(r => getPathname(r.url)))];
        console.log('📋 Endpoints seen:');
        seenEndpoints.forEach(ep => console.log(`   ${ep}`));

        // New endpoints
        const newEndpoints = seenEndpoints.filter(ep =>
            !KNOWN_ENDPOINTS.some(k => ep.includes(k.replace('/api/v1/', '')))
        );
        if (newEndpoints.length) {
            console.log('\n🆕 NEW endpoints not in current code:');
            newEndpoints.forEach(ep => console.log(`   ⚠️  ${ep}`));
        } else {
            console.log('\n✅ No unknown endpoints');
        }

        // Header comparison
        console.log('\n🔍 Header diff per request:');
        let anyChange = false;
        const stableNewHeaders = {};
        const dynamicHeadersSeen = {};

        apiRequests.forEach(r => {
            const ep = getPathname(r.url);
            const reqH = r.headers || {};

            const extra = Object.keys(reqH).filter(k =>
                !IGNORE_HEADERS.includes(k.toLowerCase()) &&
                !Object.keys(KNOWN_HEADERS).some(kh => kh.toLowerCase() === k.toLowerCase()) &&
                !isDynamic(k)
            );
            const extraDynamic = Object.keys(reqH).filter(k => isDynamic(k));
            const missing = Object.keys(KNOWN_HEADERS).filter(k =>
                !Object.keys(reqH).some(rk => rk.toLowerCase() === k.toLowerCase())
            );
            const changed = Object.keys(KNOWN_HEADERS).filter(k => {
                const actual = Object.entries(reqH).find(([rk]) => rk.toLowerCase() === k.toLowerCase());
                return actual && actual[1] !== KNOWN_HEADERS[k];
            });

            if (extra.length || missing.length || changed.length || extraDynamic.length) {
                anyChange = true;
                console.log(`\n   ${r.method} ${ep}`);
                if (extra.length) {
                    console.log(`   🆕 NEW stable headers: ${extra.map(h => `${h}=${reqH[h]}`).join(', ')}`);
                    extra.forEach(h => { stableNewHeaders[h] = reqH[h]; });
                }
                if (extraDynamic.length) {
                    console.log(`   🔑 Dynamic tokens (NOT patched): ${extraDynamic.join(', ')}`);
                    extraDynamic.forEach(h => { dynamicHeadersSeen[h] = true; });
                }
                if (missing.length) {
                    console.log(`   ❌ MISSING from live request: ${missing.join(', ')}`);
                }
                if (changed.length) {
                    console.log(`   🔄 CHANGED values:`);
                    changed.forEach(k => {
                        const actual = Object.entries(reqH).find(([rk]) => rk.toLowerCase() === k.toLowerCase());
                        console.log(`      ${k}: "${KNOWN_HEADERS[k]}" → "${actual?.[1]}"`);
                        stableNewHeaders[k] = actual?.[1];
                    });
                }
            }
        });

        if (!anyChange) {
            console.log('   ✅ Headers match — no changes needed');
        }

        if (Object.keys(dynamicHeadersSeen).length > 0) {
            console.log('\n🔑 Dynamic token headers detected (must be handled via Playwright browser):');
            Object.keys(dynamicHeadersSeen).forEach(h => console.log(`   ${h}`));
            console.log('   These are HMAC/signed tokens generated by ECI frontend JS.');
            console.log('   The Playwright flow already handles them automatically.');
            console.log('   Direct Axios calls may fail if ECI starts enforcing them server-side.');
        }

        // Request body shape check
        console.log('\n🔍 Request body shapes:');
        const partListReq = apiRequests.find(r => r.url.includes('get-publish-part-list'));
        if (partListReq?.postData) {
            console.log('   get-publish-part-list body:', JSON.stringify(partListReq.postData, null, 2));
            const EXPECTED = ['stateCd', 'acNumber', 'rollTypeRefId', 'pdfGenType', 'revisionNo', 'year'];
            const missing = EXPECTED.filter(k => !(k in (partListReq.postData || {})));
            const extra = Object.keys(partListReq.postData || {}).filter(k => !EXPECTED.includes(k));
            if (missing.length) console.log(`   ⚠️  Missing keys: ${missing.join(', ')}`);
            if (extra.length) console.log(`   🆕 New keys: ${extra.join(', ')}`);
            if (!missing.length && !extra.length) console.log('   ✅ Body shape unchanged');
        }

        const acLangReq = apiRequests.find(r => r.url.includes('get-ac-languages'));
        if (acLangReq?.postData) {
            console.log('   get-ac-languages body:', JSON.stringify(acLangReq.postData));
        }

        // Auto-patch if stable headers changed
        if (Object.keys(stableNewHeaders).length > 0) {
            console.log('\n🔧 Patching utils/eciDirectApiClient.js with stable header changes...');
            await patchEciClient(stableNewHeaders);
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(captured, null, 2));
    console.log(`\n💾 Full capture saved: eci-api-capture-s22.json`);

    console.log('\n══════════════════════════════════════════════════');
    console.log('  Browser left open for manual inspection.');
    console.log('  Press Ctrl+C to exit.');
    console.log('══════════════════════════════════════════════════\n');

    process.on('SIGINT', async () => {
        await browser.close();
        process.exit(0);
    });
}

/**
 * Patch getHeaders() in utils/eciDirectApiClient.js with updated stable header values.
 * Dynamic tokens (accept_yek / accept_rotcev) are never patched here.
 */
async function patchEciClient(newHeaders) {
    const clientPath = path.join(__dirname, 'utils', 'eciDirectApiClient.js');
    if (!fs.existsSync(clientPath)) {
        console.log('   ⚠️  utils/eciDirectApiClient.js not found');
        return;
    }

    let src = fs.readFileSync(clientPath, 'utf8');

    const headerFnMatch = src.match(/(const getHeaders = \(\) => \(\{)([\s\S]*?)(\}\);)/);
    if (!headerFnMatch) {
        console.log('   ⚠️  Could not locate getHeaders() block — skipping patch');
        console.log('   Suggested manual changes:', JSON.stringify(newHeaders, null, 2));
        return;
    }

    let block = headerFnMatch[2];
    const originalBlock = block;
    let changed = false;

    for (const [key, value] of Object.entries(newHeaders)) {
        if (isDynamic(key)) continue; // never patch dynamic tokens
        if (isSkipPatch(key)) continue; // skip headers with complex values or browser noise

        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '\\-');
        const pattern = new RegExp(`(['"]?${escapedKey}['"]?:\\s*)(['"][^'"]*['"])`, 'g');

        const updated = block.replace(pattern, (_match, prefix) => {
            changed = true;
            return `${prefix}'${value}'`;
        });

        if (updated !== block) {
            block = updated;
        } else {
            // Key not present — append it
            block = block.trimEnd();
            if (!block.endsWith(',')) block += ',';
            block += `\n    '${key}': '${value}',`;
            changed = true;
        }
    }

    if (!changed) {
        console.log('   ℹ️  No actual changes needed in getHeaders()');
        return;
    }

    const backupPath = clientPath.replace('.js', `.backup-${Date.now()}.js`);
    fs.copyFileSync(clientPath, backupPath);
    console.log(`   📁 Backup: utils/${path.basename(backupPath)}`);

    src = src.replace(originalBlock, block);
    fs.writeFileSync(clientPath, src);
    console.log('   ✅ eciDirectApiClient.js patched');
    console.log('   Updated:', Object.keys(newHeaders).filter(k => !isDynamic(k) && !isSkipPatch(k)).join(', '));
}

main().catch(err => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
});
