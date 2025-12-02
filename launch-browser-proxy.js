import { chromium } from 'playwright';

const proxyServer = 'http://34.47.254.160:3128';

console.log('🚀 Launching Chromium with Google Cloud India proxy...');
console.log(`📡 Proxy: ${proxyServer}\n`);

const browser = await chromium.launch({
  headless: false,
  proxy: {
    server: proxyServer
  },
  args: [
    '--start-maximized',
    '--disable-blink-features=AutomationControlled'
  ]
});

const context = await browser.newContext({
  viewport: null,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
});

const page = await context.newPage();

console.log('✅ Browser launched with proxy');
console.log('🌐 Navigating to Kerala SEC portal...\n');

await page.goto('https://www.sec.kerala.gov.in/lsg-election/electoral-rolls/', { 
  waitUntil: 'domcontentloaded',
  timeout: 60000 
});

console.log('✅ Page loaded');
console.log('\n💡 Browser will stay open. Close manually when done.\n');

// Keep the script running
await new Promise(() => {});
