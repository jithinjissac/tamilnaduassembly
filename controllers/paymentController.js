import crypto from 'crypto';
import razorpay from '../config/razorpay.js';
import { initializeCashfree, getCashfree } from '../config/cashfree.js';
import { initializePayUMoney, getPayUMoney, generatePaymentHash, verifyPaymentHash } from '../config/payumoney.js';
import { Cashfree } from 'cashfree-pg';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { sendPaymentSuccessEmail, sendPDFReadyEmail } from '../utils/emailService.js';
import { createLogger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('Payment');

// Get active payment gateway settings
async function getPaymentSettings() {
    try {
        const settingsMap = await Settings.getSettings('payment');
        // Convert Map to plain object, handling nested Maps
        const settings = {};
        
        for (const [key, value] of settingsMap) {
            if (value instanceof Map) {
                settings[key] = Object.fromEntries(value);
            } else if (typeof value === 'object' && value !== null) {
                settings[key] = value;
            } else {
                settings[key] = value;
            }
        }
        
        logger.debug('Payment settings loaded');
        return settings;
    } catch (error) {
        logger.error('Failed to load payment settings:', error.message);
        // Return defaults if settings not found
        return {
            activeGateway: 'razorpay',
            razorpay: {
                enabled: true,
                keyId: process.env.RAZORPAY_KEY_ID || '',
                keySecret: process.env.RAZORPAY_KEY_SECRET || ''
            },
            cashfree: {
                enabled: false,
                appId: process.env.CASHFREE_APP_ID || '',
                secretKey: process.env.CASHFREE_SECRET_KEY || '',
                environment: process.env.CASHFREE_ENV || 'production'
            },
            payumoney: {
                enabled: false,
                merchantKey: process.env.PAYUMONEY_MERCHANT_KEY || '',
                merchantSalt: process.env.PAYUMONEY_MERCHANT_SALT || '',
                environment: process.env.PAYUMONEY_ENV || 'production'
            }
        };
    }
}

// Create payment order (supports both Razorpay and Cashfree)
export const createPaymentOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const userId = req.userId;

        // Get payment settings
        const paymentSettings = await getPaymentSettings();
        const activeGateway = paymentSettings.activeGateway || 'razorpay';
        logger.debug('Active gateway:', activeGateway);

        // Find order
        const order = await Order.findOne({ orderId, userId });

        if (!order) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Order not found' 
            });
        }

        if (order.paymentStatus === 'completed') {
            return res.status(400).json({ 
                status: 'error',
                message: 'Order already paid' 
            });
        }

        // Route to appropriate gateway
        if (activeGateway === 'cashfree') {
            return await createCashfreeOrderInternal(req, res, order, paymentSettings.cashfree || {});
        } else if (activeGateway === 'payumoney') {
            return await createPayUMoneyOrderInternal(req, res, order, paymentSettings.payumoney || {});
        } else {
            return await createRazorpayOrderInternal(req, res, order, paymentSettings.razorpay || {});
        }

    } catch (error) {
        logger.error('Create payment order error:', error.message || error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to create payment order',
            error: error.message || String(error)
        });
    }
};

