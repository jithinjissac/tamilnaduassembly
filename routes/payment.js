import express from 'express';
import * as paymentController from '../controllers/paymentController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/payment/create-order
// @desc    Create payment order (auto-selects gateway)
// @access  Private
router.post('/create-order', auth, paymentController.createPaymentOrder);

// @route   POST /api/payment/razorpay/create-order
// @desc    Create Razorpay order
// @access  Private
router.post('/razorpay/create-order', auth, paymentController.createRazorpayOrder);

// @route   POST /api/payment/cashfree/create-order
// @desc    Create Cashfree order
// @access  Private
router.post('/cashfree/create-order', auth, paymentController.createCashfreeOrder);

// @route   POST /api/payment/verify
// @desc    Verify Razorpay payment
// @access  Private
router.post('/verify', auth, paymentController.verifyPayment);

// @route   POST /api/payment/cashfree/verify
// @desc    Verify Cashfree payment
// @access  Private
router.post('/cashfree/verify', auth, paymentController.verifyCashfreePayment);

// @route   POST /api/payment/webhook
// @desc    Razorpay webhook
// @access  Public (verified by signature)
router.post('/webhook', paymentController.webhook);

// @route   POST /api/payment/cashfree/webhook
// @desc    Cashfree webhook
// @access  Public
router.post('/cashfree/webhook', paymentController.cashfreeWebhook);

// @route   GET /api/payment/cashfree/callback
// @desc    Cashfree return URL callback
// @access  Public
router.get('/cashfree/callback', paymentController.cashfreeCallback);

export default router;
