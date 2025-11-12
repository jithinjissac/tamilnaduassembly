import crypto from 'crypto';
import razorpay from '../config/razorpay.js';
import cashfree from '../config/cashfree.js';
import { Cashfree } from 'cashfree-pg';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { sendPaymentSuccessEmail } from '../utils/emailService.js';

// Get active payment gateway from settings
async function getActiveGateway() {
    try {
        const paymentSettings = await Settings.getSettings('payment');
        return paymentSettings?.activeGateway || 'razorpay';
    } catch (error) {
        console.error('Error fetching payment settings:', error);
        return 'razorpay'; // Default fallback
    }
}

// Create Razorpay order
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
        order.paymentGateway = 'razorpay';
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

// Create Cashfree order
export const createCashfreeOrder = async (req, res) => {
    try {
        // Check if Cashfree is initialized
        if (!cashfree) {
            return res.status(503).json({ 
                status: 'error',
                message: 'Cashfree not configured. Please add Cashfree credentials in .env file.' 
            });
        }

        const { orderId } = req.body;
        const userId = req.userId;

        // Find order and user
        const order = await Order.findOne({ orderId, userId });
        const user = await User.findById(userId);

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

        // Create Cashfree order
        const request = {
            order_amount: order.amount,
            order_currency: 'INR',
            order_id: order.orderId,
            customer_details: {
                customer_id: userId.toString(),
                customer_email: user.email,
                customer_phone: user.phone || '9999999999',
                customer_name: user.name || 'Customer'
            },
            order_meta: {
                return_url: `${process.env.BASE_URL}/api/payment/cashfree/callback?order_id=${order.orderId}`,
                notify_url: `${process.env.BASE_URL}/api/payment/cashfree/webhook`
            },
            order_note: `Payment for voter slips - ${order.orderId}`
        };

        const response = await Cashfree.PGCreateOrder('2023-08-01', request);
        
        // Update order with Cashfree session ID
        order.cashfreeSessionId = response.data.payment_session_id;
        order.paymentGateway = 'cashfree';
        await order.save();

        res.json({
            status: 'success',
            gateway: 'cashfree',
            cashfreeOrder: {
                sessionId: response.data.payment_session_id,
                orderId: order.orderId,
                amount: order.amount
            },
            paymentUrl: response.data.payment_link
        });

    } catch (error) {
        console.error('Create Cashfree order error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to create payment order',
            error: error.message 
        });
    }
};

// Unified create payment order (auto-selects gateway)
export const createPaymentOrder = async (req, res) => {
    try {
        const activeGateway = await getActiveGateway();
        
        if (activeGateway === 'cashfree') {
            return createCashfreeOrder(req, res);
        } else {
            return createRazorpayOrder(req, res);
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
        order.paymentGateway = 'razorpay';
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

        // Verify payment status with Cashfree
        const response = await Cashfree.PGOrderFetchPayments('2023-08-01', orderId);
        
        if (response.data && response.data.length > 0) {
            const payment = response.data[0];
            
            if (payment.payment_status === 'SUCCESS') {
                // Update order
                order.paymentStatus = 'completed';
                order.paymentGateway = 'cashfree';
                order.cashfreePaymentId = payment.cf_payment_id;
                order.paidAt = new Date();
                await order.save();

                // Send payment success email
                const user = await User.findById(order.userId);
                if (user) {
                    sendPaymentSuccessEmail(user, order).catch(err => {
                        console.error('❌ Failed to send payment success email:', err.message);
                    });
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
                        cashfreePaymentId: order.cashfreePaymentId,
                        paidAt: order.paidAt
                    }
                });
            } else {
                res.status(400).json({
                    status: 'error',
                    message: 'Payment not successful',
                    paymentStatus: payment.payment_status
                });
            }
        } else {
            res.status(404).json({
                status: 'error',
                message: 'Payment not found'
            });
        }

    } catch (error) {
        console.error('Verify Cashfree payment error:', error);
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
                order.paymentGateway = 'razorpay';
                order.razorpayPaymentId = payload.id;
                order.paidAt = new Date();
                await order.save();
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
        
        if (!data) {
            return res.status(400).json({ 
                status: 'error',
                message: 'Invalid webhook payload' 
            });
        }

        const { order } = data;
        
        if (order.order_status === 'PAID') {
            // Payment successful
            const dbOrder = await Order.findOne({ orderId: order.order_id });
            
            if (dbOrder && dbOrder.paymentStatus !== 'completed') {
                dbOrder.paymentStatus = 'completed';
                dbOrder.paymentGateway = 'cashfree';
                dbOrder.cashfreePaymentId = data.payment.cf_payment_id;
                dbOrder.paidAt = new Date();
                await dbOrder.save();
            }
        } else if (order.order_status === 'ACTIVE') {
            // Payment pending
            const dbOrder = await Order.findOne({ orderId: order.order_id });
            if (dbOrder) {
                dbOrder.paymentStatus = 'pending';
                await dbOrder.save();
            }
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

// Cashfree payment callback (return URL)
export const cashfreeCallback = async (req, res) => {
    try {
        const { order_id } = req.query;
        
        if (!order_id) {
            return res.redirect('/dashboard.html?payment=failed');
        }

        // Verify payment status
        const response = await Cashfree.PGOrderFetchPayments('2023-08-01', order_id);
        
        if (response.data && response.data.length > 0) {
            const payment = response.data[0];
            
            if (payment.payment_status === 'SUCCESS') {
                return res.redirect(`/order-success.html?orderId=${order_id}`);
            }
        }
        
        res.redirect(`/preview.html?orderId=${order_id}&payment=failed`);

    } catch (error) {
        console.error('Cashfree callback error:', error);
        res.redirect('/dashboard.html?payment=error');
    }
};
