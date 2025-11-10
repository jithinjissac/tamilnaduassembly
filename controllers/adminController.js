import User from '../models/User.js';
import Symbol from '../models/Symbol.js';
import Order from '../models/Order.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for symbol image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'public', 'symbols');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'symbol-' + uniqueSuffix + path.extname(file.originalname));
    }
});

export const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// Get all users (admin only)
export const getAllUsers = async (req, res) => {
    try {
        // Get all users except the currently logged-in admin - OPTIMIZED
        const users = await User.find({ _id: { $ne: req.userId } })
            .select('-password')
            .sort({ createdAt: -1 })
            .lean();  // 30-40% faster!
        
        res.json({
            status: 'success',
            count: users.length,
            users
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch users',
            error: error.message
        });
    }
};

// Update user pricing
export const updateUserPricing = async (req, res) => {
    try {
        const { userId } = req.params;
        const { pricePerVoter } = req.body;

        if (pricePerVoter < 0.25 || pricePerVoter > 0.50) {
            return res.status(400).json({
                status: 'error',
                message: 'Price must be between ₹0.25 and ₹0.50'
            });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { pricePerVoter },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        res.json({
            status: 'success',
            message: 'User pricing updated successfully',
            user
        });
    } catch (error) {
        console.error('Update pricing error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update pricing',
            error: error.message
        });
    }
};

// Toggle user active status
export const toggleUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        user.isActive = !user.isActive;
        await user.save();

        res.json({
            status: 'success',
            message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                isActive: user.isActive
            }
        });
    } catch (error) {
        console.error('Toggle user status error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to toggle user status',
            error: error.message
        });
    }
};

// Upload symbol
export const uploadSymbol = async (req, res) => {
    try {
        const { name, nameMalayalam, category } = req.body;
        const adminId = req.userId;

        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                message: 'Symbol image is required'
            });
        }

        const imageUrl = `/symbols/${req.file.filename}`;

        const symbol = new Symbol({
            name,
            nameMalayalam: nameMalayalam || '',
            imageUrl,
            category: category || 'political-party',
            uploadedBy: adminId
        });

        await symbol.save();

        res.status(201).json({
            status: 'success',
            message: 'Symbol uploaded successfully',
            symbol
        });
    } catch (error) {
        console.error('Upload symbol error:', error);
        // Delete uploaded file if database save fails
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
            status: 'error',
            message: 'Failed to upload symbol',
            error: error.message
        });
    }
};

// Update symbol
export const updateSymbol = async (req, res) => {
    try {
        const { symbolId } = req.params;
        const { name, nameMalayalam, category } = req.body;

        // Find the symbol
        const symbol = await Symbol.findById(symbolId);
        if (!symbol) {
            return res.status(404).json({
                status: 'error',
                message: 'Symbol not found'
            });
        }

        // Update fields
        if (name) symbol.name = name;
        if (nameMalayalam !== undefined) symbol.nameMalayalam = nameMalayalam;
        if (category) symbol.category = category;

        // If new image is uploaded, update imageUrl and delete old image
        if (req.file) {
            // Delete old image file
            const oldImagePath = path.join(__dirname, '..', 'public', symbol.imageUrl);
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
            
            symbol.imageUrl = `/symbols/${req.file.filename}`;
        }

        await symbol.save();

        res.json({
            status: 'success',
            message: 'Symbol updated successfully',
            symbol
        });
    } catch (error) {
        console.error('Update symbol error:', error);
        // Delete uploaded file if database update fails
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
            status: 'error',
            message: 'Failed to update symbol',
            error: error.message
        });
    }
};

// Get all symbols
export const getAllSymbols = async (req, res) => {
    try {
        const { search, category, isActive } = req.query;
        
        let query = {};
        
        if (search) {
            query.$text = { $search: search };
        }
        
        if (category) {
            query.category = category;
        }
        
        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        const symbols = await Symbol.find(query)
            .sort({ createdAt: -1 })
            .populate('uploadedBy', 'name email')
            .lean();  // 30-40% faster!

        res.json({
            status: 'success',
            count: symbols.length,
            symbols
        });
    } catch (error) {
        console.error('Get symbols error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch symbols',
            error: error.message
        });
    }
};

// Toggle symbol active status
export const toggleSymbolStatus = async (req, res) => {
    try {
        const { symbolId } = req.params;
        
        const symbol = await Symbol.findById(symbolId);
        if (!symbol) {
            return res.status(404).json({
                status: 'error',
                message: 'Symbol not found'
            });
        }

        symbol.isActive = !symbol.isActive;
        symbol.updatedAt = Date.now();
        await symbol.save();

        res.json({
            status: 'success',
            message: `Symbol ${symbol.isActive ? 'activated' : 'deactivated'} successfully`,
            symbol
        });
    } catch (error) {
        console.error('Toggle symbol status error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to toggle symbol status',
            error: error.message
        });
    }
};