// Internal function for Cashfree order creation
async function createCashfreeOrderInternal(req, res, order, cashfreeSettings) {
    try {

        // Initialize Cashfree with current settings
        const cashfree = initializeCashfree(
            cashfreeSettings.appId,
            cashfreeSettings.secretKey,
            cashfreeSettings.environment
        );

        if (!cashfree) {
            logger.error('Cashfree initialization failed - missing credentials');
            return res.status(503).json({ 
                status: 'error',
                message: 'Cashfree not configured. Please configure in Payment Settings.' 
            });
        }

        // Get user details
        const user = await User.findById(order.userId);

        // Check if we already have a Cashfree session for this order
        if (order.cashfreeSessionId) {
            logger.debug('Reusing existing Cashfree session:', order.cashfreeSessionId);
            return res.json({
                status: 'success',
                gateway: 'cashfree',
                sessionId: order.cashfreeSessionId,
                orderId: order.orderId,
                amount: order.amount,
                environment: cashfreeSettings.environment
            });
        }

        // Create unique Cashfree order ID (append timestamp to avoid conflicts)
        const cashfreeOrderId = `${order.orderId}-${Date.now()}`;

        // Create Cashfree order with minimal return URL (max 500 chars)
        // Order details will be fetched from database on success page
        const cashfreeOrderRequest = {
            order_id: cashfreeOrderId,
            order_amount: order.amount,
            order_currency: 'INR',
            customer_details: {
                customer_id: order.userId.toString(),
                customer_name: user.name,
                customer_email: user.email,
                customer_phone: user.phone || '9999999999'
            },
            order_meta: {
                return_url: `${process.env.FRONTEND_URL || 'https://easyslip.in'}/order-success.html?orderId=${order.orderId}`,
                notify_url: `${process.env.BACKEND_URL || 'https://easyslip.in'}/api/payment/cashfree/webhook`
            }
        };

        logger.debug('Creating Cashfree order:', cashfreeOrderId);

        // For Cashfree SDK v5+, call PGCreateOrder (API version is set in Cashfree.XApiVersion)
        const response = await cashfree.PGCreateOrder(cashfreeOrderRequest);

        logger.info('Cashfree order created:', order.orderId);

        // Update order with Cashfree session ID
        order.cashfreeOrderId = cashfreeOrderId;
        order.cashfreeSessionId = response.data.payment_session_id;
        await order.save();

        res.json({
            status: 'success',
            gateway: 'cashfree',
            sessionId: response.data.payment_session_id,
            orderId: order.orderId,
            amount: order.amount,
            environment: cashfreeSettings.environment,
            paymentUrl: response.data.payment_link || null
        });

    } catch (error) {
        logger.error('Create Cashfree order error:', error.message || error);
        if (error.response) {
            logger.error('Cashfree API Response:', JSON.stringify({
                status: error.response.status,
                data: error.response.data,
                headers: error.response.headers
            }));
        }
        throw error;
    }
}

// Internal function for Razorpay order creation
async function createRazorpayOrderInternal(req, res, order, razorpaySettings) {
    try {
        // Check if Razorpay is initialized with settings
        if (!razorpaySettings.keyId || !razorpaySettings.keySecret) {
            return res.status(503).json({ 
                status: 'error',
                message: 'Razorpay not configured. Please configure in Payment Settings.' 
            });
        }

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(order.amount * 100), // Amount in paise
            currency: 'INR',
            receipt: order.orderId,
            notes: {
                orderId: order.orderId,
                userId: order.userId.toString()
            }
        });

        // Update order with Razorpay order ID
        order.razorpayOrderId = razorpayOrder.id;
        await order.save();

        res.json({
            status: 'success',
            gateway: 'razorpay',
            razorpayOrder: {
                id: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency
            },
            orderId: order.orderId,
            key: razorpaySettings.keyId
        });

    } catch (error) {
        logger.error('Create Razorpay order error:', error.message || error);
        throw error;
    }
}

// Internal function for PayUMoney order creation
async function createPayUMoneyOrderInternal(req, res, order, payumoneySettings) {
    try {
        // Check if PayUMoney is configured
        if (!payumoneySettings.merchantKey || !payumoneySettings.merchantSalt) {
            return res.status(503).json({ 
                status: 'error',
                message: 'PayUMoney not configured. Please configure in Payment Settings.' 
            });
        }

        // Initialize PayUMoney
        initializePayUMoney(
            payumoneySettings.merchantKey,
            payumoneySettings.merchantSalt,
            payumoneySettings.environment
        );

        // Get user details
        const user = await User.findById(order.userId);

        // Generate unique transaction ID (txnid)
        const txnid = `${order.orderId}_${Date.now()}`;

        // Determine PayUMoney payment URL based on environment
        const paymentUrl = payumoneySettings.environment === 'test' 
            ? 'https://test.payu.in/_payment'
            : 'https://secure.payu.in/_payment';

        // Build payment parameters
        const paymentParams = {
            key: payumoneySettings.merchantKey,
            txnid: txnid,
            amount: order.amount.toFixed(2),
            productinfo: `Voter Slip Order - ${order.orderId}`,
            firstname: user.name.split(' ')[0] || user.name,
            email: user.email,
            phone: user.phone || '9999999999',
            surl: `${process.env.BACKEND_URL || 'https://easyslip.in'}/api/payment/payumoney/success`,
            furl: `${process.env.BACKEND_URL || 'https://easyslip.in'}/api/payment/payumoney/failure`,
            service_provider: 'payu_paisa',
            udf1: order.orderId, // Store our internal order ID
            udf2: '',
            udf3: '',
            udf4: '',
            udf5: ''
        };

        // Generate payment hash
        const hash = generatePaymentHash(paymentParams, payumoneySettings.merchantSalt);
        paymentParams.hash = hash;

        // Update order with PayUMoney transaction ID
        order.payumoneyTxnId = txnid;
        await order.save();

        logger.info('PayUMoney order created:', order.orderId);

        res.json({
            status: 'success',
            gateway: 'payumoney',
            paymentUrl: paymentUrl,
            params: paymentParams,
            orderId: order.orderId,
            amount: order.amount
        });

    } catch (error) {
        logger.error('Create PayUMoney order error:', error.message || error);
        throw error;
    }
}

