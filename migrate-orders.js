import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tn-voter-slip-saas');

// Define Order schema
const orderSchema = new mongoose.Schema({});
const Order = mongoose.model('Order', orderSchema);

const User = mongoose.model('User', new mongoose.Schema({}));

try {
  console.log('\n=== Finding Orders Without orderId ===');
  
  const ordersWithoutOrderId = await Order.find({ orderId: { $exists: false } });
  console.log(`Found ${ordersWithoutOrderId.length} orders without orderId`);

  if (ordersWithoutOrderId.length === 0) {
    console.log('âœ… All orders have orderId field');
  } else {
    console.log('\n=== Migrating Orders ===');
    
    for (let i = 0; i < ordersWithoutOrderId.length; i++) {
      const order = ordersWithoutOrderId[i];
      
      // Generate orderId from MongoDB _id or create new one
      const timestamp = order._id.getTimestamp();
      const date = timestamp.toISOString().split('T')[0].replace(/-/g, '');
      const sequence = String(i + 1).padStart(3, '0');
      const generatedOrderId = `ORD-${date}-${sequence}`;
      
      console.log(`\n${i + 1}. Order _id: ${order._id}`);
      console.log(`   Generated orderId: ${generatedOrderId}`);
      console.log(`   Current paymentStatus: ${order.paymentStatus}`);
      console.log(`   Current userId: ${order.userId}`);
      
      // Update the order
      order.orderId = generatedOrderId;
      await order.save();
      
      console.log(`   âœ… Updated`);
    }
    
    console.log('\n=== Migration Complete ===');
    console.log(`âœ… Updated ${ordersWithoutOrderId.length} orders`);
  }

  // Verify all orders now have orderId
  console.log('\n=== Verification ===');
  const allOrders = await Order.find().select('_id orderId userId paymentStatus');
  console.log(`Total orders: ${allOrders.length}`);
  
  allOrders.forEach((o, i) => {
    console.log(`${i + 1}. orderId: ${o.orderId}, userId: ${o.userId}, status: ${o.paymentStatus}`);
  });

} catch (error) {
  console.error('Error:', error.message);
  console.error(error);
} finally {
  await mongoose.disconnect();
  console.log('\nâœ… Disconnected from MongoDB');
  process.exit(0);
}

