import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

async function checkCustomPosters() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');
        
        const Order = mongoose.connection.db.collection('orders');
        
        // Find orders with custom posters
        const customPosterOrders = await Order.find({ 
            'customization.isCustomPoster': true 
        }).project({ 
            orderId: 1, 
            'customization.isCustomPoster': 1,
            'customization.symbolImage': 1,
            createdAt: 1,
            userId: 1
        }).limit(10).toArray();
        
        console.log('\n📊 Custom Poster Orders Found:', customPosterOrders.length);
        
        if (customPosterOrders.length > 0) {
            customPosterOrders.forEach((order, idx) => {
                const imagePreview = order.customization?.symbolImage 
                    ? order.customization.symbolImage.substring(0, 50) + '...' 
                    : 'No image';
                const imageSize = order.customization?.symbolImage 
                    ? `${(order.customization.symbolImage.length / 1024).toFixed(0)} KB`
                    : 'N/A';
                
                console.log(`\n${idx + 1}. Order: ${order.orderId}`);
                console.log(`   Created: ${order.createdAt}`);
                console.log(`   Image Size: ${imageSize}`);
                console.log(`   Image Preview: ${imagePreview}`);
            });
        } else {
            console.log('\n❌ No custom poster orders found');
        }
        
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkCustomPosters();
