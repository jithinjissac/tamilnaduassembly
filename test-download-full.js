import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tn-voter-slip-saas');

const orderSchema = new mongoose.Schema({}, { strict: false });
const Order = mongoose.model('Order', orderSchema, 'orders');

try {
  console.log('\n=== DIAGNOSING DOWNLOAD ISSUE ===\n');
  
  // Get the order
  const orderId = 'ORD-20251109-VE4JG4';
  const userId = '690e575b5d542b57f682f3bf';
  
  console.log('Step 1: Fetch order from database');
  console.log(`  Query: { orderId: "${orderId}", userId: "${userId}" }`);
  
  const order = await Order.findOne({ orderId, userId }).lean();
  
  if (!order) {
    console.log('  âŒ Order not found!');
    process.exit(1);
  }
  
  console.log('  âœ… Order found');
  console.log(`  Total voters: ${order.totalVoters}`);
  console.log(`  Payment status: ${order.paymentStatus}`);
  console.log(`  Has customization: ${!!order.customization}`);
  console.log(`  Has location: ${!!order.location}`);
  console.log(`  Has voters array: ${Array.isArray(order.voters)}`);
  console.log(`  Voter count: ${order.voters ? order.voters.length : 0}`);
  
  console.log('\nStep 2: Check customization data');
  if (order.customization) {
    console.log(`  Symbol ID: ${order.customization.symbolId}`);
    console.log(`  Symbol Image: ${order.customization.symbolImage ? 'YES' : 'NO'}`);
    console.log(`  Symbol Name: ${order.customization.symbolName || 'MISSING'}`);
    console.log(`  Symbol Name Malayalam: ${order.customization.symbolNameMalayalam || 'MISSING'}`);
  }
  
  console.log('\nStep 3: Check location data');
  if (order.location) {
    console.log(`  District: ${order.location.district || 'MISSING'}`);
    console.log(`  Assembly: ${order.location.assembly || 'MISSING'}`);
    console.log(`  Polling Station: ${order.location.pollingStation || 'MISSING'}`);
    console.log(`  Location (search): ${order.location.search || 'MISSING'}`);
  }
  
  console.log('\nâœ… Order structure looks COMPLETE');
  console.log('\nStep 4: Now testing actual download endpoint...\n');
  
  // Test the download
  const fetch = (await import('node-fetch')).default;
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTBlNTc1YjVkNTQyYjU3ZjY4MmYzYmYiLCJpYXQiOjE3NjI3MTkxOTgsImV4cCI6MTc2NTMxMTE5OH0.PLuU54gG-Wg1VF_v1zNpBE5KyP36FAa3jloEpwJ1tJA';
  
  console.log(`ðŸ“¡ Calling: GET /api/slips/download/${orderId}`);
  console.log(`   Token: ${token.substring(0, 20)}...`);
  
  const response = await fetch(`http://localhost:3000/api/slips/download/${orderId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Test Client'
    },
    timeout: 60000
  });
  
  console.log(`\nðŸ“¡ Response received:`);
  console.log(`   Status: ${response.status} ${response.statusText}`);
  console.log(`   Content-Type: ${response.headers.get('content-type')}`);
  console.log(`   Content-Length: ${response.headers.get('content-length')}`);
  
  if (response.ok) {
    const buffer = await response.buffer();
    console.log(`\nâœ… DOWNLOAD SUCCESSFUL!`);
    console.log(`   PDF Size: ${buffer.length} bytes`);
    console.log(`   PDF Signature: ${buffer.slice(0, 4).toString('ascii')}`);
    
    if (buffer.slice(0, 4).toString('ascii') === '%PDF') {
      console.log(`   âœ… Valid PDF format`);
    }
  } else {
    console.log(`\nâŒ Download failed`);
    const text = await response.text();
    console.log(`   Response: ${text.substring(0, 500)}`);
  }

} catch (error) {
  console.error('\nâŒ Error:', error.message);
  console.error(error.stack);
} finally {
  await mongoose.disconnect();
  process.exit(0);
}

