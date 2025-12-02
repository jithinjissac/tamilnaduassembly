/**
 * Test Proxy with GUI Browser
 * Opens Kerala SEC portal in visible browser to verify proxy is working
 * 
 * Usage:
 *   # With proxy
 *   $env:USE_PROXY="true"; $env:PROXY_SERVER="http://34.47.254.160:3128"; node scripts/test-proxy-gui.js
 * 
 *   # Without proxy (direct connection)
 *   node scripts/test-proxy-gui.js
 */

import { chromium } from 'playwright';
import { getProxyConfigWithFallback, logProxyStatus } from '../utils/proxyConfig.js';

console.log('🧪 Testing Proxy with GUI Browser...\n');

// Show current proxy configuration
logProxyStatus();

async function testWithGUI() {
  let browser;
  try {
    const proxyConfig = getProxyConfigWithFallback();
    
    console.log('🚀 Launching browser in GUI mode...');
    const launchOptions = {
      headless: false, // GUI mode - you'll see the browser!
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      slowMo: 100 // Slow down actions so you can see them
    };
    
    if (proxyConfig) {
      launchOptions.proxy = proxyConfig;
      console.log(`✅ Browser will use proxy: ${proxyConfig.server}\n`);
    } else {
      console.log(`ℹ️ Browser will use direct connection (no proxy)\n`);
    }
    
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    console.log('🌍 Step 1: Checking your IP location...\n');
    await page.goto('https://ipinfo.io/json', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    const ipInfoText = await page.textContent('pre');
    const ipInfo = JSON.parse(ipInfoText);
    
    console.log('📍 Your Current IP Information:');
    console.log('═══════════════════════════════════════');
    console.log(`IP:       ${ipInfo.ip}`);
    console.log(`Location: ${ipInfo.city}, ${ipInfo.region}`);
    console.log(`Country:  ${ipInfo.country} ${ipInfo.country === 'IN' ? '🇮🇳' : '🌍'}`);
    console.log(`Org:      ${ipInfo.org}`);
    console.log('═══════════════════════════════════════\n');
    
    if (ipInfo.country === 'IN') {
      console.log('✅ SUCCESS: IP is from India! Kerala SEC should work.\n');
    } else {
      console.log(`⚠️ WARNING: IP is from ${ipInfo.country}, not India.\n`);
    }
    
    console.log('🔍 Step 2: Loading Kerala SEC portal...\n');
    console.log('Opening: https://sec.kerala.gov.in/\n');
    
    try {
      await page.goto('https://sec.kerala.gov.in/', { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
    } catch (e) {
      console.log('⚠️ First attempt timed out, trying with basic load...\n');
      await page.goto('https://sec.kerala.gov.in/', { 
        waitUntil: 'commit',
        timeout: 60000 
      });
    }
    
    await page.waitForTimeout(2000);
    
    const title = await page.title();
    console.log(`✅ Page loaded successfully!`);
    console.log(`   Title: ${title || '(no title)'}\n`);
    
    console.log('🎯 Step 3: Navigating to Voter List page...\n');
    
    try {
      await page.goto('https://sec.kerala.gov.in/public/voters/list', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    } catch (e) {
      console.log('⚠️ Voter list page timeout, but browser is open...\n');
    }
    
    await page.waitForTimeout(2000);
    
    console.log('✅ Voter List page loaded!\n');
    
    console.log('👀 Browser will stay open for 60 seconds so you can explore...');
    console.log('   - Check if the page is in Malayalam or English');
    console.log('   - Try selecting a district');
    console.log('   - Verify the page works normally\n');
    
    console.log('⏳ Waiting 60 seconds... (press Ctrl+C to close immediately)\n');
    
    await page.waitForTimeout(60000);
    
    console.log('✅ Test complete!');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    
    if (error.message.includes('Timeout')) {
      console.log('\n💡 TROUBLESHOOTING:');
      console.log('   - Kerala SEC portal may be slow or down');
      console.log('   - Try enabling proxy if not already enabled');
      console.log('   - Check your internet connection\n');
    }
    
    if (error.message.includes('ERR_PROXY_CONNECTION_FAILED')) {
      console.log('\n💡 TROUBLESHOOTING:');
      console.log('   - Proxy server may be down or unreachable');
      console.log('   - Verify proxy server: http://34.47.254.160:3128');
      console.log('   - Check firewall settings\n');
    }
    
  } finally {
    if (browser) {
      console.log('🔒 Closing browser...');
      await browser.close();
    }
  }
}

// Run the test
testWithGUI().catch(console.error);
