import express from 'express';
import * as paymentController from '../controllers/paymentController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/payment/create-order
// @desc    Create Razorpay order
// @access  Private
router.post('/create-order', auth, paymentController.createRazorpayOrder);

// @route   POST /api/payment/verify
// @desc    Verify Razorpay payment
// @access  Private
router.post('/verify', auth, paymentController.verifyPayment);

// @route   POST /api/payment/webhook
// @desc    Razorpay webhook
// @access  Public (verified by signature)
router.post('/webhook', paymentController.webhook);

export default router;
