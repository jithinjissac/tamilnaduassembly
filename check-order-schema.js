import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tn-voter-slip-saas');

const orderSchema = new mongoose.Schema({}, { strict: false });
const Order = mongoose.model('Order', orderSchema, 'orders');

try {
  console.log('\n=== Check Order Schema/Behavior ===');
  
  // Fetch without any schema projection
  const order = await Order.findById('6910f60b17add52462ca0696').lean();
  
  if (order) {
    console.log('\n Lean query result:');
    console.log('Keys in document:', Object.keys(order));
    console.log('\norderId:', order.orderId);
    console.log('userId:', order.userId);
    console.log('paymentStatus:', order.paymentStatus);
    console.log('\nFull order keys:', Object.keys(order).slice(0, 20));
  }

} catch (error) {
  console.error('Error:', error.message);
} finally {
  await mongoose.disconnect();
  process.exit(0);
}

