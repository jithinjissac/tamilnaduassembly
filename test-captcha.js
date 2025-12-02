import { chromium } from 'playwright';
import { getProxyConfigWithFallback } from './utils/proxyConfig.js';

console.log('Testing Playwright captcha capture...');

(async () => {
  let browser;
  try {
    console.log('Launching browser...');
    const proxyConfig = getProxyConfigWithFallback();
    const launchOptions = { 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    if (proxyConfig) {
      launchOptions.proxy = proxyConfig;
    }
    
    browser = await chromium.launch(launchOptions);

    console.log('Creating context...');
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    const page = await context.newPage();

    // Set cookies
    await context.addCookies([
      {
        name: 'set_locale',
        value: 'ml',
        domain: '.sec.kerala.gov.in',
        path: '/'
      }
    ]);

    console.log('Navigating to SEC page...');
    await page.goto('https://sec.kerala.gov.in/public/voters/list', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });

    console.log('Waiting for captcha...');
    await page.waitForSelector('img[src*="captcha"]', { timeout: 10000 });
    
    console.log('Taking screenshot...');
    const captchaElement = await page.$('img[src*="captcha"]');
    await captchaElement.screenshot({ path: 'test-captcha.png' });
    
    console.log('✅ Success! Captcha saved to test-captcha.png');
    await browser.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
