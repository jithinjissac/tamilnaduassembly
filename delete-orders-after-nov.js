import mongoose from 'mongoose';
import Order from './models/Order.js';
import dotenv from 'dotenv';

dotenv.config();

const deleteOrdersAfterDate = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // November 31st doesn't exist (November has 30 days)
        // So treating this as December 1st, 2025 00:00:00
        const cutoffDate = new Date('2025-12-01T00:00:00.000Z');
        
        console.log('\n🔍 Finding orders created after November 30, 2025...');
        console.log('Cutoff date:', cutoffDate);

        // Find orders to delete
        const ordersToDelete = await Order.find({
            createdAt: { $gte: cutoffDate }
        });

        console.log(`\n📊 Found ${ordersToDelete.length} orders to delete`);

        if (ordersToDelete.length === 0) {
            console.log('✅ No orders found after the cutoff date');
            process.exit(0);
        }

        // Show some sample orders
        console.log('\n📋 Sample orders:');
        ordersToDelete.slice(0, 5).forEach(order => {
            console.log(`  - Order ID: ${order._id}, Created: ${order.createdAt}, Status: ${order.status}`);
        });

        // Ask for confirmation
        console.log(`\n⚠️  WARNING: This will DELETE ${ordersToDelete.length} orders permanently!`);
        console.log('To proceed, uncomment the deletion line in the script.');
        
        // UNCOMMENT THE NEXT LINE TO ACTUALLY DELETE
        // const result = await Order.deleteMany({ createdAt: { $gte: cutoffDate } });
        
        // console.log(`\n✅ Deleted ${result.deletedCount} orders`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

deleteOrdersAfterDate();
