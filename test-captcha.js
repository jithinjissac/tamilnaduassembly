import axios from 'axios';

const results = [];

async function testCaptchaLoad(testNumber) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Test #${testNumber} - Captcha Load with Proxy`);
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  
  try {
    console.log('⏱️  Starting captcha session request...');
    const response = await axios.get('http://localhost:3000/api/initCaptchaSession', {
      timeout: 180000 // 3 minutes
    });
    
    const totalTime = Date.now() - startTime;
    
    console.log('\n✅ SUCCESS!\n');
    console.log('📊 Results:');
    console.log('─'.repeat(50));
    console.log(`Total Time: ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);
    console.log(`Session ID: ${response.data.sessionId}`);
    console.log(`Status: ${response.data.status}`);
    
    if (response.data.timings) {
      console.log('\n⏱️  Detailed Timings:');
      console.log(`  - Total: ${response.data.timings.total}ms`);
      console.log(`  - Page Load: ${response.data.timings.pageLoad}ms`);
    }
    
    // Test if captcha file is accessible
    console.log('\n🔍 Testing captcha file accessibility...');
    const captchaTest = await axios.get(`http://localhost:3000${response.data.captchaUrl.split('?')[0]}`, {
      responseType: 'arraybuffer',
      timeout: 5000
    });
    
    const fileSize = captchaTest.data.byteLength;
    console.log(`✅ Captcha file accessible (${fileSize} bytes, ${(fileSize/1024).toFixed(2)} KB)`);
    
    // Store result
    results.push({
      test: testNumber,
      success: true,
      totalTime,
      pageLoad: response.data.timings?.pageLoad || 0,
      fileSize,
      sessionId: response.data.sessionId
    });
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.log('\n❌ FAILED!\n');
    console.log(`Total Time: ${totalTime}ms (${(totalTime/1000).toFixed(2)}s)`);
    console.log(`Error: ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Response:`, error.response.data);
    }
    
    // Store failed result
    results.push({
      test: testNumber,
      success: false,
      totalTime,
      error: error.message
    });
  }
}

async function runMultipleTests(count = 5) {
  console.log('\n🚀 Starting Multiple Captcha Load Tests');
  console.log(`📊 Running ${count} tests...\n`);
  
  for (let i = 1; i <= count; i++) {
    await testCaptchaLoad(i);
    
    // Wait 2 seconds between tests (except for the last one)
    if (i < count) {
      console.log('\n⏸️  Waiting 2 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Print summary
  console.log('\n\n' + '='.repeat(60));
  console.log('📈 SUMMARY OF ALL TESTS');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n✅ Successful: ${successful.length}/${count}`);
  console.log(`❌ Failed: ${failed.length}/${count}`);
  
  if (successful.length > 0) {
    const avgTime = successful.reduce((sum, r) => sum + r.totalTime, 0) / successful.length;
    const avgPageLoad = successful.reduce((sum, r) => sum + r.pageLoad, 0) / successful.length;
    const minTime = Math.min(...successful.map(r => r.totalTime));
    const maxTime = Math.max(...successful.map(r => r.totalTime));
    const avgFileSize = successful.reduce((sum, r) => sum + r.fileSize, 0) / successful.length;
    
    console.log('\n⏱️  Performance Statistics:');
    console.log('─'.repeat(50));
    console.log(`Average Total Time: ${avgTime.toFixed(0)}ms (${(avgTime/1000).toFixed(2)}s)`);
    console.log(`Average Page Load: ${avgPageLoad.toFixed(0)}ms (${(avgPageLoad/1000).toFixed(2)}s)`);
    console.log(`Fastest: ${minTime}ms (${(minTime/1000).toFixed(2)}s)`);
    console.log(`Slowest: ${maxTime}ms (${(maxTime/1000).toFixed(2)}s)`);
    console.log(`Average File Size: ${(avgFileSize/1024).toFixed(2)} KB`);
  }
  
  console.log('\n📋 Individual Results:');
  console.log('─'.repeat(50));
  results.forEach(r => {
    if (r.success) {
      console.log(`Test #${r.test}: ✅ ${(r.totalTime/1000).toFixed(2)}s (Page: ${(r.pageLoad/1000).toFixed(2)}s, File: ${(r.fileSize/1024).toFixed(2)} KB)`);
    } else {
      console.log(`Test #${r.test}: ❌ ${(r.totalTime/1000).toFixed(2)}s - ${r.error}`);
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 All tests completed!');
  console.log('='.repeat(60) + '\n');
}

// Run 5 tests by default, or use command line argument
const testCount = parseInt(process.argv[2]) || 5;
runMultipleTests(testCount);