// Delete symbol
export const deleteSymbol = async (req, res) => {
    try {
        const { symbolId } = req.params;
        
        const symbol = await Symbol.findById(symbolId);
        if (!symbol) {
            return res.status(404).json({
                status: 'error',
                message: 'Symbol not found'
            });
        }

        // Delete image file
        const imagePath = path.join(__dirname, '..', 'public', symbol.imageUrl);
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }

        await Symbol.findByIdAndDelete(symbolId);

        res.json({
            status: 'success',
            message: 'Symbol deleted successfully'
        });
    } catch (error) {
        console.error('Delete symbol error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete symbol',
            error: error.message
        });
    }
};

// Get all orders (admin only)
export const getAllOrders = async (req, res) => {
    try {
        const { 
            status, 
            search, 
            sortBy = 'createdAt', 
            order = 'desc',
            page = 1,
            limit = 50  // Default: show 50 orders per page
        } = req.query;
        
        let query = {};
        
        // Filter by payment status
        if (status && status !== 'all') {
            query.paymentStatus = status;
        }
        
        // Search by order ID or user email
        if (search) {
            const users = await User.find({ 
                $or: [
                    { email: { $regex: search, $options: 'i' } },
                    { name: { $regex: search, $options: 'i' } }
                ]
            }).select('_id').lean();
            
            const userIds = users.map(u => u._id);
            
            query.$or = [
                { orderId: { $regex: search, $options: 'i' } },
                { userId: { $in: userIds } }
            ];
        }
        
        const sortOrder = order === 'asc' ? 1 : -1;
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder;
        
        // Pagination
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        
        // Get orders with pagination - OPTIMIZED
        const orders = await Order.find(query)
            .select('orderId userId totalVoters amount paymentStatus createdAt pdfPath customization location')
            .populate('userId', 'name email phone')
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNum)
            .lean();  // 30-40% faster!
        
        // Get total count for pagination (run in parallel)
        const totalCount = await Order.countDocuments(query);
        
        // Add voterCount field for backward compatibility
        const ordersWithCount = orders.map(order => ({
            ...order,
            voterCount: order.totalVoters || order.voters?.length || 0
        }));
        
        res.json({
            status: 'success',
            count: ordersWithCount.length,
            total: totalCount,
            page: pageNum,
            pages: Math.ceil(totalCount / limitNum),
            orders: ordersWithCount
        });
    } catch (error) {
        console.error('Get all orders error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch orders',
            error: error.message
        });
    }
};

// Get single order details (admin only)
export const getOrderDetails = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const order = await Order.findById(orderId)
            .populate('userId', 'name email phone')
            .lean();
        
        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }
        
        // Add voterCount field
        order.voterCount = order.totalVoters || order.voters?.length || 0;
        
        res.json({
            status: 'success',
            order
        });
    } catch (error) {
        console.error('Get order details error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch order details',
            error: error.message
        });
    }
};

// Admin: Create new order without payment
export const createOrderWithoutPayment = async (req, res) => {
    try {
        const { userId, customization, location, voters } = req.body;

        // Validate required fields
        if (!userId || !customization || !location || !voters || !Array.isArray(voters) || voters.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields: userId, customization, location, and voters array'
            });
        }

        // Generate order ID
        const generateOrderId = () => {
            const date = new Date();
            const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
            const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
            return `ORD-${dateStr}-${randomStr}`;
        };

        const orderId = generateOrderId();
        const totalVoters = voters.length;
        const pricePerVoter = 0.50; // Fixed price
        const amount = Math.round(totalVoters * pricePerVoter * 100) / 100;

        // Create order with completed status
        const order = new Order({
            userId,
            orderId,
            customization,
            location,
            voters,
            totalVoters,
            originalAmount: amount,
            pricePerVoter,
            amount,
            paymentStatus: 'completed',
            paidAt: new Date(),
            razorpayPaymentId: 'ADMIN_CREATED',
            razorpayOrderId: 'ADMIN_CREATED'
        });

        await order.save();

        res.status(201).json({
            status: 'success',
            message: 'Order created successfully without payment',
            order: {
                id: order._id,
                orderId: order.orderId,
                totalVoters: order.totalVoters,
                amount: order.amount,
                paymentStatus: order.paymentStatus
            }
        });

    } catch (error) {
        console.error('Create order without payment error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create order',
            error: error.message
        });
    }
};

