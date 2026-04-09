import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const OUT_DIR = path.join('data', 'eci');
const OUT_FILE = path.join(OUT_DIR, 'eci-s22-district-constituency-mapping.json');
const URL = 'https://voters.eci.gov.in/download-eroll?stateCode=S22';

const YEAR_SELECTOR = 'select[name="revyear"]';
const ROLL_TYPE_SELECTOR = 'select[name="roleType"]';
const DISTRICT_SELECTOR = 'select[name="district"]';
const CONSTITUENCY_INPUT_SELECTOR = 'input[role="combobox"][id^="react-select-"][id$="-input"], #react-select-2-input';
const LISTBOX_SELECTOR = '[id^="react-select-"][id$="-listbox"], [role="listbox"]';

function sleep(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function readExistingSnapshot() {
    try {
        const text = await fs.readFile(OUT_FILE, 'utf8');
        const parsed = JSON.parse(text);
        return Array.isArray(parsed.districts) ? parsed.districts : [];
    } catch {
        return [];
    }
}

async function writeSnapshot(rollTypeValue, mapping) {
    const output = {
        generatedAt: new Date().toISOString(),
        source: 'ECI Playwright DOM extraction',
        stateCode: 'S22',
        stateName: 'Tamil Nadu',
        url: URL,
        year: 2026,
        rollTypeValue,
        districtCount: mapping.length,
        totalConstituencies: mapping.reduce((sum, district) => sum + district.constituencyCount, 0),
        districts: mapping,
    };

    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(OUT_FILE, JSON.stringify(output, null, 2));
}

async function setupPage(page) {
    await page.goto(URL, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });

    await page.waitForTimeout(8000);
    await page.waitForSelector(YEAR_SELECTOR, { timeout: 20000 });
    let attempts = 0;
    while (attempts < 3) {
        try {
            await page.waitForSelector(ROLL_TYPE_SELECTOR, { timeout: 20000 });
            break;
        } catch (error) {
            attempts += 1;
            if (attempts >= 3) {
                throw error;
            }
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(8000);
            await page.waitForSelector(YEAR_SELECTOR, { timeout: 20000 });
        }
    }

    const rollTypeValue = await page.evaluate((selector) => {
        const select = document.querySelector(selector);
        if (!select) {
            return null;
        }

        if (select.value) {
            return select.value;
        }

        const options = Array.from(select.querySelectorAll('option'));
        const preferred = options.find((option) => option.value && option.value.includes('-FIR'));
        return preferred?.value || options.find((option) => option.value)?.value || null;
    }, ROLL_TYPE_SELECTOR);

    if (!rollTypeValue) {
        throw new Error('No roll type value available for S22');
    }

    return rollTypeValue;
}

async function getDistricts(page) {
    await page.waitForSelector(DISTRICT_SELECTOR, { timeout: 20000 });
    return page.evaluate((selector) => {
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
}

async function openConstituencyDropdown(page) {
    await page.waitForSelector(CONSTITUENCY_INPUT_SELECTOR, { timeout: 20000 });
    const input = page.locator(CONSTITUENCY_INPUT_SELECTOR).first();
    await input.click();
    await page.waitForTimeout(250);
    await input.press('ArrowDown');
    await page.waitForSelector(LISTBOX_SELECTOR, { timeout: 10000 });
    await page.waitForTimeout(800);
}

async function extractConstituencies(page) {
    return page.evaluate((selector) => {
        const listbox = document.querySelector(selector);
        if (!listbox) {
            return [];
        }

        const seen = new Set();
        const rows = [];
        const options = listbox.querySelectorAll('[role="option"], [id^="react-select-"][id*="-option-"]');

        options.forEach((option) => {
            const text = (option.textContent || '').trim();
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
}

async function closeDropdown(page) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
}

async function extractOneDistrict(district) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

    try {
        await setupPage(page);
        await page.selectOption(DISTRICT_SELECTOR, district.districtCode);
        await sleep(2200);
        await openConstituencyDropdown(page);
        const constituencies = await extractConstituencies(page);
        await closeDropdown(page);

        return {
            districtCode: district.districtCode,
            districtName: district.districtName,
            constituencyCount: constituencies.length,
            constituencies,
            error: null,
        };
    } catch (cause) {
        return {
            districtCode: district.districtCode,
            districtName: district.districtName,
            constituencyCount: 0,
            constituencies: [],
            error: cause.message,
        };
    } finally {
        await browser.close();
    }
}

async function main() {
    console.log('s22-mapping:start');

    const bootstrapBrowser = await chromium.launch({ headless: true });
    const bootstrapPage = await bootstrapBrowser.newPage({ viewport: { width: 1440, height: 960 } });

    let rollTypeValue;
    let districts;

    try {
        rollTypeValue = await setupPage(bootstrapPage);
        districts = await getDistricts(bootstrapPage);
    } finally {
        await bootstrapBrowser.close();
    }

    const existingMapping = await readExistingSnapshot();
    const mappingByCode = new Map(existingMapping.map((district) => [district.districtCode, district]));

    console.log(`s22-mapping:rollType=${rollTypeValue}`);
    console.log(`s22-mapping:districts=${districts.length}`);
    console.log(`s22-mapping:resume=${mappingByCode.size}`);

    const maxPasses = 10;
    for (let pass = 1; pass <= maxPasses; pass += 1) {
        const pending = districts.filter((district) => {
            const existing = mappingByCode.get(district.districtCode);
            return !existing || existing.error || existing.constituencyCount === 0;
        });

        if (pending.length === 0) {
            break;
        }

        console.log(`s22-mapping:pass=${pass}, pending=${pending.length}`);

        for (const district of pending) {
            process.stdout.write(`\rExtracting ${district.districtCode} ${district.districtName} ...`);
            const districtResult = await extractOneDistrict(district);
            mappingByCode.set(district.districtCode, districtResult);

            const mapping = Array.from(mappingByCode.values())
                .sort((a, b) => a.districtCode.localeCompare(b.districtCode));
            await writeSnapshot(rollTypeValue, mapping);
        }
    }

    process.stdout.write('\n');
    const output = JSON.parse(await fs.readFile(OUT_FILE, 'utf8'));
    console.log(JSON.stringify({ outFile: OUT_FILE, districtCount: output.districtCount, totalConstituencies: output.totalConstituencies }, null, 2));
}

main().catch((error) => {
    console.error('s22-mapping:error', error?.stack || error?.message || error);
    process.exit(1);
});