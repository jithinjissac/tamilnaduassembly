import { Cashfree } from 'cashfree-pg';
import { CFEnvironment } from 'cashfree-pg/dist/configuration';

let cashfreeInstance = null;

// Initialize Cashfree with settings from database
export const initializeCashfree = (appId, secretKey, environment = 'production') => {
    try {
        if (!appId || !secretKey) {
            console.warn('⚠️ Cashfree credentials not provided');
            cashfreeInstance = null;
            return null;
        }

        // For Cashfree SDK v5, set credentials and configuration
        Cashfree.XClientId = appId;
        Cashfree.XClientSecret = secretKey;
        Cashfree.XEnvironment = (environment === 'sandbox' || environment === 'test') 
            ? CFEnvironment.SANDBOX 
            : CFEnvironment.PRODUCTION;
        Cashfree.XApiVersion = '2025-01-01'; // Latest API version from SDK
        
        cashfreeInstance = Cashfree;
        
        console.log(`✅ Cashfree initialized successfully (${environment} mode, API version: 2025-01-01)`);
        
        return cashfreeInstance;
    } catch (error) {
        console.error('❌ Cashfree initialization failed:', error.message);
        console.error('Error stack:', error.stack);
        cashfreeInstance = null;
        return null;
    }
};

// Get current Cashfree instance
export const getCashfree = () => {
    return cashfreeInstance;
};

export default cashfreeInstance;
