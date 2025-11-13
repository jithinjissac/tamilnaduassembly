import crypto from 'crypto';
import razorpay from '../config/razorpay.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { sendPaymentSuccessEmail, sendPDFReadyEmail } from '../utils/emailService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
