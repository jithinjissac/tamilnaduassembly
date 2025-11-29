import crypto from 'crypto';

let payumoneyConfig = null;

/**
 * Initialize PayUMoney with settings from database
 * @param {string} merchantKey - PayUMoney Merchant Key
 * @param {string} merchantSalt - PayUMoney Merchant Salt
 * @param {string} environment - 'test' or 'production'
 * @returns {object} PayUMoney configuration object
 */
export const initializePayUMoney = (merchantKey, merchantSalt, environment = 'production') => {
    try {
        if (!merchantKey || !merchantSalt) {
            console.warn('⚠️ PayUMoney credentials not provided');
            payumoneyConfig = null;
            return null;
        }

        const baseUrl = environment === 'test' 
            ? 'https://test.payu.in' 
            : 'https://secure.payu.in';

        payumoneyConfig = {
            merchantKey,
            merchantSalt,
            environment,
            baseUrl,
            paymentUrl: `${baseUrl}/_payment`,
            verifyUrl: `${baseUrl}/merchant/postservice.php?form=2`
        };

        console.log(`✅ PayUMoney initialized successfully (${environment} mode)`);
        return payumoneyConfig;
    } catch (error) {
        console.error('❌ PayUMoney initialization failed:', error.message);
        payumoneyConfig = null;
        return null;
    }
};

/**
 * Get current PayUMoney configuration
 * @returns {object|null} PayUMoney configuration or null if not initialized
 */
export const getPayUMoney = () => {
    if (!payumoneyConfig) {
        console.warn('⚠️ PayUMoney not initialized. Call initializePayUMoney() first.');
    }
    return payumoneyConfig;
};

/**
 * Generate PayUMoney payment hash
 * @param {object} params - Payment parameters
 * @param {string} params.key - Merchant Key
 * @param {string} params.txnid - Transaction ID
 * @param {number} params.amount - Amount in rupees
 * @param {string} params.productinfo - Product information
 * @param {string} params.firstname - Customer first name
 * @param {string} params.email - Customer email
 * @param {string} params.phone - Customer phone (optional)
 * @param {string} params.surl - Success URL
 * @param {string} params.furl - Failure URL
 * @param {string} salt - Merchant Salt
 * @returns {string} SHA-512 hash
 */
export const generatePaymentHash = (params, salt) => {
    try {
        // Hash format: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT
        const hashString = `${params.key}|${params.txnid}|${params.amount}|${params.productinfo}|${params.firstname}|${params.email}|||||||||||${salt}`;
        
        const hash = crypto
            .createHash('sha512')
            .update(hashString)
            .digest('hex');

        console.log('✅ Payment hash generated for txnid:', params.txnid);
        return hash;
    } catch (error) {
        console.error('❌ Failed to generate payment hash:', error.message);
        throw error;
    }
};

/**
 * Verify PayUMoney payment response hash
 * @param {object} response - Payment response from PayUMoney
 * @param {string} salt - Merchant Salt
 * @returns {boolean} True if hash is valid
 */
export const verifyPaymentHash = (response, salt) => {
    try {
        const {
            status,
            txnid,
            amount,
            productinfo,
            firstname,
            email,
            hash: receivedHash
        } = response;

        // Reverse hash format for response: SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
        const hashString = `${salt}|${status}|||||||||||${email}|${firstname}|${productinfo}|${amount}|${txnid}|${response.key}`;
        
        const calculatedHash = crypto
            .createHash('sha512')
            .update(hashString)
            .digest('hex');

        const isValid = calculatedHash === receivedHash;
        
        if (isValid) {
            console.log('✅ Payment hash verified for txnid:', txnid);
        } else {
            console.error('❌ Payment hash verification failed for txnid:', txnid);
        }

        return isValid;
    } catch (error) {
        console.error('❌ Failed to verify payment hash:', error.message);
        return false;
    }
};

export default {
    initializePayUMoney,
    getPayUMoney,
    generatePaymentHash,
    verifyPaymentHash
};
