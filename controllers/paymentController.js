import crypto from 'crypto';
import razorpay from '../config/razorpay.js';
import { initializeCashfree, getCashfree } from '../config/cashfree.js';
import { Cashfree } from 'cashfree-pg';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { sendPaymentSuccessEmail, sendPDFReadyEmail } from '../utils/emailService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        
        console.log('💳 Converted payment settings:', JSON.stringify(settings, null, 2));
        return settings;
    } catch (error) {
        console.error('❌ Failed to load payment settings:', error.message);
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
        console.log('💳 Payment settings loaded:', JSON.stringify(paymentSettings, null, 2));
        
        const activeGateway = paymentSettings.activeGateway || 'razorpay';
        console.log('💳 Active gateway:', activeGateway);

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
            console.log('💳 Using Cashfree with settings:', paymentSettings.cashfree);
            return await createCashfreeOrderInternal(req, res, order, paymentSettings.cashfree || {});
        } else {
            console.log('💳 Using Razorpay with settings:', paymentSettings.razorpay);
            return await createRazorpayOrderInternal(req, res, order, paymentSettings.razorpay || {});
        }

    } catch (error) {
        console.error('Create payment order error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to create payment order',
            error: error.message 
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
            return res.status(503).json({ 
                status: 'error',
                message: 'Cashfree not configured. Please configure in Payment Settings.' 
            });
        }

        // Get user details
        const user = await User.findById(order.userId);

        // Check if we already have a Cashfree session for this order
        if (order.cashfreeSessionId) {
            console.log('♻️ Reusing existing Cashfree session:', order.cashfreeSessionId);
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

        // Prepare order data to pass in URL (lightweight, essential data only)
        const orderDataForUrl = {
            orderId: order.orderId,
            totalVoters: order.totalVoters,
            amount: order.amount,
            symbolName: order.customization?.symbolName || 'N/A',
            symbolNameMalayalam: order.customization?.symbolNameMalayalam || '',
            paymentStatus: order.paymentStatus
        };

        // Encode order data as URL parameter
        const encodedOrderData = encodeURIComponent(JSON.stringify(orderDataForUrl));

        // Create Cashfree order
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
                return_url: `${process.env.FRONTEND_URL || 'https://easyslip.in'}/order-success.html?orderId=${order.orderId}&orderData=${encodedOrderData}`,
                notify_url: `${process.env.BACKEND_URL || 'https://easyslip.in'}/api/payment/cashfree/webhook`
            }
        };

        console.log('📦 Creating Cashfree order:', cashfreeOrderId);

        // For Cashfree SDK v5+, call PGCreateOrder on the instance
        const response = await cashfree.PGCreateOrder(cashfreeOrderRequest);

        console.log('✅ Cashfree order created successfully');
        console.log('📄 Cashfree response:', JSON.stringify(response.data, null, 2));

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
        console.error('Create Cashfree order error:', error);
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
        console.error('Create Razorpay order error:', error);
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
        console.error('Create Razorpay order error:', error);
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
        await order.save();

        // Send payment success email
        const user = await User.findById(order.userId);
        if (user) {
            sendPaymentSuccessEmail(user, order).catch(err => {
                console.error('❌ Failed to send payment success email:', err.message);
            });
            
            // Check if PDF is already ready and send PDF ready email
            const permanentPdfPath = path.join(__dirname, '..', 'public', 'permanent-pdfs', `${order.orderId}.pdf`);
            if (fs.existsSync(permanentPdfPath)) {
                console.log(`✅ PDF already exists for ${order.orderId}, sending PDF ready email`);
                sendPDFReadyEmail(user, order).catch(err => {
                    console.error('❌ Failed to send PDF ready email:', err.message);
                });
            } else {
                console.log(`⏳ PDF not ready yet for ${order.orderId}, will send email when PDF generation completes`);
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
        console.error('Verify payment error:', error);
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
                await order.save();
                
                // Send PDF ready email if PDF exists
                const user = await User.findById(order.userId);
                if (user) {
                    const permanentPdfPath = path.join(__dirname, '..', 'public', 'permanent-pdfs', `${order.orderId}.pdf`);
                    if (fs.existsSync(permanentPdfPath)) {
                        console.log(`✅ [Webhook] PDF exists for ${order.orderId}, sending PDF ready email`);
                        sendPDFReadyEmail(user, order).catch(err => {
                            console.error('❌ Failed to send PDF ready email:', err.message);
                        });
                    } else {
                        console.log(`⏳ [Webhook] PDF not ready yet for ${order.orderId}`);
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
        console.error('Webhook error:', error);
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
        
        if (!data || !data.order) {
            return res.status(400).json({ 
                status: 'error',
                message: 'Invalid webhook payload' 
            });
        }

        const orderId = data.order.order_id;
        const orderStatus = data.order.order_status;

        const order = await Order.findOne({ orderId });
        
        if (!order) {
            console.log(`⚠️ Order not found for Cashfree webhook: ${orderId}`);
            return res.json({ status: 'success' }); // Return success to avoid retries
        }

        if (orderStatus === 'PAID' && order.paymentStatus !== 'completed') {
            // Payment successful
            order.paymentStatus = 'completed';
            order.cashfreePaymentId = data.payment?.cf_payment_id;
            order.paidAt = new Date();
            await order.save();

            console.log(`✅ [Cashfree Webhook] Payment completed for order: ${orderId}`);

            // Send payment success and PDF ready emails
            const user = await User.findById(order.userId);
            if (user) {
                sendPaymentSuccessEmail(user, order).catch(err => {
                    console.error('❌ Failed to send payment success email:', err.message);
                });

                // Check if PDF exists
                const permanentPdfPath = path.join(__dirname, '..', 'public', 'permanent-pdfs', `${order.orderId}.pdf`);
                if (fs.existsSync(permanentPdfPath)) {
                    console.log(`✅ [Cashfree Webhook] PDF exists, sending PDF ready email`);
                    sendPDFReadyEmail(user, order).catch(err => {
                        console.error('❌ Failed to send PDF ready email:', err.message);
                    });
                }
            }
        } else if (orderStatus === 'ACTIVE') {
            // Payment pending
            console.log(`⏳ [Cashfree Webhook] Payment pending for order: ${orderId}`);
        } else if (['EXPIRED', 'CANCELLED', 'FAILED'].includes(orderStatus)) {
            // Payment failed
            order.paymentStatus = 'failed';
            await order.save();
            console.log(`❌ [Cashfree Webhook] Payment failed for order: ${orderId}, status: ${orderStatus}`);
        }

        res.json({ status: 'success' });

    } catch (error) {
        console.error('Cashfree webhook error:', error);
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

        console.log('🔍 Fetching Cashfree payment status for:', order.cashfreeOrderId);

        // Fetch order status from Cashfree using the Cashfree order ID
        const response = await cashfree.PGOrderFetchPayments(order.cashfreeOrderId);
        
        console.log('📄 Cashfree payment response:', JSON.stringify(response.data, null, 2));
        
        const payments = response.data;
        
        if (payments && payments.length > 0) {
            const latestPayment = payments[0];
            
            if (latestPayment.payment_status === 'SUCCESS' && order.paymentStatus !== 'completed') {
                // Update order
                order.paymentStatus = 'completed';
                order.cashfreePaymentId = latestPayment.cf_payment_id;
                order.paidAt = new Date();
                await order.save();

                // Send emails
                const user = await User.findById(order.userId);
                if (user) {
                    sendPaymentSuccessEmail(user, order).catch(err => {
                        console.error('❌ Failed to send payment success email:', err.message);
                    });

                    const permanentPdfPath = path.join(__dirname, '..', 'public', 'permanent-pdfs', `${order.orderId}.pdf`);
                    if (fs.existsSync(permanentPdfPath)) {
                        sendPDFReadyEmail(user, order).catch(err => {
                            console.error('❌ Failed to send PDF ready email:', err.message);
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

        // Return current order status
        res.json({
            status: 'success',
            message: 'Payment status retrieved',
            order: {
                orderId: order.orderId,
                paymentStatus: order.paymentStatus
            }
        });

    } catch (error) {
        console.error('Verify Cashfree payment error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Payment verification failed',
            error: error.message 
        });
    }
};

