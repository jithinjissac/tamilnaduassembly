import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

const URL = 'https://voters.eci.gov.in/download-eroll?stateCode=S22';
const OUT_FILE = path.join('data', 'eci', 'eci-s22-district-constituency-mapping.json');
const DOM_SNAPSHOT_FILE = path.join('data', 'eci', 'eci-s22-dom.html');

const YEAR_SELECTOR = 'select[name="revyear"]';
const ROLL_TYPE_SELECTOR = 'select[name="roleType"]';
const DISTRICT_SELECTOR = 'select[name="district"]';
const CONSTITUENCY_INPUT_SELECTOR = 'input[role="combobox"][id^="react-select-"][id$="-input"], #react-select-2-input';
const LISTBOX_SELECTOR = '[id^="react-select-"][id$="-listbox"], [role="listbox"]';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

async function loadExistingMapping() {
    try {
        const raw = await fs.readFile(OUT_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.districts) ? parsed.districts : [];
    } catch {
        return [];
    }
}

async function writeMapping(districtRows) {
    const sorted = [...districtRows].sort((a, b) => a.districtCode.localeCompare(b.districtCode));
    const payload = {
        generatedAt: new Date().toISOString(),
        source: 'ECI Playwright DOM extraction',
        stateCode: 'S22',
        stateName: 'Tamil Nadu',
        url: URL,
        year: 2026,
        rollTypeValue: 'S22-2026-FIR',
        districtCount: sorted.length,
        totalConstituencies: sorted.reduce((acc, row) => acc + row.constituencyCount, 0),
        districts: sorted,
    };

    await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
    await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
}

