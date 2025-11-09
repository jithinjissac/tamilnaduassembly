import express from 'express';
import {
    getAllUsers,
    updateUserPricing,
    toggleUserStatus,
    uploadSymbol,
    getAllSymbols,
    updateSymbol,
    toggleSymbolStatus,
    deleteSymbol,
    getAllOrders,
    getOrderDetails,
    createOrderWithoutPayment,
    markOrderCompleted,
    downloadOrderPDF,
    getAnalytics,
    upload
} from '../controllers/adminController.js';
import auth from '../middleware/auth.js';
import { isAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(auth);
router.use(isAdmin);

// User Management
router.get('/users', getAllUsers);
router.put('/users/:userId/pricing', updateUserPricing);
router.patch('/users/:userId/toggle-status', toggleUserStatus);

// Symbol Management
router.post('/symbols', upload.single('image'), uploadSymbol);
router.get('/symbols', getAllSymbols);
router.put('/symbols/:symbolId', upload.single('image'), updateSymbol);
router.patch('/symbols/:symbolId/toggle-status', toggleSymbolStatus);
router.delete('/symbols/:symbolId', deleteSymbol);

// Order Management
router.get('/orders', getAllOrders);
router.post('/orders/create', createOrderWithoutPayment);
router.get('/orders/:orderId', getOrderDetails);
router.patch('/orders/:orderId/complete', markOrderCompleted);
router.get('/orders/:orderId/download', downloadOrderPDF);

// Analytics
router.get('/analytics', getAnalytics);

export default router;
