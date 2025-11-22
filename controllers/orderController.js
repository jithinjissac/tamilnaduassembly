import Order from '../models/Order.js';
import User from '../models/User.js';
import { body, validationResult } from 'express-validator';
import { generatePDFBackground } from '../utils/pdfGenerator.js';
import { sendOrderConfirmationEmail } from '../utils/emailService.js';
import { generateInvoice, getInvoiceFilename } from '../utils/invoiceGenerator.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generate unique order ID
const generateOrderId = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `ORD-${dateStr}-${randomStr}`;
};

// Calculate pricing - flat rate, no discount
const calculateAmount = (totalVoters) => {
    const pricePerVoter = 0.50; // Fixed price: ₹0.50 per voter
    
    return Math.round(totalVoters * pricePerVoter * 100) / 100; // Round to 2 decimals
};

// Create new order
export const createOrder = [
    // Validation
    body('customization').notEmpty().withMessage('Customization is required'),
    body('customization.symbolImage').notEmpty().withMessage('Symbol image is required'),
    body('customization.symbolName').notEmpty().withMessage('Symbol name is required'),
    body('location').notEmpty().withMessage('Location is required'),
    body('voters').isArray({ min: 1 }).withMessage('Voters array is required'),
    
    async (req, res) => {
        try {
            // Check validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    status: 'error',
                    message: 'Validation failed',
                    errors: errors.array() 
                });
            }

            const { customization, location, voters } = req.body;
            const userId = req.userId;

            // Get user's custom price per voter
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    status: 'error',
                    message: 'User not found'
                });
            }

            // Calculate amount
            const totalVoters = voters.length;
            const pricePerVoter = user.pricePerVoter !== undefined ? user.pricePerVoter : 0.50; // Use user's custom price, including 0
            const originalAmount = totalVoters * pricePerVoter;
            const amount = Math.round(originalAmount * 100) / 100; // Final amount (same as original, no discount)

            // Generate order ID
            const orderId = generateOrderId();

            // Ensure slipsPerPage is set (default to 5 if not provided)
            if (!customization.slipsPerPage) {
                customization.slipsPerPage = 5;
            }

            // Create order
            const order = new Order({
                userId,
                orderId,
                customization,
                location,
                voters,
                totalVoters,
                originalAmount,
                pricePerVoter,
                amount
            });

            await order.save();

            // Send order confirmation email (use already fetched user)
            if (user) {
                sendOrderConfirmationEmail(user, order).catch(err => {
                    console.error('❌ Failed to send order confirmation email:', err.message);
                });
            }

            // ✅ Check if permanent PDF already exists (generated during preview)
            // Most of the time, PDF is already generated while user was viewing preview
            const { getPDFFilePath } = await import('../utils/pdfGenerator.js');
            const existingPDF = getPDFFilePath(order.orderId);
            
            let pdfStatus = 'generating'; // Default: PDF still generating
            if (existingPDF) {
                console.log(`✅ [ORDER] Permanent PDF already exists for ${order.orderId}`);
                pdfStatus = 'ready'; // PDF ready for instant download!
            } else {
                // Fallback: If PDF doesn't exist yet (rare), trigger background generation
                // This handles edge cases where preview generation failed or was skipped
                console.log(`⚠️ [ORDER] No permanent PDF found yet, triggering generation...`);
                generatePDFBackground(order, order.orderId).catch(err => {
                    console.error('Background PDF generation error:', err);
                });
            }

            res.status(201).json({
                status: 'success',
                message: 'Order created successfully. PDF ready for download.',
                order: {
                    id: order._id,
                    orderId: order.orderId,
                    totalVoters: order.totalVoters,
                    amount: order.amount,
                    paymentStatus: order.paymentStatus,
                    pdfStatus: pdfStatus
                }
            });

        } catch (error) {
            console.error('Create order error:', error);
            res.status(500).json({ 
                status: 'error',
                message: 'Failed to create order',
                error: error.message 
            });
        }
    }
];

// Get all orders for logged-in user
export const getUserOrders = async (req, res) => {
    try {
        const userId = req.userId;
        
        // Use lean() for faster queries and select only needed fields
        const orders = await Order.find({ userId })
            .select('-voters -__v') // Don't send voter data or version key in list
            .sort({ createdAt: -1 })
            .lean(); // Returns plain JS objects (faster)

        // Return array directly for dashboard compatibility
        res.json(orders.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            customization: {
                partyName: order.customization?.partyName || '-',
                partyLogo: order.customization?.partyLogo || '',
                symbolText: order.customization?.symbolText || ''
            },
            location: order.location,
            voterCount: order.totalVoters,
            amount: order.amount,
            paymentStatus: order.paymentStatus,
            createdAt: order.createdAt,
            paidAt: order.paidAt,
            downloadCount: order.downloadCount || 0
        })));

    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to get orders',
            error: error.message 
        });
    }
};

// Get single order details
export const getOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.userId;
        const userRole = req.userRole; // Get user role from auth middleware

        console.log('🔍 [getOrder] Request details:');
        console.log('   orderId:', orderId);
        console.log('   userId:', userId, typeof userId, userId?.constructor?.name);
        console.log('   userRole:', userRole);

        // Build query - admins can access all orders, users only their own
        const query = { orderId };
        if (userRole !== 'admin') {
            query.userId = userId;
        }

        console.log('   Query:', JSON.stringify(query));

        // Use lean() for faster queries - returns plain JS object instead of Mongoose document
        const order = await Order.findOne(query)
            .lean()
            .select('-__v'); // Exclude version key for smaller payload

        console.log('   Order found:', !!order);
        if (order) {
            console.log('   Order.userId:', order.userId, typeof order.userId, order.userId?.constructor?.name);
            console.log('   Match (direct):', order.userId === userId);
            console.log('   Match (toString):', order.userId?.toString() === userId?.toString());
        }

        if (!order) {
            console.log('   ❌ Order not found with query:', JSON.stringify(query));
            return res.status(404).json({ 
                status: 'error',
                message: 'Order not found or access denied' 
            });
        }

        // Set cache headers for completed orders (they don't change)
        if (order.paymentStatus === 'completed') {
            res.set('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour
        }

        console.log('   ✅ Returning order');
        res.json({
            status: 'success',
            order
        });

    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to get order',
            error: error.message 
        });
    }
};

