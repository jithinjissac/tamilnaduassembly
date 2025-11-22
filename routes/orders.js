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

// @route   PATCH /api/orders/:orderId/update-slips-per-page
// @desc    Update slips per page for an order
// @access  Private
router.patch('/:orderId/update-slips-per-page', auth, orderController.updateSlipsPerPage);

// @route   PATCH /api/orders/:orderId/complete
// @desc    Complete free order (amount = 0)
// @access  Private
router.patch('/:orderId/complete', auth, orderController.completeFreeOrder);

// @route   GET /api/orders/stats
// @desc    Get order statistics
// @access  Private
router.get('/stats/summary', auth, orderController.getOrderStats);

// @route   GET /api/orders/:orderId/invoice
// @desc    Download invoice for paid order
// @access  Private
router.get('/:orderId/invoice', auth, orderController.downloadInvoice);

export default router;
