import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tn-voter-slip-saas');

const orderSchema = new mongoose.Schema({}, { strict: false });
const Order = mongoose.model('Order', orderSchema, 'orders');

try {
  console.log('\n=== CHECKING DATA IN DATABASE ===\n');
  
  // First, get all orders
  console.log('All orders in database:');
  const orders = await Order.find().lean();
  console.log(`Total: ${orders.length}`);
  
  orders.forEach((o, i) => {
    console.log(`\n${i + 1}. _id: ${o._id}`);
    console.log(`   orderId: ${o.orderId} (type: ${typeof o.orderId})`);
    console.log(`   userId: ${o.userId} (type: ${typeof o.userId})`);
    console.log(`   paymentStatus: ${o.paymentStatus}`);
  });
  
  // Now try different queries
  console.log('\n\n=== TESTING QUERIES ===\n');
  
  const testOrderId = 'ORD-20251109-VE4JG4';
  const testUserId = '690e575b5d542b57f682f3bf';
  
  console.log(`Test 1: Query by orderId = "${testOrderId}"`);
  let result = await Order.findOne({ orderId: testOrderId }).lean();
  console.log(`  Result: ${result ? 'FOUND' : 'NOT FOUND'}`);
  
  console.log(`\nTest 2: Query by userId = "${testUserId}"`);
  result = await Order.findOne({ userId: testUserId }).lean();
  console.log(`  Result: ${result ? 'FOUND' : 'NOT FOUND'}`);
  
  console.log(`\nTest 3: Query by both`);
  result = await Order.findOne({ orderId: testOrderId, userId: testUserId }).lean();
  console.log(`  Result: ${result ? 'FOUND' : 'NOT FOUND'}`);
  
  console.log(`\nTest 4: Query userId as ObjectId`);
  const userObjectId = new mongoose.Types.ObjectId(testUserId);
  result = await Order.findOne({ userId: userObjectId }).lean();
  console.log(`  Result: ${result ? 'FOUND' : 'NOT FOUND'}`);
  
  console.log(`\nTest 5: Get first order and inspect`);
  const firstOrder = await Order.findOne().lean();
  if (firstOrder) {
    console.log(`  orderId value: "${firstOrder.orderId}"`);
    console.log(`  orderId type: ${typeof firstOrder.orderId}`);
    console.log(`  orderId length: ${firstOrder.orderId?.length}`);
    console.log(`  matches ORD-20251109-VE4JG4? ${firstOrder.orderId === testOrderId}`);
  }

} catch (error) {
  console.error('\nâŒ Error:', error.message);
  console.error(error);
} finally {
  await mongoose.disconnect();
  process.exit(0);
}

