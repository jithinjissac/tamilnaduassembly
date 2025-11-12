import { Cashfree } from 'cashfree-pg';
import dotenv from 'dotenv';

dotenv.config();

let cashfree = null;

try {
    // Initialize Cashfree based on environment
    const environment = process.env.CASHFREE_ENVIRONMENT || 'TEST';
    
    if (process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY) {
        Cashfree.XClientId = process.env.CASHFREE_APP_ID;
        Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
        Cashfree.XEnvironment = environment === 'PROD' 
            ? Cashfree.Environment.PRODUCTION 
            : Cashfree.Environment.SANDBOX;
        
        cashfree = Cashfree;
        console.log(`✅ Cashfree initialized successfully (${environment} mode)`);
    } else {
        console.log('⚠️ Cashfree credentials not found in .env file');
    }
} catch (error) {
    console.error('❌ Cashfree initialization failed:', error.message);
}

export default cashfree;
