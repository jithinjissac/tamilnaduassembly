import fetch from 'node-fetch';

const orderId = 'ORD-20251109-VE4JG4';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTBlNTc1YjVkNTQyYjU3ZjY4MmYzYmYiLCJpYXQiOjE3NjI3MTkxOTgsImV4cCI6MTc2NTMxMTE5OH0.PLuU54gG-Wg1VF_v1zNpBE5KyP36FAa3jloEpwJ1tJA';

try {
  console.log(`\n🧪 Testing download endpoint`);
  console.log(`Order ID: ${orderId}`);
  console.log(`Server: http://localhost:3000`);
  
  const response = await fetch(`http://localhost:3000/api/slips/download/${orderId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log(`\n📡 Response Status: ${response.status} ${response.statusText}`);
  console.log(`Content-Type: ${response.headers.get('content-type')}`);
  console.log(`Content-Length: ${response.headers.get('content-length')}`);
  
  if (response.ok) {
    const buffer = await response.buffer();
    console.log(`\n✅ Download Successful!`);
    console.log(`PDF Size: ${buffer.length} bytes`);
    console.log(`PDF Signature: ${buffer.slice(0, 10).toString('hex')}`);
    
    // Check if it's a valid PDF
    if (buffer.slice(0, 4).toString() === '%PDF') {
      console.log(`✅ Valid PDF format detected`);
    }
  } else {
    const text = await response.text();
    console.log(`\n❌ Download Failed`);
    console.log(`Response: ${text.substring(0, 200)}`);
  }
} catch (error) {
  console.error('\n❌ Error:', error.message);
}

process.exit(0);