// Create Razorpay order (legacy endpoint - kept for backward compatibility)
export const createRazorpayOrder = async (req, res) => {
    try {
        // Check if Razorpay is initialized
        if (!razorpay) {
            return res.status(503).json({ 
                status: 'error',
                message: 'Payment gateway not configured. Please add Razorpay credentials in .env file.' 
            });
        }

        const { orderId } = req.body;
        const userId = req.userId;

        // Find order
        const order = await Order.findOne({ orderId, userId });

        if (!order) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Order not found' 
            });
        }

        if (order.paymentStatus === 'completed') {
            return res.status(400).json({ 
                status: 'error',
                message: 'Order already paid' 
            });
        }

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(order.amount * 100), // Amount in paise
            currency: 'INR',
            receipt: order.orderId,
            notes: {
                orderId: order.orderId,
                userId: userId.toString()
            }
        });

        // Update order with Razorpay order ID
        order.razorpayOrderId = razorpayOrder.id;
        await order.save();

        res.json({
            status: 'success',
            razorpayOrder: {
                id: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency
            },
            orderId: order.orderId,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        logger.error('Create Razorpay order error:', error.message);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to create payment order',
            error: error.message 
        });
    }
};

// Verify Razorpay payment
export const verifyPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderId
        } = req.body;

        const userId = req.userId;

        // Find order
        const order = await Order.findOne({ orderId, userId });

        if (!order) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Order not found' 
            });
        }

        // Check if already paid - prevent duplicate payment verification
        if (order.paymentStatus === 'completed') {
            logger.warn(`⚠️ Duplicate payment verification attempt for order ${orderId}`);
            return res.status(400).json({ 
                status: 'error',
                message: 'Payment already verified for this order' 
            });
        }

        // Verify signature
        const sign = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest('hex');

        if (razorpay_signature !== expectedSign) {
            return res.status(400).json({ 
                status: 'error',
                message: 'Invalid payment signature' 
            });
        }

        // Update order
        order.paymentStatus = 'completed';
        order.razorpayPaymentId = razorpay_payment_id;
        order.razorpaySignature = razorpay_signature;
        order.paidAt = new Date();
        
        try {
            await order.save();
            logger.info(`✅ Payment verified for order ${order.orderId} (symbolFree: ${order.customization?.symbolFree})`);
        } catch (saveError) {
            logger.error(`❌ Failed to save order ${order.orderId} after payment:`, saveError);
            throw saveError;
        }

        // Send payment success email
        const user = await User.findById(order.userId);
        if (user) {
                sendPaymentSuccessEmail(user, order).catch(err => {
                logger.error('Failed to send payment success email:', err.message);
            });
            
            // Check if PDF is already ready and send PDF ready email
            const permanentPdfPath = path.join(__dirname, '..', 'public', 'permanent-pdfs', `${order.orderId}.pdf`);
            if (fs.existsSync(permanentPdfPath)) {
                sendPDFReadyEmail(user, order).catch(err => {
                    logger.error('Failed to send PDF ready email:', err.message);
                });
            }
        }

        res.json({
            status: 'success',
            message: 'Payment verified successfully',
            order: {
                orderId: order.orderId,
                customization: order.customization,
                totalVoters: order.totalVoters,
                amount: order.amount,
                paymentStatus: order.paymentStatus,
                razorpayPaymentId: order.razorpayPaymentId,
                paidAt: order.paidAt
            }
        });

    } catch (error) {
        logger.error('Verify payment error:', error.message);
        res.status(500).json({ 
            status: 'error',
            message: 'Payment verification failed',
            error: error.message 
        });
    }
};

