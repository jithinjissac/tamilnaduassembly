import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ECI_BASE_URL = 'https://voters.eci.gov.in';
const YEAR_SELECTOR = 'select[aria-label="Year Of Revision"], select[aria-label="Select Year of Revision"], select[name="revyear"]';
const ROLL_TYPE_SELECTOR = 'select[aria-label="Roll Type"], select[aria-label="Select Roll Type"], select[name="roleType"]';
const DISTRICT_SELECTOR = 'select[aria-label="District"], select[aria-label="Select District"], select[name="district"]';
const CONSTITUENCY_INPUT_SELECTOR = 'input[role="combobox"][id^="react-select-"][id$="-input"], input[aria-label*="Constituency"], input[placeholder*="Constituency"], input[aria-label*="Assembly"]';
const LISTBOX_SELECTOR = '[id^="react-select-"][id$="-listbox"], [role="listbox"]';

function parseArgs(argv) {
    const options = {
        stateCode: process.env.ECI_STATE?.toUpperCase() || '',
        year: Number(process.env.ECI_YEAR || new Date().getFullYear()),
        outFile: process.env.ECI_OUT_FILE || '',
        headless: process.env.ECI_HEADLESS === '1',
        delayMs: Number(process.env.ECI_DELAY_MS || 1200),
        maxDistricts: Number(process.env.ECI_MAX_DISTRICTS || 0),
        districtCode: process.env.ECI_DISTRICT?.toUpperCase() || '',
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const next = argv[index + 1];

        if (arg === '--state' && next) {
            options.stateCode = next.toUpperCase();
            index += 1;
            continue;
        }

        if (arg === '--year' && next) {
            options.year = Number(next);
            index += 1;
            continue;
        }

        if (arg === '--out' && next) {
            options.outFile = next;
            index += 1;
            continue;
        }

        if (arg === '--delay-ms' && next) {
            options.delayMs = Number(next);
            index += 1;
            continue;
        }

        if (arg === '--max-districts' && next) {
            options.maxDistricts = Number(next);
            index += 1;
            continue;
        }

        if (arg === '--district' && next) {
            options.districtCode = next.toUpperCase();
            index += 1;
            continue;
        }

        if (arg === '--headless') {
            options.headless = true;
        }
    }

    return options;
}

function validateOptions(options) {
    if (!/^S\d{2}$/i.test(options.stateCode)) {
        throw new Error('Missing or invalid --state. Example: --state S11');
    }

    if (!Number.isInteger(options.year) || options.year < 2000) {
        throw new Error('Missing or invalid --year. Example: --year 2026');
    }

    if (!Number.isInteger(options.delayMs) || options.delayMs < 0) {
        throw new Error('Missing or invalid --delay-ms. Example: --delay-ms 1200');
    }

    if (!Number.isInteger(options.maxDistricts) || options.maxDistricts < 0) {
        throw new Error('Missing or invalid --max-districts. Example: --max-districts 3');
    }
}

function sleep(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function getDownloadErollUrl(stateCode) {
    return `${ECI_BASE_URL}/download-eroll?stateCode=${encodeURIComponent(stateCode)}`;
}

async function selectYear(page, year) {
    await page.waitForSelector(YEAR_SELECTOR, { timeout: 20000 });

    const availableYear = await page.evaluate((selector, preferredYear) => {
        const select = document.querySelector(selector);
        if (!select) {
            return null;
        }

        const options = Array.from(select.querySelectorAll('option'));
        const preferred = options.find((option) => option.value === String(preferredYear));
        if (preferred) {
            return preferred.value;
        }

        const fallback = options.find((option) => option.value && option.value !== '');
        return fallback ? fallback.value : null;
    }, YEAR_SELECTOR, year);

    if (!availableYear) {
        throw new Error('No usable year option found on ECI page');
    }

    await page.selectOption(YEAR_SELECTOR, availableYear);
    return availableYear;
}

async function selectRollType(page) {
    await page.waitForSelector(ROLL_TYPE_SELECTOR, { timeout: 20000 });

    const rollTypeValue = await page.evaluate((selector) => {
        const select = document.querySelector(selector);
        if (!select) {
            return null;
        }

        const options = Array.from(select.querySelectorAll('option'));
        const preferred = options.find((option) => option.value && String(option.value).includes('-FIR'));
        if (preferred) {
            return preferred.value;
        }

        const fallback = options.find((option) => option.value && option.value !== '');
        return fallback ? fallback.value : null;
    }, ROLL_TYPE_SELECTOR);

    if (!rollTypeValue) {
        throw new Error('No usable roll type option found on ECI page');
    }

    await page.selectOption(ROLL_TYPE_SELECTOR, rollTypeValue);
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
                value: option.value,
                text: (option.textContent || '').trim(),
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
}

async function readConstituencyOptions(page) {
    return page.evaluate((selector) => {
        const listbox = document.querySelector(selector);
        if (!listbox) {
            return [];
        }

        const optionNodes = listbox.querySelectorAll('[role="option"], .css-tr4s17-option, [id^="react-select-"][id*="-option-"]');
        const seen = new Set();
        const rows = [];

        optionNodes.forEach((node) => {
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
}

async function closeConstituencyDropdown(page) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
}

async function exportDomData(options) {
    const browser = await chromium.launch({
        headless: options.headless,
        slowMo: options.headless ? 0 : 150,
    });

    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

    try {
        await page.goto(getDownloadErollUrl(options.stateCode), {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        await sleep(options.delayMs);

        const selectedYear = await selectYear(page, options.year);
        await sleep(options.delayMs);
        const rollTypeValue = await selectRollType(page);
        await sleep(options.delayMs);

        let districts = await getDistricts(page);
        if (options.districtCode) {
            districts = districts.filter((district) => district.value === options.districtCode);
        }

        if (options.maxDistricts > 0) {
            districts = districts.slice(0, options.maxDistricts);
        }

        const results = [];

        for (const district of districts) {
            process.stdout.write(`\rExtracting district ${district.value} (${district.text}) ...`);

            await page.selectOption(DISTRICT_SELECTOR, district.value);
            await sleep(options.delayMs + 600);

            let constituencies = [];
            let error = null;

            try {
                await openConstituencyDropdown(page);
                await sleep(500);
                constituencies = await readConstituencyOptions(page);
                await closeConstituencyDropdown(page);
            } catch (cause) {
                error = cause.message;
            }

            results.push({
                districtCode: district.value,
                districtName: district.text,
                constituencyCount: constituencies.length,
                constituencies,
                error,
            });
        }

        process.stdout.write('\n');

        return {
            generatedAt: new Date().toISOString(),
            source: 'ECI DOM extraction',
            sourceUrl: getDownloadErollUrl(options.stateCode),
            stateCode: options.stateCode,
            year: Number(selectedYear),
            rollTypeValue,
            districtCount: results.length,
            totalConstituencies: results.reduce((sum, district) => sum + district.constituencyCount, 0),
            districts: results,
        };
    } finally {
        await browser.close();
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    validateOptions(options);

    const outFile = options.outFile || path.join('data', 'eci', `${options.stateCode}-${options.year}-dom.json`);
    const exportData = await exportDomData(options);

    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, JSON.stringify(exportData, null, 2));

    console.log(`Wrote ${exportData.totalConstituencies} constituencies across ${exportData.districtCount} districts to ${outFile}`);
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});