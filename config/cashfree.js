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

        // Set global Cashfree credentials
        Cashfree.XClientId = appId;
        Cashfree.XClientSecret = secretKey;
        // Use string values for environment - 'SANDBOX' or 'PRODUCTION'
        Cashfree.XEnvironment = (environment === 'sandbox' || environment === 'test') 
            ? 'SANDBOX' 
            : 'PRODUCTION';
        
        cashfreeInstance = Cashfree;
        
        console.log(`✅ Cashfree initialized successfully (${environment} mode, XEnvironment: ${Cashfree.XEnvironment})`);
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
