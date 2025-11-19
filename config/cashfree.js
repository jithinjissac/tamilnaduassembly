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

        // Map environment string to Cashfree enum
        let envMode;
        if (environment === 'sandbox' || environment === 'test') {
            envMode = Cashfree.Environment.SANDBOX;
        } else {
            envMode = Cashfree.Environment.PRODUCTION;
        }
        
        // Initialize with Cashfree v5+ constructor
        cashfreeInstance = new Cashfree({
            environment: envMode,
            appId: appId,
            secretKey: secretKey
        });
        
        console.log(`✅ Cashfree initialized successfully (${environment} mode, using ${environment === 'sandbox' ? 'sandbox' : 'production'} endpoint)`);
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
