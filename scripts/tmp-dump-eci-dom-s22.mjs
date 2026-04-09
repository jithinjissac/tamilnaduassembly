import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = path.join('data', 'eci');
const htmlFile = path.join(outDir, 'eci-s22-dom.html');
const jsonFile = path.join(outDir, 'eci-s22-dom-summary.json');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

await page.goto('https://voters.eci.gov.in/download-eroll?stateCode=S22', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
});

await page.waitForTimeout(10000);

const html = await page.content();
const summary = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select')).map((select) => ({
        name: select.getAttribute('name') || null,
        id: select.id || null,
        ariaLabel: select.getAttribute('aria-label') || null,
        disabled: select.disabled,
        value: select.value,
        optionCount: select.querySelectorAll('option').length,
        options: Array.from(select.querySelectorAll('option')).slice(0, 12).map((option) => ({
            value: option.value,
            text: (option.textContent || '').trim(),
        })),
    }));

    const inputs = Array.from(document.querySelectorAll('input')).map((input) => ({
        name: input.getAttribute('name') || null,
        id: input.id || null,
        type: input.getAttribute('type') || null,
        role: input.getAttribute('role') || null,
        ariaLabel: input.getAttribute('aria-label') || null,
        placeholder: input.getAttribute('placeholder') || null,
        value: input.value || '',
        disabled: input.disabled,
    }));

    return {
        title: document.title,
        url: location.href,
        textSnippet: (document.body?.innerText || '').slice(0, 2000),
        selectCount: selects.length,
        inputCount: inputs.length,
        selects,
        inputs: inputs.slice(0, 20),
    };
});

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(htmlFile, html);
await fs.writeFile(jsonFile, JSON.stringify(summary, null, 2));

console.log(JSON.stringify({ htmlFile, jsonFile, title: summary.title, selectCount: summary.selectCount, inputCount: summary.inputCount }, null, 2));

await browser.close();