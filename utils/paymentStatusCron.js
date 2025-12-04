import cron from 'node-cron';
import razorpay from '../config/razorpay.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { sendPaymentSuccessEmail } from '../utils/emailService.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PaymentCron');

// Configuration
const CRON_SCHEDULE = '*/15 * * * *'; // Every 15 minutes
const BATCH_SIZE = 10; // Process 10 orders at a time
const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds delay between Razorpay API calls
const MAX_AGE_HOURS = 72; // Only check orders from last 72 hours

/**
 * Sleep utility for rate limiting
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check and update a single order's payment status
 */
async function checkOrderPaymentStatus(order) {
    try {
        let updated = false;

        // Skip if already completed or failed more than 24 hours ago
        if (order.paymentStatus === 'completed') {
            return { orderId: order.orderId, status: 'already_completed', updated: false };
        }

        if (order.paymentStatus === 'failed' && 
            order.updatedAt && 
            (Date.now() - new Date(order.updatedAt).getTime()) > 24 * 60 * 60 * 1000) {
            return { orderId: order.orderId, status: 'failed_old', updated: false };
        }

        // Check Razorpay payment ID if available
        if (order.razorpayPaymentId) {
            await sleep(DELAY_BETWEEN_REQUESTS); // Rate limiting
            
            const payment = await razorpay.payments.fetch(order.razorpayPaymentId);
            
            if ((payment.status === 'captured' || payment.status === 'authorized') && 
                order.paymentStatus !== 'completed') {
                
                order.paymentStatus = 'completed';
                order.status = 'processing';
                order.paidAt = payment.captured_at ? new Date(payment.captured_at * 1000) : new Date();
                
                if (payment.order_id && !order.razorpayOrderId) {
                    order.razorpayOrderId = payment.order_id;
                }

                await order.save();
                updated = true;

                logger.info('✅ Order updated to completed:', order.orderId);

                // Send email notification
                try {
                    const user = await User.findById(order.userId);
                    if (user && user.email) {
                        await sendPaymentSuccessEmail(user.email, order.orderId);
                        logger.info('📧 Payment success email sent for:', order.orderId);
                    }
                } catch (emailError) {
                    logger.error('Failed to send email for', order.orderId, ':', emailError.message);
                }

                return { orderId: order.orderId, status: 'updated_to_completed', updated: true };
            } else if (payment.status === 'failed' && order.paymentStatus === 'pending') {
                order.paymentStatus = 'failed';
                await order.save();
                updated = true;
                logger.info('Order updated to failed:', order.orderId);
                return { orderId: order.orderId, status: 'updated_to_failed', updated: true };
            }

            return { orderId: order.orderId, status: `razorpay_${payment.status}`, updated: false };
        }

        // Check Razorpay order ID if payment ID not available
        if (order.razorpayOrderId) {
            await sleep(DELAY_BETWEEN_REQUESTS); // Rate limiting
            
            const razorpayOrder = await razorpay.orders.fetch(order.razorpayOrderId);
            
            if (razorpayOrder.status === 'paid' && order.paymentStatus !== 'completed') {
                // Fetch payments for this order
                await sleep(DELAY_BETWEEN_REQUESTS); // Additional rate limiting
                const payments = await razorpay.orders.fetchPayments(order.razorpayOrderId);
                
                if (payments && payments.items && payments.items.length > 0) {
                    const successfulPayment = payments.items.find(
                        p => p.status === 'captured' || p.status === 'authorized'
                    );
                    
                    if (successfulPayment) {
                        order.paymentStatus = 'completed';
                        order.status = 'processing';
                        order.razorpayPaymentId = successfulPayment.id;
                        order.paidAt = successfulPayment.captured_at ? 
                            new Date(successfulPayment.captured_at * 1000) : new Date();
                        
                        await order.save();
                        updated = true;

                        logger.info('✅ Order updated to completed (from order check):', order.orderId);

                        // Send email notification
                        try {
                            const user = await User.findById(order.userId);
                            if (user && user.email) {
                                await sendPaymentSuccessEmail(user.email, order.orderId);
                                logger.info('📧 Payment success email sent for:', order.orderId);
                            }
                        } catch (emailError) {
                            logger.error('Failed to send email for', order.orderId, ':', emailError.message);
                        }

                        return { orderId: order.orderId, status: 'updated_to_completed', updated: true };
                    }
                }
            }

            return { orderId: order.orderId, status: `order_${razorpayOrder.status}`, updated: false };
        }

        return { orderId: order.orderId, status: 'no_razorpay_info', updated: false };

    } catch (error) {
        logger.error('Error checking order', order.orderId, ':', error.message);
        return { orderId: order.orderId, status: 'error', updated: false, error: error.message };
    }
}