// Razorpay webhook
export const webhook = async (req, res) => {
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const webhookSignature = req.headers['x-razorpay-signature'];

        // Verify webhook signature
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (webhookSignature !== expectedSignature) {
            return res.status(400).json({ 
                status: 'error',
                message: 'Invalid webhook signature' 
            });
        }

        const event = req.body.event;
        const payload = req.body.payload.payment.entity;

        if (event === 'payment.captured') {
            // Payment successful
            const orderId = payload.notes.orderId;
            
            const order = await Order.findOne({ orderId });
            if (order && order.paymentStatus !== 'completed') {
                order.paymentStatus = 'completed';
                order.razorpayPaymentId = payload.id;
                order.paidAt = new Date();
                
                try {
                    await order.save();
                    logger.info(`✅ Webhook: Payment captured for order ${order.orderId} (symbolFree: ${order.customization?.symbolFree})`);
                } catch (saveError) {
                    logger.error(`❌ Webhook: Failed to save order ${order.orderId}:`, saveError);
                    throw saveError;
                }
                
                // Send PDF ready email if PDF exists
                const user = await User.findById(order.userId);
                if (user) {
                    const permanentPdfPath = path.join(__dirname, '..', 'public', 'permanent-pdfs', `${order.orderId}.pdf`);
                    if (fs.existsSync(permanentPdfPath)) {
                        sendPDFReadyEmail(user, order).catch(err => {
                            logger.error('Failed to send PDF ready email:', err.message);
                        });
                    }
                }
            }
        } else if (event === 'payment.failed') {
            // Payment failed
            const orderId = payload.notes.orderId;
            
            const order = await Order.findOne({ orderId });
            if (order) {
                order.paymentStatus = 'failed';
                await order.save();
            }
        }

        res.json({ status: 'success' });

    } catch (error) {
        logger.error('Webhook error:', error.message);
        res.status(500).json({ 
            status: 'error',
            message: 'Webhook processing failed',
            error: error.message 
        });
    }
};

// Cashfree webhook
export const cashfreeWebhook = async (req, res) => {
    try {
        const { data } = req.body;
        
        // Log the full webhook payload for debugging
        logger.debug('Cashfree webhook received:', JSON.stringify(req.body));
        
        if (!data || !data.order) {
            logger.warn('Invalid Cashfree webhook payload - missing data.order');
            return res.status(400).json({ 
                status: 'error',
                message: 'Invalid webhook payload' 
            });
        }

        const cashfreeOrderId = data.order.order_id;
        const orderStatus = data.order.order_status;
        
        logger.debug(`Cashfree webhook: order_id=${cashfreeOrderId}, status=${orderStatus}`);

        // Try to find order by Cashfree order ID first, then by our order ID
        let order = await Order.findOne({ cashfreeOrderId: cashfreeOrderId });
        
        if (!order) {
            // Fallback: try using cashfreeOrderId as our orderId (legacy)
            order = await Order.findOne({ orderId: cashfreeOrderId });
        }
        
        if (!order) {
            logger.warn(`Order not found for Cashfree webhook. Cashfree order_id: ${cashfreeOrderId}`);
            return res.json({ status: 'success' }); // Return success to avoid retries
        }
        
        logger.debug(`Found order: ${order.orderId} (payment status: ${order.paymentStatus})`);

        if (orderStatus === 'PAID' && order.paymentStatus !== 'completed') {
            // Payment successful
            order.paymentStatus = 'completed';
            order.cashfreePaymentId = data.payment?.cf_payment_id;
            order.paidAt = new Date();
            await order.save();

            logger.info('Payment completed:', orderId);

            // Send payment success and PDF ready emails
            const user = await User.findById(order.userId);
            if (user) {
                sendPaymentSuccessEmail(user, order).catch(err => {
                    logger.error('Failed to send payment success email:', err.message);
                });

                // Check if PDF exists
                const permanentPdfPath = path.join(__dirname, '..', 'public', 'permanent-pdfs', `${order.orderId}.pdf`);
                if (fs.existsSync(permanentPdfPath)) {
                    sendPDFReadyEmail(user, order).catch(err => {
                        logger.error('Failed to send PDF ready email:', err.message);
                    });
                }
            }
        } else if (orderStatus === 'ACTIVE') {
            logger.debug('Payment pending:', orderId);
        } else if (['EXPIRED', 'CANCELLED', 'FAILED'].includes(orderStatus)) {
            // Payment failed
            order.paymentStatus = 'failed';
            await order.save();
            logger.warn('Payment failed:', orderId, 'status:', orderStatus);
        }

        res.json({ status: 'success' });

    } catch (error) {
        logger.error('Cashfree webhook error:', error.message);
        res.status(500).json({ 
            status: 'error',
            message: 'Webhook processing failed',
            error: error.message 
        });
    }
};

