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

        // For Cashfree SDK v5, set credentials directly
        Cashfree.XClientId = appId;
        Cashfree.XClientSecret = secretKey;
        // Use lowercase string values: 'sandbox' or 'production'
        Cashfree.XEnvironment = (environment === 'sandbox' || environment === 'test') 
            ? 'sandbox' 
            : 'production';
        
        cashfreeInstance = Cashfree;
        
        console.log(`✅ Cashfree initialized successfully (${Cashfree.XEnvironment} mode)`);
        
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
