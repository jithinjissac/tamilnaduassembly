import express from 'express';
import * as orderController from '../controllers/orderController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/orders/create
// @desc    Create new order
// @access  Private
router.post('/create', auth, orderController.createOrder);

// @route   GET /api/orders
// @desc    Get all orders for logged-in user
// @access  Private
router.get('/', auth, orderController.getUserOrders);

// @route   GET /api/orders/:orderId
// @desc    Get single order details
// @access  Private
router.get('/:orderId', auth, orderController.getOrder);

// @route   GET /api/orders/stats
// @desc    Get order statistics
// @access  Private
router.get('/stats/summary', auth, orderController.getOrderStats);

export default router;
