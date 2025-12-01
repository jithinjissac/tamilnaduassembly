/**
 * Test Proxy Configuration and IP Location
 * 
 * This script verifies that the proxy is working correctly
 * and shows the IP location that Kerala SEC will see.
 * 
 * Usage:
 *   # Test with proxy enabled
 *   USE_PROXY=true PROXY_SERVER=http://34.47.254.160:3128 node scripts/test-proxy-ip.js
 * 
 *   # Test without proxy (direct connection)
 *   USE_PROXY=false node scripts/test-proxy-ip.js
 */

import { chromium } from 'playwright';
import { getProxyConfigWithFallback, logProxyStatus, testProxyConnection } from '../utils/proxyConfig.js';

console.log('🧪 Testing Proxy Configuration...\n');

// Show current proxy configuration
logProxyStatus();

async function testIPLocation() {
  let browser;
  try {
    const proxyConfig = getProxyConfigWithFallback();
    
    console.log('🚀 Launching browser...');
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    if (proxyConfig) {
      launchOptions.proxy = proxyConfig;
      console.log(`✅ Browser will use proxy: ${proxyConfig.server}\n`);
    } else {
      console.log(`ℹ️ Browser will use direct connection (no proxy)\n`);
    }
    
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage();
    
    console.log('🌍 Fetching IP information from ipinfo.io...\n');
    const ipInfo = await testProxyConnection(page);
    
    console.log('\n📊 RESULTS:');
    console.log('═══════════════════════════════════════');
    console.log(`IP Address: ${ipInfo.ip}`);
    console.log(`Location:   ${ipInfo.city}, ${ipInfo.region}`);
    console.log(`Country:    ${ipInfo.country}`);
    console.log(`Org:        ${ipInfo.org}`);
    console.log(`Timezone:   ${ipInfo.timezone}`);
    console.log('═══════════════════════════════════════\n');
    
    // Test Kerala SEC access
    console.log('🔍 Testing Kerala SEC portal access...');
    try {
      await page.goto('https://sec.kerala.gov.in', { timeout: 15000 });
      const title = await page.title();
      console.log(`✅ Successfully loaded Kerala SEC portal`);
      console.log(`   Page title: ${title}\n`);
    } catch (error) {
      console.error(`❌ Failed to load Kerala SEC portal: ${error.message}\n`);
    }
    
    // Summary
    if (ipInfo.country === 'IN') {
      console.log('✅ SUCCESS: IP appears to be from India!');
      console.log('   Kerala SEC should accept requests from this IP.\n');
    } else {
      console.log('⚠️ WARNING: IP is NOT from India!');
      console.log(`   Current country: ${ipInfo.country}`);
      console.log('   Kerala SEC may block or rate-limit requests.\n');
      
      if (!proxyConfig) {
        console.log('💡 TIP: Enable proxy to appear from India:');
        console.log('   USE_PROXY=true PROXY_SERVER=http://34.47.254.160:3128 node scripts/test-proxy-ip.js\n');
      } else {
        console.log('⚠️ Proxy is enabled but IP is still not from India.');
        console.log('   Check if proxy server is properly configured.\n');
      }
    }
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack trace:', error.stack);
    
    if (error.message.includes('ERR_PROXY_CONNECTION_FAILED')) {
      console.log('\n💡 TROUBLESHOOTING:');
      console.log('1. Check if proxy server is running');
      console.log('2. Verify firewall allows port 3128');
      console.log('3. Test proxy with curl:');
      console.log('   curl -x http://34.47.254.160:3128 https://ipinfo.io\n');
    }
    
    if (error.message.includes('ERR_PROXY_AUTH_REQUESTED')) {
      console.log('\n💡 TROUBLESHOOTING:');
      console.log('1. Set PROXY_USER and PROXY_PASS environment variables');
      console.log('2. Verify credentials are correct');
      console.log('3. Check Squid password file on proxy server\n');
    }
    
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed.');
    }
  }
}

// Run the test
testIPLocation().catch(console.error);
