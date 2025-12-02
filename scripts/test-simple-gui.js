/**
 * Simple GUI Test - Opens Google in browser with proxy
 * This demonstrates the proxy is working visually
 * 
 * Usage:
 *   $env:USE_PROXY="true"; $env:PROXY_SERVER="http://34.47.254.160:3128"; node scripts/test-simple-gui.js
 */

import { chromium } from 'playwright';
import { getProxyConfigWithFallback, logProxyStatus } from '../utils/proxyConfig.js';

console.log('🧪 Simple GUI Proxy Test\n');
logProxyStatus();

async function simpleTest() {
  let browser;
  try {
    const proxyConfig = getProxyConfigWithFallback();
    
    console.log('🚀 Opening browser...\n');
    const launchOptions = {
      headless: false,
      args: ['--no-sandbox'],
      slowMo: 50
    };
    
    if (proxyConfig) {
      launchOptions.proxy = proxyConfig;
    }
    
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage();
    
    // Test 1: Check IP
    console.log('📍 Step 1: Checking IP at ipinfo.io...');
    await page.goto('https://ipinfo.io', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Test 2: Open Google India
    console.log('🇮🇳 Step 2: Opening Google India...');
    await page.goto('https://www.google.co.in', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    // Test 3: Search for Kerala
    console.log('🔍 Step 3: Searching for "Kerala"...');
    await page.fill('textarea[name="q"]', 'Kerala');
    await page.waitForTimeout(1000);
    await page.press('textarea[name="q"]', 'Enter');
    await page.waitForTimeout(5000);
    
    console.log('\n✅ Test complete! Browser will stay open for 30 seconds.');
    console.log('   You should see:');
    if (proxyConfig) {
      console.log('   - IP from Mumbai, India (34.47.254.160)');
      console.log('   - Google India homepage');
      console.log('   - Search results for Kerala\n');
    } else {
      console.log('   - Your local IP');
      console.log('   - Google homepage (local version)');
      console.log('   - Search results for Kerala\n');
    }
    
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

simpleTest();