// Verify Cashfree payment
export const verifyCashfreePayment = async (req, res) => {
    try {
        const { orderId } = req.body;
        const userId = req.userId;

        // Find order
        const order = await Order.findOne({ orderId, userId });

        if (!order) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Order not found' 
            });
        }

        // Check if already paid - prevent duplicate payment verification
        if (order.paymentStatus === 'completed') {
            logger.warn(`⚠️ Duplicate Cashfree payment verification attempt for order ${orderId}`);
            return res.status(400).json({ 
                status: 'error',
                message: 'Payment already verified for this order' 
            });
        }

        // Get payment settings
        const paymentSettings = await getPaymentSettings();
        const cashfreeSettings = paymentSettings.cashfree;

        // Initialize Cashfree
        const cashfree = initializeCashfree(
            cashfreeSettings.appId,
            cashfreeSettings.secretKey,
            cashfreeSettings.environment
        );

        if (!cashfree) {
            return res.status(503).json({ 
                status: 'error',
                message: 'Cashfree not configured' 
            });
        }

        // Check if order has Cashfree order ID
        if (!order.cashfreeOrderId) {
            return res.status(400).json({ 
                status: 'error',
                message: 'Order was not created with Cashfree' 
            });
        }

        logger.debug('Fetching Cashfree payment status for:', order.cashfreeOrderId);

        // Fetch order status from Cashfree using the Cashfree order ID
        const response = await cashfree.PGOrderFetchPayments(order.cashfreeOrderId);
        
        logger.debug('Cashfree payment response received');
        
        const payments = response.data;
        
        if (payments && payments.length > 0) {
            const latestPayment = payments[0];
            
            if (latestPayment.payment_status === 'SUCCESS' && order.paymentStatus !== 'completed') {
                // Update order
                order.paymentStatus = 'completed';
                order.cashfreePaymentId = latestPayment.cf_payment_id;
                order.paidAt = new Date();
                
                try {
                    await order.save();
                    logger.info(`✅ Cashfree payment verified for order ${order.orderId} (symbolFree: ${order.customization?.symbolFree})`);
                } catch (saveError) {
                    logger.error(`❌ Failed to save order ${order.orderId} after Cashfree payment:`, saveError);
                    throw saveError;
                }

                // Send emails
                const user = await User.findById(order.userId);
                if (user) {
                    sendPaymentSuccessEmail(user, order).catch(err => {
                        logger.error('Failed to send payment success email:', err.message);
                    });

                    const permanentPdfPath = path.join(__dirname, '..', 'public', 'permanent-pdfs', `${order.orderId}.pdf`);
                    if (fs.existsSync(permanentPdfPath)) {
                        sendPDFReadyEmail(user, order).catch(err => {
                            logger.error('Failed to send PDF ready email:', err.message);
                        });
                    }
                }

                return res.json({
                    status: 'success',
                    message: 'Payment verified successfully',
                    order: {
                        orderId: order.orderId,
                        customization: order.customization,
                        totalVoters: order.totalVoters,
                        amount: order.amount,
                        paymentStatus: order.paymentStatus,
                        cashfreePaymentId: order.cashfreePaymentId,
                        paidAt: order.paidAt
                    }
                });
            }
        }

        // Return current order status with clear indication if payment is not completed
        const isCompleted = order.paymentStatus === 'completed';
        res.json({
            status: isCompleted ? 'success' : 'pending',
            message: isCompleted ? 'Payment completed' : 'Payment not completed yet',
            order: {
                orderId: order.orderId,
                paymentStatus: order.paymentStatus,
                cashfreePaymentId: order.cashfreePaymentId
            }
        });

    } catch (error) {
        logger.error('Verify Cashfree payment error:', error.message);
        res.status(500).json({ 
            status: 'error',
            message: 'Payment verification failed',
            error: error.message 
        });
    }
};

