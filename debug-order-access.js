import mongoose from 'mongoose';
import Order from './models/Order.js';
import User from './models/User.js';

const orderId = 'ORD-20251112-OVL12U';

async function debugOrder() {
    try {
        await mongoose.connect('mongodb://localhost:27017/kerala_election');
        console.log('✅ Connected to MongoDB\n');

        const order = await Order.findOne({ orderId }).lean();
        if (!order) {
            console.log('❌ Order not found');
            mongoose.disconnect();
            return;
        }

        console.log('📦 Order Details:');
        console.log('   orderId:', order.orderId);
        console.log('   userId:', order.userId);
        console.log('   userId type:', typeof order.userId);
        console.log('   userId constructor:', order.userId?.constructor?.name);
        console.log('   paymentStatus:', order.paymentStatus);
        console.log('   permanentPdfFilename:', order.permanentPdfFilename);
        console.log();

        const user = await User.findById(order.userId).lean();
        if (user) {
            console.log('👤 User Details:');
            console.log('   _id:', user._id);
            console.log('   _id type:', typeof user._id);
            console.log('   _id constructor:', user._id?.constructor?.name);
            console.log('   email:', user.email);
            console.log('   name:', user.name);
            console.log('   role:', user.role);
            console.log();

            console.log('🔍 Comparison Test:');
            console.log('   order.userId:', order.userId);
            console.log('   user._id:', user._id);
            console.log('   Direct comparison (===):', order.userId === user._id);
            console.log('   String comparison:', String(order.userId) === String(user._id));
            console.log('   order.userId.toString():', order.userId.toString());
            console.log('   user._id.toString():', user._id.toString());
            console.log('   .toString() comparison:', order.userId.toString() === user._id.toString());
        }

        mongoose.disconnect();
    } catch (error) {
        console.error('❌ Error:', error.message);
        mongoose.disconnect();
    }
}

debugOrder();
