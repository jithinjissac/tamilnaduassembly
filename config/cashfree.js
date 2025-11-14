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

        // For Cashfree SDK v5+, we need to instantiate the class
        const envMode = environment === 'sandbox' ? Cashfree.SANDBOX : Cashfree.PRODUCTION;
        cashfreeInstance = new Cashfree(envMode, appId, secretKey);
        
        console.log(`✅ Cashfree initialized successfully (${environment})`);
        return cashfreeInstance;
    } catch (error) {
        console.error('❌ Cashfree initialization failed:', error.message);
        cashfreeInstance = null;
        return null;
    }
};

// Get current Cashfree instance
export const getCashfree = () => {
    return cashfreeInstance;
};

export default cashfreeInstance;