// PayUMoney Success Callback
export const handlePayUMoneySuccess = async (req, res) => {
    try {
        const paymentResponse = req.body;
        
        logger.debug('PayUMoney success callback received:', paymentResponse.txnid);

        // Get payment settings to retrieve merchant salt
        const paymentSettings = await getPaymentSettings();
        const payumoneySettings = paymentSettings.payumoney;

        if (!payumoneySettings || !payumoneySettings.merchantSalt) {
            logger.error('PayUMoney settings not found for verification');
            return res.redirect(`${process.env.FRONTEND_URL}/payment-failed.html?reason=config_error`);
        }

        // Verify payment hash
        const isValid = verifyPaymentHash(paymentResponse, payumoneySettings.merchantSalt);

        if (!isValid) {
            logger.error('PayUMoney payment hash verification failed:', paymentResponse.txnid);
            return res.redirect(`${process.env.FRONTEND_URL}/payment-failed.html?reason=invalid_hash`);
        }

        // Extract our internal order ID from udf1
        const orderId = paymentResponse.udf1;
        
        if (!orderId) {
            logger.error('Order ID not found in PayUMoney response');
            return res.redirect(`${process.env.FRONTEND_URL}/payment-failed.html?reason=missing_order`);
        }

        // Find order
        const order = await Order.findOne({ orderId });

        if (!order) {
            logger.error('Order not found:', orderId);
            return res.redirect(`${process.env.FRONTEND_URL}/payment-failed.html?orderId=${orderId}`);
        }

        // Check if already paid - prevent duplicate payment processing
        if (order.paymentStatus === 'completed') {
            logger.warn(`⚠️ Duplicate PayUMoney payment attempt for order ${orderId}`);
            return res.redirect(`${process.env.FRONTEND_URL}/order-success.html?orderId=${orderId}`);
        }

        // Check if payment was successful
        if (paymentResponse.status === 'success' && order.paymentStatus !== 'completed') {
            // Update order
            order.paymentStatus = 'completed';
            order.payumoneyPaymentId = paymentResponse.mihpayid;
            order.payumoneyTxnId = paymentResponse.txnid;
            order.paidAt = new Date();
            
            try {
                await order.save();
                logger.info(`✅ PayUMoney payment completed for order ${order.orderId}`);
            } catch (saveError) {
                logger.error(`❌ Failed to save order ${order.orderId} after PayUMoney payment:`, saveError);
                throw saveError;
            }

            // Send emails
            const user = await User.findById(order.userId);
            if (user) {
                sendPaymentSuccessEmail(user, order).catch(err => {
                    logger.error('Failed to send payment success email:', err.message);
                });

                const permanentPdfPath = path.join(__dirname, '..', 'public', 'permanent-pdfs', `${order.orderId}.pdf`);
                if (fs.existsSync(permanentPdfPath)) {
                    sendPDFReadyEmail(user, order).catch(err => {
                        logger.error('Failed to send PDF ready email:', err.message);
                    });
                }
            }

            // Redirect to success page
            return res.redirect(`${process.env.FRONTEND_URL}/order-success.html?orderId=${orderId}`);
        }

        // Payment already processed or failed
        return res.redirect(`${process.env.FRONTEND_URL}/order-success.html?orderId=${orderId}`);

    } catch (error) {
        logger.error('PayUMoney success callback error:', error.message);
        res.redirect(`${process.env.FRONTEND_URL}/payment-failed.html?reason=server_error`);
    }
};

// PayUMoney Failure Callback
export const handlePayUMoneyFailure = async (req, res) => {
    try {
        const paymentResponse = req.body;
        
        logger.warn('PayUMoney payment failed:', paymentResponse.txnid, 'reason:', paymentResponse.error_Message);

        // Extract our internal order ID from udf1
        const orderId = paymentResponse.udf1;

        if (orderId) {
            // Update order status
            const order = await Order.findOne({ orderId });
            if (order) {
                order.paymentStatus = 'failed';
                await order.save();
                logger.info('Order marked as failed:', orderId);
            }
        }

        // Redirect to failure page
        res.redirect(`${process.env.FRONTEND_URL}/payment-failed.html?orderId=${orderId || 'unknown'}&reason=${encodeURIComponent(paymentResponse.error_Message || 'payment_failed')}`);

    } catch (error) {
        logger.error('PayUMoney failure callback error:', error.message);
        res.redirect(`${process.env.FRONTEND_URL}/payment-failed.html?reason=server_error`);
    }
};

