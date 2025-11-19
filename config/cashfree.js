import { Cashfree } from 'cashfree-pg';

let cashfreeInstance = null;

// Initialize Cashfree with settings from database
export const initializeCashfree = (appId, secretKey, environment = 'production') => {
    try {
        if (!appId || !secretKey) {
            console.warn('⚠️ Cashfree credentials not provided');
            cashfreeInstance = null;
            return null;
        }

        // For Cashfree SDK v5, we need to set credentials and return the Cashfree object
        // The SDK uses static properties that need to be set
        Cashfree.XClientId = appId;
        Cashfree.XClientSecret = secretKey;
        Cashfree.XEnvironment = (environment === 'sandbox' || environment === 'test') 
            ? Cashfree.Environment.SANDBOX 
            : Cashfree.Environment.PRODUCTION;
        
        // Return the Cashfree object with methods like PGCreateOrder
        cashfreeInstance = Cashfree;
        
        console.log(`✅ Cashfree initialized successfully (${environment} mode)`);
        console.log('📦 Cashfree methods available:', Object.getOwnPropertyNames(Cashfree));
        
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
