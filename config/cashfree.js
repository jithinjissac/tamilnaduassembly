import { Cashfree } from 'cashfree-pg';
import { CFEnvironment } from 'cashfree-pg/dist/configuration.js';

let cashfreeInstance = null;

// Initialize Cashfree with settings from database
export const initializeCashfree = (appId, secretKey, environment = 'production') => {
    try {
        if (!appId || !secretKey) {
            console.warn('⚠️ Cashfree credentials not provided');
            cashfreeInstance = null;
            return null;
        }

        // For Cashfree SDK v5, constructor takes positional parameters
        const cfEnvironment = (environment === 'sandbox' || environment === 'test') 
            ? CFEnvironment.SANDBOX 
            : CFEnvironment.PRODUCTION;
        
        // Create new Cashfree instance with positional parameters
        // constructor(XEnvironment, XClientId, XClientSecret, XPartnerKey, XClientSignature, XPartnerMerchantId, XEnableErrorAnalytics, axios)
        cashfreeInstance = new Cashfree(
            cfEnvironment,  // XEnvironment
            appId,          // XClientId
            secretKey       // XClientSecret
        );
        
        console.log(`✅ Cashfree initialized successfully (${environment} mode, env value: ${cfEnvironment})`);
        
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
