import express from 'express';
import {
    getAllUsers,
    updateUserPricing,
    toggleUserStatus,
    uploadSymbol,
    getAllSymbols,
    updateSymbol,
    toggleSymbolStatus,
    reorderSymbol,
    resetSymbolOrder,
    deleteSymbol,
    getAllOrders,
    getOrderDetails,
    createOrderWithoutPayment,
    markOrderCompleted,
    downloadOrderPDF,
    regenerateOrderPDF,
    getAnalytics,
    deleteOrder,
    deleteOrders,
    upload,
    getUserActivity,
    getUserSessions,
    getSessionDetails,
    getAllActiveSessions,
    getUserActivityLog
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
router.patch('/symbols/:symbolId/reorder', reorderSymbol);
router.post('/symbols/reset-order', resetSymbolOrder);
router.delete('/symbols/:symbolId', deleteSymbol);

// Order Management
// ⚠️ IMPORTANT: Specific routes MUST come BEFORE parameterized routes!
router.get('/orders', getAllOrders);
router.post('/orders/create', createOrderWithoutPayment);
router.post('/orders/delete-bulk', deleteOrders);  // ← Must be before :orderId routes
router.get('/orders/:orderId', getOrderDetails);
router.patch('/orders/:orderId/complete', markOrderCompleted);
router.get('/orders/:orderId/download', downloadOrderPDF);
router.post('/orders/:orderId/regenerate-pdf', regenerateOrderPDF);
router.delete('/orders/:orderId', deleteOrder);

// Analytics
router.get('/analytics', getAnalytics);

// User Activity & Session Tracking
router.get('/users/:userId/activity', getUserActivity);
router.get('/users/:userId/sessions', getUserSessions);
router.get('/users/:userId/activity-log', getUserActivityLog);
router.get('/sessions/:sessionId', getSessionDetails);
router.get('/sessions', getAllActiveSessions);

export default router;
