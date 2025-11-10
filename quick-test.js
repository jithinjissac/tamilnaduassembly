import fetch from 'node-fetch';

const orderId = 'ORD-20251109-VE4JG4';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTBlNTc1YjVkNTQyYjU3ZjY4MmYzYmYiLCJpYXQiOjE3NjI3MTkxOTgsImV4cCI6MTc2NTMxMTE5OH0.PLuU54gG-Wg1VF_v1zNpBE5KyP36FAa3jloEpwJ1tJA';

console.log(`\n🧪 Testing: GET /api/slips/download/${orderId}`);
console.log(`Token: ${token.substring(0, 30)}...`);

try {
  const response = await fetch(`http://localhost:3000/api/slips/download/${orderId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log(`\n📡 Response: ${response.status}`);
  console.log(`Content-Type: ${response.headers.get('content-type')}`);
  
  if (response.ok) {
    const buffer = await response.buffer();
    console.log(`✅ SUCCESS - PDF size: ${buffer.length} bytes`);
  } else {
    const text = await response.text();
    console.log(`❌ FAILED`);
    console.log(`Response: ${text}`);
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
}

process.exit(0);