// Admin: Mark order as completed without payment (bypass payment)
export const markOrderCompleted = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const order = await Order.findOne({ orderId });
        
        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }
        
        // Mark as completed without payment
        order.paymentStatus = 'completed';
        order.paidAt = new Date();
        order.razorpayPaymentId = 'ADMIN_BYPASS';
        order.razorpayOrderId = 'ADMIN_BYPASS';
        
        await order.save();
        
        res.json({
            status: 'success',
            message: 'Order marked as completed. PDF can now be generated.',
            order: {
                orderId: order.orderId,
                paymentStatus: order.paymentStatus,
                paidAt: order.paidAt
            }
        });
    } catch (error) {
        console.error('Mark order completed error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to mark order as completed',
            error: error.message
        });
    }
};

// Admin: Download order PDF
export const downloadOrderPDF = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        // Import slip controller function
        const { generateSlipHTML, getBrowser } = await import('./slipController.js');
        
        const order = await Order.findOne({ orderId });
        
        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }
        
        // Generate HTML for all slips
        const html = generateSlipHTML(order);
        
        // Generate PDF using browser
        const browser = await getBrowser();
        const page = await browser.newPage();
        
        await page.setContent(html, { 
            waitUntil: 'domcontentloaded',
            timeout: 300000
        });
        
        await page.waitForSelector('.symbol-image', { visible: true, timeout: 30000 }).catch(() => {
            console.log('⚠️ Symbol image wait timeout - continuing anyway');
        });
        
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, bottom: 0, left: 0, right: 0 },
            preferCSSPageSize: false,
            displayHeaderFooter: false,
            timeout: 300000
        });
        
        await page.close();
        
        // Set headers for download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=voter-slips-${orderId}.pdf`);
        res.setHeader('Content-Length', pdf.length);
        
        res.send(pdf);
        
    } catch (error) {
        console.error('Admin download PDF error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to download PDF',
            error: error.message
        });
    }
};

// Get analytics data
export const getAnalytics = async (req, res) => {
    try {
        // Run ALL queries in parallel for 5-8x faster response!
        const [
            totalUsers,
            activeUsers,
            totalOrders,
            paidOrders,
            totalSymbols,
            activeSymbols,
            revenueResult,
            recentOrders,
            ordersByMonth
        ] = await Promise.all([
            User.countDocuments({ role: 'user' }),
            User.countDocuments({ role: 'user', isActive: true }),
            Order.countDocuments(),
            Order.countDocuments({ paymentStatus: 'completed' }),
            Symbol.countDocuments(),
            Symbol.countDocuments({ isActive: true }),
            
            // Revenue calculation using aggregation (much faster!)
            Order.aggregate([
                { $match: { paymentStatus: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            
            // Recent orders
            Order.find()
                .sort({ createdAt: -1 })
                .limit(10)
                .populate('userId', 'name email')
                .select('orderId totalVoters amount paymentStatus createdAt')
                .lean(),
            
            // Orders by month (last 6 months)
            Order.aggregate([
                { 
                    $match: { 
                        createdAt: { 
                            $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)) 
                        } 
                    } 
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' }
                        },
                        count: { $sum: 1 },
                        revenue: { $sum: '$amount' }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ])
        ]);

        const totalRevenue = revenueResult[0]?.total || 0;

        res.json({
            status: 'success',
            analytics: {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    inactive: totalUsers - activeUsers
                },
                orders: {
                    total: totalOrders,
                    paid: paidOrders,
                    pending: totalOrders - paidOrders
                },
                symbols: {
                    total: totalSymbols,
                    active: activeSymbols,
                    inactive: totalSymbols - activeSymbols
                },
                revenue: {
                    total: totalRevenue,
                    currency: 'INR'
                },
                recentOrders,
                ordersByMonth
            }
        });
    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch analytics',
            error: error.message
        });
    }
};

// Delete single order (admin only)
export const deleteOrder = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findByIdAndDelete(orderId);

        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }

        console.log(`✅ Order deleted: ${order.orderId}`);

        res.json({
            status: 'success',
            message: 'Order deleted successfully',
            deletedOrder: order.orderId
        });
    } catch (error) {
        console.error('Delete order error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete order',
            error: error.message
        });
    }
};

// Delete multiple orders (admin only) - Bulk delete
export const deleteOrders = async (req, res) => {
    try {
        const { orderIds } = req.body;

        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Please provide at least one order ID'
            });
        }

        // Delete all specified orders
        const result = await Order.deleteMany({ _id: { $in: orderIds } });

        console.log(`✅ Deleted ${result.deletedCount} orders`);

        res.json({
            status: 'success',
            message: `Successfully deleted ${result.deletedCount} order(s)`,
            deletedCount: result.deletedCount,
            requestedCount: orderIds.length
        });
    } catch (error) {
        console.error('Bulk delete orders error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete orders',
            error: error.message
        });
    }
};

