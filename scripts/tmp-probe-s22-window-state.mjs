import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://voters.eci.gov.in/download-eroll?stateCode=S22', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(10000);

const result = await page.evaluate(() => {
  const keys = Object.keys(window);
  const interestingKeys = keys.filter((k) => /state|district|constitu|roll|eroll|redux|store|data/i.test(k));

  const summaries = [];
  for (const key of interestingKeys) {
    let value;
    try {
      value = window[key];
    } catch {
      continue;
    }

    const type = Object.prototype.toString.call(value);
    if (Array.isArray(value)) {
      summaries.push({ key, type: 'array', length: value.length });
      continue;
    }

    if (value && typeof value === 'object') {
      const childKeys = Object.keys(value).slice(0, 20);
      summaries.push({ key, type: 'object', childKeys });
      continue;
    }

    summaries.push({ key, type, value: String(value).slice(0, 120) });
  }

  return { interestingKeys, summaries };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
