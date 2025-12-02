/**
 * Test Indian Government Sites Through Proxy
 * Checks if .gov.in sites are accessible through the proxy
 */

import { chromium } from 'playwright';
import { getProxyConfigWithFallback, logProxyStatus } from '../utils/proxyConfig.js';

console.log('🧪 Testing Indian Government Sites Through Proxy\n');
logProxyStatus();

const testSites = [
  { name: 'India.gov.in', url: 'https://www.india.gov.in' },
  { name: 'Kerala SEC', url: 'https://sec.kerala.gov.in' },
  { name: 'Kerala Government', url: 'https://kerala.gov.in' },
  { name: 'UIDAI (Aadhaar)', url: 'https://uidai.gov.in' },
  { name: 'Digital India', url: 'https://digitalindia.gov.in' },
  { name: 'MyGov India', url: 'https://www.mygov.in' },
  { name: 'Income Tax India', url: 'https://www.incometax.gov.in' }
];

async function testGovernmentSites() {
  let browser;
  const results = [];
  
  try {
    const proxyConfig = getProxyConfigWithFallback();
    
    console.log('🚀 Launching browser...\n');
    const launchOptions = {
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    if (proxyConfig) {
      launchOptions.proxy = proxyConfig;
    }
    
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage();
    
    // First check IP
    console.log('📍 Checking IP location...');
    await page.goto('https://ipinfo.io/json', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const ipText = await page.textContent('pre');
    const ipInfo = JSON.parse(ipText);
    console.log(`   IP: ${ipInfo.ip} (${ipInfo.city}, ${ipInfo.country})\n`);
    
    console.log('🔍 Testing Indian Government Websites:\n');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    for (const site of testSites) {
      process.stdout.write(`Testing ${site.name.padEnd(25)} ... `);
      
      try {
        const startTime = Date.now();
        await page.goto(site.url, { 
          waitUntil: 'domcontentloaded', 
          timeout: 20000 
        });
        const loadTime = Date.now() - startTime;
        
        const title = await page.title();
        console.log(`✅ Success (${loadTime}ms)`);
        console.log(`   Title: ${title.substring(0, 60)}${title.length > 60 ? '...' : ''}\n`);
        
        results.push({ 
          name: site.name, 
          url: site.url, 
          status: 'success', 
          loadTime,
          title 
        });
        
        await page.waitForTimeout(1000);
        
      } catch (error) {
        console.log(`❌ Failed`);
        console.log(`   Error: ${error.message.substring(0, 80)}\n`);
        
        results.push({ 
          name: site.name, 
          url: site.url, 
          status: 'failed', 
          error: error.message 
        });
      }
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY:\n');
    
    const successful = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed');
    
    console.log(`✅ Successful: ${successful.length}/${testSites.length}`);
    console.log(`❌ Failed:     ${failed.length}/${testSites.length}\n`);
    
    if (successful.length > 0) {
      console.log('✅ Working Sites:');
      successful.forEach(r => {
        console.log(`   - ${r.name} (${r.loadTime}ms)`);
      });
      console.log('');
    }
    
    if (failed.length > 0) {
      console.log('❌ Failed Sites:');
      failed.forEach(r => {
        console.log(`   - ${r.name}`);
        console.log(`     ${r.error.split('\n')[0]}`);
      });
      console.log('');
    }
    
    if (failed.length === testSites.length) {
      console.log('⚠️  ALL SITES FAILED!');
      console.log('   Possible causes:');
      console.log('   1. Proxy may be blocking .gov.in domains');
      console.log('   2. Government sites may be blocking proxy IPs');
      console.log('   3. Network/firewall issues');
      console.log('   4. Sites may be temporarily down\n');
    } else if (failed.some(r => r.name === 'Kerala SEC') && successful.length > 0) {
      console.log('💡 Kerala SEC specifically failed but other sites work.');
      console.log('   This suggests Kerala SEC may be down or have specific restrictions.\n');
    }
    
    console.log('Browser will stay open for 15 seconds for inspection...\n');
    await page.waitForTimeout(15000);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('✅ Browser closed.');
    }
  }
}

testGovernmentSites();