async function getDistrictList() {
    try {
        const html = await fs.readFile(DOM_SNAPSHOT_FILE, 'utf8');
        const $ = cheerio.load(html);
        const rows = [];
        $('select[name="district"] option').each((_, option) => {
            const code = normalize($(option).attr('value'));
            const name = normalize($(option).text());
            if (!code) {
                return;
            }
            rows.push({ districtCode: code, districtName: name });
        });
        if (rows.length > 0) {
            return rows;
        }
    } catch {
        // Fallback to live page below.
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    try {
        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(10000);
        await page.waitForSelector(DISTRICT_SELECTOR, { timeout: 30000 });

        return await page.evaluate((selector) => {
            const select = document.querySelector(selector);
            if (!select) {
                return [];
            }
            return Array.from(select.querySelectorAll('option'))
                .filter((option) => option.value && option.value !== '')
                .map((option) => ({
                    districtCode: option.value,
                    districtName: (option.textContent || '').trim(),
                }));
        }, DISTRICT_SELECTOR);
    } finally {
        await browser.close();
    }
}

async function ensureFormReady(page) {
    await page.waitForSelector(DISTRICT_SELECTOR, { timeout: 30000 });

    const hasYear = await page.$(YEAR_SELECTOR);
    if (hasYear) {
        try {
            await page.selectOption(YEAR_SELECTOR, '2026');
            await page.waitForTimeout(600);
        } catch {
            // Not fatal.
        }
    }

    const hasRollType = await page.$(ROLL_TYPE_SELECTOR);
    if (hasRollType) {
        const rollValue = await page.evaluate((selector) => {
            const select = document.querySelector(selector);
            if (!select) {
                return null;
            }
            if (select.value) {
                return select.value;
            }
            const options = Array.from(select.querySelectorAll('option'));
            const preferred = options.find((opt) => opt.value && opt.value.includes('-FIR'));
            const fallback = options.find((opt) => opt.value && opt.value !== '');
            return preferred?.value || fallback?.value || null;
        }, ROLL_TYPE_SELECTOR);

        if (rollValue) {
            try {
                await page.selectOption(ROLL_TYPE_SELECTOR, rollValue);
                await page.waitForTimeout(800);
            } catch {
                // Not fatal.
            }
        }
    }
}

async function extractDistrictConstituencies(district, maxAttempts = 6) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
        try {
            await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(8000);
            await ensureFormReady(page);

            await page.selectOption(DISTRICT_SELECTOR, district.districtCode);
            await page.waitForTimeout(2200);

            await page.waitForSelector(CONSTITUENCY_INPUT_SELECTOR, { timeout: 20000 });
            const input = page.locator(CONSTITUENCY_INPUT_SELECTOR).first();
            await input.click();
            await page.waitForTimeout(250);
            await input.press('ArrowDown');
            await page.waitForSelector(LISTBOX_SELECTOR, { timeout: 15000 });
            await page.waitForTimeout(600);

            const constituencies = await page.evaluate((selector) => {
                const listbox = document.querySelector(selector);
                if (!listbox) {
                    return [];
                }

                const nodes = listbox.querySelectorAll('[role="option"], [id^="react-select-"][id*="-option-"]');
                const seen = new Set();
                const rows = [];

                nodes.forEach((node) => {
                    const text = (node.textContent || '').trim();
                    if (!text) {
                        return;
                    }
                    const lower = text.toLowerCase();
                    if (lower.includes('select ac') || lower.includes('no options') || lower.includes('loading')) {
                        return;
                    }
                    if (seen.has(text)) {
                        return;
                    }
                    seen.add(text);

                    const match = text.match(/^(\d+)\s*[-:]\s*(.+)$/);
                    rows.push({
                        value: match ? match[1] : text,
                        text,
                        acNumber: match ? Number(match[1]) : null,
                        acName: match ? match[2].trim() : text,
                    });
                });

                return rows;
            }, LISTBOX_SELECTOR);

            await browser.close();

            if (constituencies.length > 0) {
                return {
                    districtCode: district.districtCode,
                    districtName: district.districtName,
                    constituencyCount: constituencies.length,
                    constituencies,
                    error: null,
                };
            }

            throw new Error('No constituencies found in listbox');
        } catch (error) {
            await browser.close();
            if (attempt === maxAttempts) {
                return {
                    districtCode: district.districtCode,
                    districtName: district.districtName,
                    constituencyCount: 0,
                    constituencies: [],
                    error: error.message,
                };
            }
            await sleep(1200);
        }
    }

    return {
        districtCode: district.districtCode,
        districtName: district.districtName,
        constituencyCount: 0,
        constituencies: [],
        error: 'Unknown extraction failure',
    };
}

async function main() {
    const districtList = await getDistrictList();
    const existing = await loadExistingMapping();
    const mappingByCode = new Map(existing.map((row) => [row.districtCode, row]));

    const maxPasses = 12;
    for (let pass = 1; pass <= maxPasses; pass += 1) {
        const pending = districtList.filter((district) => {
            const row = mappingByCode.get(district.districtCode);
            return !row || row.error || row.constituencyCount <= 0;
        });

        if (pending.length === 0) {
            break;
        }

        console.log(`pass=${pass}, pending=${pending.length}`);

        for (const district of pending) {
            process.stdout.write(`\rExtracting ${district.districtCode} ${district.districtName} ...`);
            const result = await extractDistrictConstituencies(district);
            mappingByCode.set(district.districtCode, result);

            const orderedRows = districtList
                .map((item) => mappingByCode.get(item.districtCode))
                .filter(Boolean);
            await writeMapping(orderedRows);
        }

        process.stdout.write('\n');
    }

    const finalRows = districtList
        .map((item) => mappingByCode.get(item.districtCode))
        .filter(Boolean);
    await writeMapping(finalRows);

    const failed = finalRows.filter((row) => row.error || row.constituencyCount <= 0);
    const totalConstituencies = finalRows.reduce((acc, row) => acc + row.constituencyCount, 0);
    console.log(JSON.stringify({
        outFile: OUT_FILE,
        districtCount: finalRows.length,
        totalConstituencies,
        failedDistricts: failed.map((row) => row.districtCode),
    }, null, 2));
}

main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exit(1);
});