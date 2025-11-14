import express from 'express';
import * as paymentController from '../controllers/paymentController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/payment/create
// @desc    Create payment order (Razorpay or Cashfree based on settings)
// @access  Private
router.post('/create', auth, paymentController.createPaymentOrder);

// @route   POST /api/payment/create-order
// @desc    Create Razorpay order (legacy - backward compatibility)
// @access  Private
router.post('/create-order', auth, paymentController.createRazorpayOrder);

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

export default router;

