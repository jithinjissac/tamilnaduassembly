import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './models/Order.js';

dotenv.config();

async function checkSlipCount() {
    try {
        console.log('🔌 Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to database\n');
        
        // Find recent orders with 6 slips per page setting
        const orders = await Order.find({
            'customization.slipsPerPage': { $exists: true }
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('orderId customization.slipsPerPage voters createdAt')
        .lean();
        
        console.log(`📋 Found ${orders.length} orders with slipsPerPage setting:\n`);
        
        orders.forEach(order => {
            const slipsPerPage = order.customization?.slipsPerPage || 'NOT SET';
            const voterCount = order.voters?.length || 0;
            console.log(`Order: ${order.orderId}`);
            console.log(`  - Created: ${order.createdAt}`);
            console.log(`  - Slips per page: ${slipsPerPage}`);
            console.log(`  - Total voters: ${voterCount}`);
            console.log('');
        });
        
        // Find orders with slipsPerPage = 6
        const sixSlipOrders = await Order.find({
            'customization.slipsPerPage': 6
        }).countDocuments();
        
        // Find orders with slipsPerPage = 5
        const fiveSlipOrders = await Order.find({
            'customization.slipsPerPage': 5
        }).countDocuments();
        
        console.log(`📊 Summary:`);
        console.log(`  - Orders with 5 slips per page: ${fiveSlipOrders}`);
        console.log(`  - Orders with 6 slips per page: ${sixSlipOrders}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
        process.exit(0);
    }
}

checkSlipCount();