// Get order statistics
export const getOrderStats = async (req, res) => {
    try {
        const userId = req.userId;

        const stats = await Order.aggregate([
            { $match: { userId: userId } },
            {
                $group: {
                    _id: '$paymentStatus',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    totalVoters: { $sum: '$totalVoters' }
                }
            }
        ]);

        const totalOrders = await Order.countDocuments({ userId });
        const completedOrders = await Order.countDocuments({ userId, paymentStatus: 'completed' });
        
        // Calculate totals
        let totalVoters = 0;
        let totalAmount = 0;
        
        stats.forEach(stat => {
            totalVoters += stat.totalVoters;
            // Only count amount from completed orders
            if (stat._id === 'completed') {
                totalAmount += stat.totalAmount;
            }
        });

        // Return format expected by dashboard
        res.json({
            totalOrders,
            completedOrders,
            totalVoters,
            totalAmount
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to get statistics',
            error: error.message 
        });
    }
};

// Update slips per page for an order
export const updateSlipsPerPage = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { slipsPerPage } = req.body;
        const userId = req.userId;

        console.log(`📝 Updating slips per page for order ${orderId} to ${slipsPerPage}`);

        // Validate slipsPerPage
        if (![5, 6].includes(slipsPerPage)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid slipsPerPage value. Must be 5 or 6.'
            });
        }

        // Find order by _id and userId
        const order = await Order.findOne({ _id: orderId, userId });

        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }

        // Delete existing preview PDF if it exists
        if (order.previewPdfFilename) {
            const tempDir = path.join(__dirname, '..', 'public', 'temp-pdfs');
            const previewPath = path.join(tempDir, order.previewPdfFilename);
            
            try {
                if (fs.existsSync(previewPath)) {
                    fs.unlinkSync(previewPath);
                    console.log(`🗑️ Deleted old preview PDF: ${order.previewPdfFilename}`);
                }
            } catch (err) {
                console.warn('⚠️ Failed to delete old preview PDF:', err.message);
            }
        }

        // Delete existing permanent PDF if it exists
        if (order.permanentPdfFilename) {
            const pdfsDir = path.join(__dirname, '..', 'public', 'permanent-pdfs');
            const permanentPath = path.join(pdfsDir, order.permanentPdfFilename);
            
            try {
                if (fs.existsSync(permanentPath)) {
                    fs.unlinkSync(permanentPath);
                    console.log(`🗑️ Deleted old permanent PDF: ${order.permanentPdfFilename}`);
                }
            } catch (err) {
                console.warn('⚠️ Failed to delete old permanent PDF:', err.message);
            }
        }

        // Update slipsPerPage
        order.customization.slipsPerPage = slipsPerPage;
        
        // Clear PDF filenames to force regeneration
        order.previewPdfFilename = null;
        order.permanentPdfFilename = null;
        
        await order.save();

        console.log(`✅ Updated slips per page to ${slipsPerPage} for order ${order.orderId}`);
        console.log(`✅ Cleared PDF filenames - both preview and permanent PDFs will be regenerated`);

        res.json({
            status: 'success',
            message: 'Slips per page updated successfully. PDFs will be regenerated.',
            slipsPerPage: order.customization.slipsPerPage
        });

    } catch (error) {
        console.error('Update slips per page error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update slips per page',
            error: error.message
        });
    }
};

// Download invoice for paid order
export const downloadInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.userId; // This is a MongoDB ObjectId
        const userRole = req.userRole;

        console.log(`📄 Invoice download request for order: ${orderId}`);
        console.log(`   User ID: ${userId}`);
        console.log(`   User Role: ${userRole}`);

        // Find order
        const order = await Order.findOne({ orderId }).populate('customization.symbolId');
        
        if (!order) {
            console.log(`❌ Order not found: ${orderId}`);
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }

        console.log(`   Order.userId: ${order.userId}`);
        console.log(`   Payment Status: ${order.paymentStatus}`);

        // Verify ownership (unless admin)
        // Both userId from req and order.userId are ObjectId objects
        const isOwner = order.userId.equals(userId);
        const isAdmin = userRole === 'admin';
        
        console.log(`   Is Owner: ${isOwner}, Is Admin: ${isAdmin}`);
        
        if (!isAdmin && !isOwner) {
            console.log(`❌ Unauthorized access attempt`);
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized access'
            });
        }

        // Check if order is paid
        if (order.paymentStatus !== 'completed') {
            console.log(`❌ Payment not completed: ${order.paymentStatus}`);
            return res.status(400).json({
                status: 'error',
                message: 'Invoice only available for completed payments'
            });
        }

        // Get user details
        const user = await User.findById(order.userId);
        
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        console.log(`✅ Generating invoice for ${orderId}`);

        // Generate invoice PDF
        const invoicePDF = await generateInvoice(order, user);
        const filename = getInvoiceFilename(orderId);

        // Set headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', invoicePDF.length);
        res.setHeader('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour

        console.log(`📄 Invoice sent: ${filename} (${invoicePDF.length} bytes)`);
        
        res.send(invoicePDF);

    } catch (error) {
        console.error('Download invoice error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to generate invoice',
            error: error.message
        });
    }
};
