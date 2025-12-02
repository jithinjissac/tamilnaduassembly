/**
 * Open Proxy Browser for Manual Use
 * Browser stays open until you close it manually
 * 
 * Usage:
 *   $env:USE_PROXY="true"; $env:PROXY_SERVER="http://34.47.254.160:3128"; node scripts/open-proxy-browser.js
 */

import { chromium } from 'playwright';
import { getProxyConfigWithFallback, logProxyStatus } from '../utils/proxyConfig.js';

console.log('🌐 Opening Proxy Browser for Manual Use\n');
logProxyStatus();

async function openBrowser() {
  let browser;
  try {
    const proxyConfig = getProxyConfigWithFallback();
    
    const launchOptions = {
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    if (proxyConfig) {
      launchOptions.proxy = proxyConfig;
      console.log(`✅ Browser will route through: ${proxyConfig.server}`);
    } else {
      console.log(`ℹ️  Browser will use direct connection (no proxy)`);
    }
    
    console.log('\n🚀 Launching browser...\n');
    browser = await chromium.launch(launchOptions);
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    // Start with IP check page
    console.log('📍 Opening IP info page to verify location...\n');
    await page.goto('https://ipinfo.io', { waitUntil: 'domcontentloaded' });
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ BROWSER IS READY!');
    console.log('═══════════════════════════════════════════════════════════');
    
    if (proxyConfig) {
      console.log('\n🇮🇳 Your browser is routing through Mumbai, India');
      console.log('   IP should show: 34.47.254.160');
      console.log('   Location: Mumbai, Maharashtra, India\n');
    } else {
      console.log('\n🌍 Your browser is using direct connection');
      console.log('   IP will show your actual location\n');
    }
    
    console.log('📖 Instructions:');
    console.log('   - The browser window is now open for you to use');
    console.log('   - Navigate to any website you want');
    console.log('   - When done, just close the browser window');
    console.log('   - Or press Ctrl+C in this terminal\n');
    
    console.log('💡 Suggested sites to test:');
    console.log('   - https://kerala.gov.in');
    console.log('   - https://www.google.co.in');
    console.log('   - https://uidai.gov.in');
    console.log('   - Or search for anything you want!\n');
    
    console.log('⏳ Browser will stay open indefinitely...');
    console.log('   (Press Ctrl+C to close)\n');
    
    // Keep the script running until browser is closed or Ctrl+C
    await new Promise(() => {});
    
  } catch (error) {
    if (error.message.includes('Target page, context or browser has been closed')) {
      console.log('\n✅ Browser closed by user. Goodbye!');
    } else {
      console.error('\n❌ Error:', error.message);
    }
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Closing browser...');
  process.exit(0);
});

openBrowser();
