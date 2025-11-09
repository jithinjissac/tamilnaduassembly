import Razorpay from 'razorpay';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Razorpay only if credentials are provided (not placeholders)
let razorpayInstance = null;

if (process.env.RAZORPAY_KEY_ID && 
    process.env.RAZORPAY_KEY_SECRET && 
    !process.env.RAZORPAY_KEY_ID.includes('your_') && 
    !process.env.RAZORPAY_KEY_SECRET.includes('your_')) {
    
    try {
        razorpayInstance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
        console.log('✅ Razorpay initialized successfully');
    } catch (error) {
        console.warn('⚠️ Razorpay initialization failed:', error.message);
    }
} else {
    console.warn('⚠️ Razorpay not initialized - using placeholder credentials. Update .env with real keys from https://dashboard.razorpay.com/app/keys');
}

export default razorpayInstance;