/**
 * Main cron job function
 */
async function checkPendingPayments() {
    const startTime = Date.now();
    logger.info('🔍 Starting payment status check cron job...');

    try {
        // Find pending orders from last 72 hours with Razorpay IDs
        const cutoffDate = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000);
        
        const pendingOrders = await Order.find({
            paymentStatus: 'pending',
            createdAt: { $gte: cutoffDate },
            $or: [
                { razorpayPaymentId: { $exists: true, $ne: null } },
                { razorpayOrderId: { $exists: true, $ne: null } }
            ]
        })
        .sort({ createdAt: -1 }) // Most recent first
        .limit(BATCH_SIZE)
        .lean();

        if (pendingOrders.length === 0) {
            logger.info('✅ No pending orders to check');
            return;
        }

        logger.info(`📋 Found ${pendingOrders.length} pending orders to check`);

        const results = {
            total: pendingOrders.length,
            updated: 0,
            errors: 0,
            skipped: 0
        };

        // Process each order with rate limiting
        for (const orderData of pendingOrders) {
            // Re-fetch order to ensure we have latest data
            const order = await Order.findById(orderData._id);
            
            if (!order) {
                results.skipped++;
                continue;
            }

            const result = await checkOrderPaymentStatus(order);
            
            if (result.updated) {
                results.updated++;
            } else if (result.error) {
                results.errors++;
            } else if (result.status === 'already_completed' || result.status === 'failed_old') {
                results.skipped++;
            }

            logger.debug(`Order ${result.orderId}: ${result.status}`);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`✅ Payment check completed in ${duration}s - Updated: ${results.updated}, Errors: ${results.errors}, Skipped: ${results.skipped}`);

    } catch (error) {
        logger.error('Payment status cron job error:', error.message);
    }
}

/**
 * Initialize and start the cron job
 */
export function startPaymentStatusCron() {
    logger.info('🕐 Initializing payment status cron job...');
    logger.info(`📅 Schedule: ${CRON_SCHEDULE} (every 15 minutes)`);
    logger.info(`📦 Batch size: ${BATCH_SIZE} orders per run`);
    logger.info(`⏱️ Rate limit: ${DELAY_BETWEEN_REQUESTS}ms between API calls`);
    logger.info(`📆 Max age: ${MAX_AGE_HOURS} hours`);

    // Schedule the cron job
    const cronJob = cron.schedule(CRON_SCHEDULE, async () => {
        await checkPendingPayments();
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata" // IST timezone
    });

    logger.info('✅ Payment status cron job started successfully');

    // Run immediately on startup (optional - comment out if not needed)
    setTimeout(async () => {
        logger.info('🚀 Running initial payment status check...');
        await checkPendingPayments();
    }, 10000); // Wait 10 seconds after server start

    return cronJob;
}

/**
 * Manual trigger function (for testing or admin use)
 */
export async function manualPaymentCheck() {
    logger.info('🔧 Manual payment status check triggered');
    await checkPendingPayments();
}

export default {
    startPaymentStatusCron,
    manualPaymentCheck
};
