import mongoose from 'mongoose';
import Order from './models/Order.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkMalayalam() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get the most recent order
    const recentOrder = await Order.findOne().sort({ createdAt: -1 });
    
    if (!recentOrder) {
      console.log('❌ No orders found');
      return;
    }

    console.log('\n📋 Most recent order:');
    console.log('Order ID:', recentOrder.orderId);
    console.log('Created:', recentOrder.createdAt);
    console.log('\n📍 Location data:');
    console.log('District:', recentOrder.location.district);
    console.log('Local Body:', recentOrder.location.localBody);
    console.log('Ward:', recentOrder.location.ward);
    console.log('Polling Station:', recentOrder.location.pollingStation);
    console.log('Polling Station (Malayalam):', recentOrder.location.pollingStationMalayalam);
    
    if (recentOrder.location.pollingStationMalayalam) {
      console.log('\n✅ Malayalam polling station name IS saved in database!');
    } else {
      console.log('\n⚠️ Malayalam polling station name is NOT saved (null or undefined)');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkMalayalam();
