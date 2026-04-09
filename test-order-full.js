import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tn-voter-slip-saas');

// Define Order schema (minimal for testing)
const orderSchema = new mongoose.Schema({});
const Order = mongoose.model('Order', orderSchema);

try {
  console.log('\n=== Full Order Document ===');
  const order = await Order.findById('6910f60b17add52462ca0696');
  
  if (order) {
    console.log('Full document:', JSON.stringify(order.toObject(), null, 2));
  } else {
    console.log('Order not found');
  }

} catch (error) {
  console.error('Error:', error.message);
} finally {
  await mongoose.disconnect();
  process.exit(0);
}

