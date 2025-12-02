/**
 * Quick Test - Kerala SEC Loading with Proxy
 * Tests if the application can now load Kerala SEC portal
 */

import { chromium } from 'playwright';
import { getProxyConfigWithFallback } from '../utils/proxyConfig.js';

const SEC_BASE_URL = 'https://sec.kerala.gov.in';

async function testKeralaSecLoading() {
  let browser;
  try {
    const proxyConfig = getProxyConfigWithFallback();
    
    console.log('🧪 Testing Kerala SEC Loading (Application Settings)\n');
    
    const launchOptions = {
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    if (proxyConfig) {
      launchOptions.proxy = proxyConfig;
      console.log(`✅ Using proxy: ${proxyConfig.server}\n`);
    }
    
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'Asia/Kolkata',
      permissions: []
    });
    
    const page = await context.newPage();
    
    // Add extra headers to look more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Test 1: Set Malayalam locale
    console.log('📍 Step 1: Setting Malayalam locale...');
    const start1 = Date.now();
    await page.goto(`${SEC_BASE_URL}/?set_locale=ml`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    console.log(`   ✅ Loaded in ${Date.now() - start1}ms\n`);
    
    await page.waitForTimeout(1000);
    
    // Test 2: Navigate to voter list page
    console.log('📋 Step 2: Loading voter list page...');
    const start2 = Date.now();
    await page.goto(`${SEC_BASE_URL}/public/voters/list`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    console.log(`   ✅ Loaded in ${Date.now() - start2}ms\n`);
    
    await page.waitForTimeout(2000);
    
    // Test 3: Check for captcha
    console.log('🔍 Step 3: Looking for captcha image...');
    try {
      const captcha = await page.waitForSelector('img[src*="captcha"]', {
        state: 'visible',
        timeout: 10000
      });
      
      if (captcha) {
        console.log('   ✅ Captcha found!\n');
        
        // Take screenshot
        await page.screenshot({ path: 'kerala-sec-test.png', fullPage: true });
        console.log('📸 Screenshot saved: kerala-sec-test.png\n');
      }
    } catch (e) {
      console.log('   ⚠️ Captcha not found (page may have loaded differently)\n');
    }
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ SUCCESS! Kerala SEC portal is loading correctly!');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('Browser will stay open for 10 seconds...\n');
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    console.error('\nThis means Kerala SEC is still not accessible.');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

testKeralaSecLoading();
