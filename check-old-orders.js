import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/voter-slip-saas');

const orderSchema = new mongoose.Schema({}, { strict: false });
const Order = mongoose.model('Order', orderSchema, 'orders');

try {
  console.log('\n=== CHECKING OLD ORDERS COMPATIBILITY ===\n');
  
  const orders = await Order.find().lean();
  console.log(`Total orders in database: ${orders.length}\n`);
  
  orders.forEach((order, idx) => {
    console.log(`${idx + 1}. Order ID: ${order.orderId || 'MISSING orderId!'}`);
    console.log(`   Created: ${order.createdAt}`);
    console.log(`   Payment: ${order.paymentStatus}`);
    
    // Check required fields
    const checks = {
      'orderId': !!order.orderId,
      'userId': !!order.userId,
      'voters array': Array.isArray(order.voters) && order.voters.length > 0,
      'customization': !!order.customization,
      'location': !!order.location,
    };
    
    const missing = Object.entries(checks)
      .filter(([_, exists]) => !exists)
      .map(([field]) => field);
    
    if (missing.length === 0) {
      console.log(`   ✅ COMPATIBLE - Can download`);
    } else {
      console.log(`   ❌ INCOMPLETE - Missing: ${missing.join(', ')}`);
    }
    
    console.log(`   Voters: ${order.totalVoters || 0}`);
    console.log('');
  });
  
  // Summary
  const compatible = orders.filter(o => 
    o.orderId && 
    o.userId && 
    o.voters?.length > 0 && 
    o.customization && 
    o.location
  );
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`✅ ${compatible.length} orders can download`);
  console.log(`❌ ${orders.length - compatible.length} orders missing data`);
  
  if (compatible.length === orders.length) {
    console.log(`\n🎉 ALL orders are compatible with download feature!`);
  } else {
    console.log(`\n⚠️ Some orders may need data migration`);
  }

} catch (error) {
  console.error('Error:', error.message);
} finally {
  await mongoose.disconnect();
  process.exit(0);
}
