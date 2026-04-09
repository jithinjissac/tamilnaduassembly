import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tn-voter-slip-saas');

// Define Order schema (minimal for testing)
const orderSchema = new mongoose.Schema({});
const Order = mongoose.model('Order', orderSchema);

try {
  // Test 1: Find order by MongoDB _id
  console.log('\n=== Test 1: Search by MongoDB _id ===');
  const order1 = await Order.findById('6910f60b17add52462ca0696');
  if (order1) {
    console.log('âœ… Found by _id:', {
      _id: order1._id,
      orderId: order1.orderId,
      paymentStatus: order1.paymentStatus,
      userId: order1.userId
    });
  } else {
    console.log('âŒ Order not found by _id: 6910f60b17add52462ca0696');
  }

  // Test 2: Find order by orderId (if exists)
  console.log('\n=== Test 2: List first 5 orders ===');
  const orders = await Order.find().limit(5).select('_id orderId paymentStatus userId');
  if (orders.length > 0) {
    console.log(`âœ… Found ${orders.length} orders:`);
    orders.forEach((o, i) => {
      console.log(`  ${i + 1}. _id: ${o._id}, orderId: ${o.orderId}, status: ${o.paymentStatus}`);
    });
  } else {
    console.log('âŒ No orders found in database');
  }

  // Test 3: Get order with user ID from token
  console.log('\n=== Test 3: Check user ID ===');
  const userId = '690e575b5d542b57f682f3bf'; // From the JWT token in curl
  const userOrders = await Order.find({ userId }).select('_id orderId paymentStatus');
  console.log(`Orders for user ${userId}:`);
  if (userOrders.length > 0) {
    userOrders.forEach((o, i) => {
      console.log(`  ${i + 1}. _id: ${o._id}, orderId: ${o.orderId}, status: ${o.paymentStatus}`);
    });
  } else {
    console.log(`  No orders found for this user`);
  }

} catch (error) {
  console.error('Error:', error.message);
} finally {
  await mongoose.disconnect();
  console.log('\nâœ… Disconnected from MongoDB');
  process.exit(0);
}

