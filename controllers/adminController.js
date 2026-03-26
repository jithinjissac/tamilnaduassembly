import User from '../models/User.js';
import Symbol from '../models/Symbol.js';
import Order from '../models/Order.js';
import AssemblyOrder from '../models/AssemblyOrder.js';
import Settings from '../models/Settings.js';
import UserActivity from '../models/UserActivity.js';
import UserSession from '../models/UserSession.js';
import { getPreviewPayloadById } from './assemblyVoterController_v2.js';
import { saveVoterSnippetSlipsToFile } from '../utils/imageSlipGenerator.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getPrimaryElectionModule() {
    try {
        const settingsMap = await Settings.getSettings('general');
        const mode = settingsMap?.get
            ? settingsMap.get('primaryElectionModule')
            : settingsMap?.primaryElectionModule;
        return mode === 'assembly' ? 'assembly' : 'local-body';
    } catch (_) {
        return 'local-body';
    }
}

function normalizeAdminOrder(orderDoc, electionModule) {
    const order = { ...orderDoc };

    if (electionModule === 'assembly') {
        return {
            ...order,
            voterCount: order.totalVoters || order.voters?.length || 0,
            location: {
                district: order.district || '-',
                localBody: order.constituency || '-',
                ward: order.selectedParts?.[0]?.partName || '-'
            },
            customization: {
                ...(order.customization || {}),
                symbolName: order.customization?.partyName || order.customization?.symbolText || '',
                symbolNameMalayalam: order.customization?.partyNameMalayalam || order.customization?.symbolTextMalayalam || '',
                symbolImage: order.customization?.partyLogo || ''
            }
        };
    }

    return {
        ...order,
        voterCount: order.totalVoters || order.voters?.length || 0
    };
}

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
            .sort({ displayOrder: 1, createdAt: 1 })
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

// Reorder symbols
export const reorderSymbol = async (req, res) => {
    try {
        const { symbolId } = req.params;
        const { direction, newOrder } = req.body; // 'up' or 'down' OR specific number
        
        const currentSymbol = await Symbol.findById(symbolId);
        if (!currentSymbol) {
            return res.status(404).json({
                status: 'error',
                message: 'Symbol not found'
            });
        }

        // Get all symbols sorted by displayOrder
        const allSymbols = await Symbol.find().sort({ displayOrder: 1, createdAt: 1 });
        
        // Initialize displayOrder if needed
        let needsInit = allSymbols.some(s => !s.displayOrder && s.displayOrder !== 0);
        if (needsInit) {
            for (let i = 0; i < allSymbols.length; i++) {
                allSymbols[i].displayOrder = i + 1;
                await allSymbols[i].save();
            }
        }

        // If specific order number provided
        if (newOrder !== undefined) {
            const targetOrder = parseInt(newOrder);
            
            if (targetOrder < 1 || targetOrder > allSymbols.length) {
                return res.status(400).json({
                    status: 'error',
                    message: `Order must be between 1 and ${allSymbols.length}`
                });
            }

            const currentOrder = currentSymbol.displayOrder || allSymbols.findIndex(s => s._id.toString() === symbolId) + 1;
            
            if (currentOrder === targetOrder) {
                return res.json({
                    status: 'success',
                    message: 'Symbol already at this position'
                });
            }

            // Reorder all symbols
            if (targetOrder < currentOrder) {
                // Moving up - shift others down
                for (let symbol of allSymbols) {
                    if (symbol._id.toString() === symbolId) continue;
                    if (symbol.displayOrder >= targetOrder && symbol.displayOrder < currentOrder) {
                        symbol.displayOrder += 1;
                        await symbol.save();
                    }
                }
            } else {
                // Moving down - shift others up
                for (let symbol of allSymbols) {
                    if (symbol._id.toString() === symbolId) continue;
                    if (symbol.displayOrder > currentOrder && symbol.displayOrder <= targetOrder) {
                        symbol.displayOrder -= 1;
                        await symbol.save();
                    }
                }
            }

            currentSymbol.displayOrder = targetOrder;
            await currentSymbol.save();

            return res.json({
                status: 'success',
                message: `Symbol moved to position ${targetOrder}`
            });
        }

        // Original up/down logic
        const currentIndex = allSymbols.findIndex(s => s._id.toString() === symbolId);
        
        if (direction === 'up' && currentIndex > 0) {
            // Swap with previous
            const temp = allSymbols[currentIndex - 1].displayOrder;
            allSymbols[currentIndex - 1].displayOrder = currentSymbol.displayOrder;
            currentSymbol.displayOrder = temp;
            
            await allSymbols[currentIndex - 1].save();
            await currentSymbol.save();
        } else if (direction === 'down' && currentIndex < allSymbols.length - 1) {
            // Swap with next
            const temp = allSymbols[currentIndex + 1].displayOrder;
            allSymbols[currentIndex + 1].displayOrder = currentSymbol.displayOrder;
            currentSymbol.displayOrder = temp;
            
            await allSymbols[currentIndex + 1].save();
            await currentSymbol.save();
        }

        res.json({
            status: 'success',
            message: 'Symbol order updated successfully'
        });
    } catch (error) {
        console.error('Reorder symbol error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to reorder symbol',
            error: error.message
        });
    }
};

// Reset symbol order to creation date
export const resetSymbolOrder = async (req, res) => {
    try {
        // Get all symbols sorted by creation date
        const allSymbols = await Symbol.find().sort({ createdAt: 1 });
        
        // Reset displayOrder to match creation order
        for (let i = 0; i < allSymbols.length; i++) {
            allSymbols[i].displayOrder = i + 1;
            await allSymbols[i].save();
        }

        res.json({
            status: 'success',
            message: `Reset order for ${allSymbols.length} symbols`,
            count: allSymbols.length
        });
    } catch (error) {
        console.error('Reset symbol order error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to reset symbol order',
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
        const electionModule = await getPrimaryElectionModule();
        const OrderModel = electionModule === 'assembly' ? AssemblyOrder : Order;

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
        
        if (electionModule === 'assembly') {
            query.isDeleted = { $ne: true };
        }

        const selectFields = electionModule === 'assembly'
            ? 'orderId userId totalVoters amount paymentStatus createdAt pdfPath customization district constituency selectedParts status'
            : 'orderId userId totalVoters amount paymentStatus createdAt pdfPath customization location status';

        // Get orders with pagination - OPTIMIZED
        const orders = await OrderModel.find(query)
            .select(selectFields)
            .populate('userId', 'name email phone')
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNum)
            .lean();  // 30-40% faster!
        
        // Get total count for pagination (run in parallel)
        const totalCount = await OrderModel.countDocuments(query);
        
        // Normalize to the existing admin UI shape.
        const ordersWithCount = orders.map(order => normalizeAdminOrder(order, electionModule));
        
        res.json({
            status: 'success',
            electionModule,
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
        const electionModule = await getPrimaryElectionModule();

        const primaryModel = electionModule === 'assembly' ? AssemblyOrder : Order;
        const fallbackModel = electionModule === 'assembly' ? Order : AssemblyOrder;
        
        let order = await primaryModel.findById(orderId)
            .populate('userId', 'name email phone')
            .lean();
        let resolvedModule = electionModule;

        // Allow mixed data access by id even if mode changed recently.
        if (!order) {
            order = await fallbackModel.findById(orderId)
                .populate('userId', 'name email phone')
                .lean();
            resolvedModule = electionModule === 'assembly' ? 'local-body' : 'assembly';
        }
        
        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }
        
        order = normalizeAdminOrder(order, resolvedModule);
        
        res.json({
            status: 'success',
            electionModule: resolvedModule,
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
        
        // Fetch user to get their pricePerVoter
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }
        
        const pricePerVoter = user.pricePerVoter !== undefined ? user.pricePerVoter : 0.50; // Use user's custom price, including 0
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

// Admin: Transfer order to another user (change ownership)
export const transferOrderToUser = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { userId, markAsPending } = req.body;

        if (!userId) {
            return res.status(400).json({
                status: 'error',
                message: 'User ID is required'
            });
        }

        // Find the order
        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }

        // Find the target user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'Target user not found'
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                status: 'error',
                message: 'Cannot transfer order to inactive user'
            });
        }

        const oldUserId = order.userId;

        // Update order ownership
        order.userId = userId;

        // Recalculate amount based on new user's pricing
        const pricePerVoter = user.pricePerVoter !== undefined ? user.pricePerVoter : 0.50;
        const newAmount = Math.round(order.totalVoters * pricePerVoter * 100) / 100;
        
        order.pricePerVoter = pricePerVoter;
        order.amount = newAmount;
        order.originalAmount = newAmount;

        // If markAsPending is true, change status to pending (user needs to pay)
        if (markAsPending) {
            order.paymentStatus = 'pending';
            order.paidAt = null;
            order.razorpayPaymentId = null;
            order.razorpayOrderId = null;
            order.cashfreeOrderId = null;
            order.cashfreeSessionId = null;
            order.cashfreePaymentId = null;
        }

        await order.save();

        res.json({
            status: 'success',
            message: `Order transferred to ${user.name} (${user.email})${markAsPending ? ' and marked as pending payment' : ''}`,
            order: {
                orderId: order.orderId,
                oldUserId,
                newUserId: userId,
                userName: user.name,
                userEmail: user.email,
                newAmount: order.amount,
                paymentStatus: order.paymentStatus
            }
        });

    } catch (error) {
        console.error('Transfer order error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to transfer order',
            error: error.message
        });
    }
};

// Admin: Create pending order on behalf of user (user will complete payment)
export const createPendingOrderForUser = async (req, res) => {
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
        
        // Fetch user to get their pricePerVoter
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                status: 'error',
                message: 'Cannot create order for inactive user'
            });
        }
        
        const pricePerVoter = user.pricePerVoter !== undefined ? user.pricePerVoter : 0.50;
        const amount = Math.round(totalVoters * pricePerVoter * 100) / 100;

        // Create order with PENDING status (user will complete payment)
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
            paymentStatus: 'pending' // User needs to pay
        });

        await order.save();

        res.status(201).json({
            status: 'success',
            message: 'Pending order created successfully. User can now complete payment.',
            order: {
                id: order._id,
                orderId: order.orderId,
                userId: order.userId,
                totalVoters: order.totalVoters,
                amount: order.amount,
                paymentStatus: order.paymentStatus,
                userEmail: user.email,
                userName: user.name
            }
        });

    } catch (error) {
        console.error('Create pending order for user error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create pending order',
            error: error.message
        });
    }
};

// Admin: Mark order as completed without payment (bypass payment)
export const markOrderCompleted = async (req, res) => {
    try {
        const { orderId } = req.params;
        const electionModule = await getPrimaryElectionModule();

        if (electionModule === 'assembly') {
            const order = await AssemblyOrder.findOne({ orderId, isDeleted: { $ne: true } });
            if (!order) {
                return res.status(404).json({ status: 'error', message: 'Order not found' });
            }

            order.paymentStatus = 'completed';
            order.paidAt = new Date();
            order.paymentMethod = 'admin_bypass';
            order.status = 'completed';
            await order.save();

            return res.json({
                status: 'success',
                electionModule,
                message: 'Order marked as completed. PDF can now be generated.',
                order: {
                    orderId: order.orderId,
                    paymentStatus: order.paymentStatus,
                    paidAt: order.paidAt
                }
            });
        }
        
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
        const electionModule = await getPrimaryElectionModule();

        if (electionModule === 'assembly') {
            const order = await AssemblyOrder.findOne({ orderId, isDeleted: { $ne: true } });
            if (!order) {
                return res.status(404).json({ status: 'error', message: 'Order not found' });
            }

            if (order.paymentStatus !== 'completed') {
                return res.status(403).json({ status: 'error', message: 'Payment not completed' });
            }

            if (!order.pdfPath && order.previewId) {
                const previewPayload = getPreviewPayloadById(order.previewId);
                if (previewPayload && Array.isArray(previewPayload.voters) && previewPayload.voters.length > 0) {
                    const slipFileInfo = await saveVoterSnippetSlipsToFile(previewPayload.voters, {
                        constituency: order.constituency || 'Assembly',
                        district: order.district || '',
                        stateCode: order.stateCode || '',
                        candidate: previewPayload.candidate || null,
                        symbolImage: previewPayload.candidate?.symbol || previewPayload.candidate?.symbolImage || '',
                        symbolName: previewPayload.candidate?.symbolName || previewPayload.candidate?.name || '',
                        symbolNameMalayalam: previewPayload.candidate?.symbolNameMalayalam || previewPayload.candidate?.partyNameMalayalam || previewPayload.candidate?.nameMalayalam || previewPayload.candidate?.symbolName || previewPayload.candidate?.name || ''
                    });

                    order.pdfPath = `/voter-slips/${slipFileInfo.pdfFileName}`;
                    order.pdfGenerated = true;
                    order.pdfGeneratedAt = new Date();
                    await order.save();
                }
            }

            if (!order.pdfPath) {
                return res.status(404).json({ status: 'error', message: 'PDF not available for this assembly order' });
            }

            const pdfFullPath = path.join(__dirname, '..', order.pdfPath);
            if (!fs.existsSync(pdfFullPath)) {
                return res.status(404).json({ status: 'error', message: 'PDF file not found on server' });
            }

            const pdfBuffer = fs.readFileSync(pdfFullPath);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=voter-slips-${orderId}.pdf`);
            res.setHeader('Content-Length', pdfBuffer.length);
            return res.send(pdfBuffer);
        }
        
        const order = await Order.findOne({ orderId });
        
        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }
        
        // Check if PDF already exists on disk
        const permanentPdfDir = path.join(__dirname, '..', 'public', 'permanent-pdfs');
        const pdfFilename = `${orderId}.pdf`;
        const pdfPath = path.join(permanentPdfDir, pdfFilename);
        
        console.log(`📥 ADMIN PDF DOWNLOAD: Order ${orderId}`);
        console.log(`   Total voters: ${order.voters.length}`);
        console.log(`   Checking for existing PDF: ${pdfPath}`);
        
        // If PDF exists, serve it directly
        if (fs.existsSync(pdfPath)) {
            console.log(`✅ Found existing PDF, serving from disk`);
            const pdfBuffer = fs.readFileSync(pdfPath);
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=voter-slips-${orderId}.pdf`);
            res.setHeader('Content-Length', pdfBuffer.length);
            
            return res.send(pdfBuffer);
        }
        
        // If no PDF exists, generate it
        console.log(`⚠️ No existing PDF found, generating new one...`);
        
        // Import slip controller function
        const { generateSlipHTML, getBrowser } = await import('./slipController.js');
        
        console.log(`   Calling generateSlipHTML with NO endIndex (full PDF, isPreview = false)`);
        
        // Generate HTML for ALL slips (no preview mode)
        // Pass startIndex=0, endIndex=null to ensure isPreview=false
        const html = await generateSlipHTML(order, 0, null);
        
        console.log(`✅ HTML generated successfully (full PDF mode)`);
        
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
        
        // Save PDF to disk for future use
        if (!fs.existsSync(permanentPdfDir)) {
            fs.mkdirSync(permanentPdfDir, { recursive: true });
        }
        fs.writeFileSync(pdfPath, pdf);
        console.log(`💾 PDF saved to disk: ${pdfPath}`);
        
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

// Regenerate order PDF (admin only) - Forces fresh generation
export const regenerateOrderPDF = async (req, res) => {
    try {
        const { orderId } = req.params;
        const electionModule = await getPrimaryElectionModule();

        if (electionModule === 'assembly') {
            const order = await AssemblyOrder.findOne({ orderId, isDeleted: { $ne: true } });
            if (!order) {
                return res.status(404).json({ status: 'error', message: 'Order not found' });
            }

            if (!order.previewId) {
                return res.status(404).json({ status: 'error', message: 'Preview session missing. Please re-extract.' });
            }

            const previewPayload = getPreviewPayloadById(order.previewId);
            if (!previewPayload || !Array.isArray(previewPayload.voters) || previewPayload.voters.length === 0) {
                return res.status(404).json({ status: 'error', message: 'Preview session expired. Please re-extract.' });
            }

            const slipFileInfo = await saveVoterSnippetSlipsToFile(previewPayload.voters, {
                constituency: order.constituency || 'Assembly',
                district: order.district || '',
                stateCode: order.stateCode || '',
                candidate: previewPayload.candidate || null,
                symbolImage: previewPayload.candidate?.symbol || previewPayload.candidate?.symbolImage || '',
                symbolName: previewPayload.candidate?.symbolName || previewPayload.candidate?.name || '',
                symbolNameMalayalam: previewPayload.candidate?.symbolNameMalayalam || previewPayload.candidate?.partyNameMalayalam || previewPayload.candidate?.nameMalayalam || previewPayload.candidate?.symbolName || previewPayload.candidate?.name || ''
            });

            order.pdfPath = `/voter-slips/${slipFileInfo.pdfFileName}`;
            order.pdfGenerated = true;
            order.pdfGeneratedAt = new Date();
            await order.save();

            return res.json({
                status: 'success',
                electionModule,
                message: 'Assembly PDF regenerated successfully',
                filename: slipFileInfo.pdfFileName,
                size: 'Generated'
            });
        }
        
        console.log(`🔄 ADMIN REGENERATE PDF: Starting for order ${orderId}`);
        
        const order = await Order.findOne({ orderId });
        
        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }
        
        // Delete existing PDF file if it exists
        const permanentPdfDir = path.join(__dirname, '..', 'public', 'permanent-pdfs');
        const pdfFilename = `${orderId}.pdf`;
        const pdfPath = path.join(permanentPdfDir, pdfFilename);
        
        if (fs.existsSync(pdfPath)) {
            console.log(`🗑️ Deleting existing PDF: ${pdfFilename}`);
            fs.unlinkSync(pdfPath);
        }
        
        // Import necessary functions
        const { generateSlipHTML, getBrowser } = await import('./slipController.js');
        
        console.log(`📄 Generating fresh HTML for ${order.voters.length} voters`);
        
        // Generate HTML for ALL slips (no preview mode)
        const html = await generateSlipHTML(order, 0, null);
        
        console.log(`✅ HTML generated, creating PDF...`);
        
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
        
        console.log(`✅ PDF generated (${(pdf.length / 1024 / 1024).toFixed(2)} MB)`);
        
        // Save the new PDF
        if (!fs.existsSync(permanentPdfDir)) {
            fs.mkdirSync(permanentPdfDir, { recursive: true });
        }
        
        fs.writeFileSync(pdfPath, pdf);
        console.log(`💾 PDF saved to: ${pdfPath}`);
        
        // Update order with regeneration timestamp
        order.pdfGeneratedAt = new Date();
        await order.save();
        
        console.log(`🎉 PDF regeneration complete for order ${orderId}`);
        
        res.json({
            status: 'success',
            message: 'PDF regenerated successfully',
            filename: pdfFilename,
            size: `${(pdf.length / 1024 / 1024).toFixed(2)} MB`
        });
        
    } catch (error) {
        console.error('❌ Admin regenerate PDF error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to regenerate PDF',
            error: error.message
        });
    }
};

// Get analytics data
export const getAnalytics = async (req, res) => {
    try {
        const electionModule = await getPrimaryElectionModule();
        const OrderModel = electionModule === 'assembly' ? AssemblyOrder : Order;
        const orderMatch = electionModule === 'assembly' ? { isDeleted: { $ne: true } } : {};

        const recentSelect = electionModule === 'assembly'
            ? 'orderId totalVoters amount paymentStatus createdAt district constituency'
            : 'orderId totalVoters amount paymentStatus createdAt location';

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
            OrderModel.countDocuments(orderMatch),
            OrderModel.countDocuments({ ...orderMatch, paymentStatus: 'completed' }),
            Symbol.countDocuments(),
            Symbol.countDocuments({ isActive: true }),
            
            // Revenue calculation using aggregation (much faster!)
            OrderModel.aggregate([
                { $match: { ...orderMatch, paymentStatus: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            
            // Recent orders
            OrderModel.find(orderMatch)
                .sort({ createdAt: -1 })
                .limit(10)
                .populate('userId', 'name email')
                .select(recentSelect)
                .lean(),
            
            // Orders by month (last 6 months)
            OrderModel.aggregate([
                { 
                    $match: { 
                        ...orderMatch,
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
        const normalizedRecentOrders = recentOrders.map(order => normalizeAdminOrder(order, electionModule));

        res.json({
            status: 'success',
            electionModule,
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
                recentOrders: normalizedRecentOrders,
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
        const electionModule = await getPrimaryElectionModule();
        const OrderModel = electionModule === 'assembly' ? AssemblyOrder : Order;

        let order = await OrderModel.findByIdAndDelete(orderId);
        if (!order) {
            const fallbackModel = electionModule === 'assembly' ? Order : AssemblyOrder;
            order = await fallbackModel.findByIdAndDelete(orderId);
        }

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
        const electionModule = await getPrimaryElectionModule();
        const OrderModel = electionModule === 'assembly' ? AssemblyOrder : Order;

        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Please provide at least one order ID'
            });
        }

        // Delete all specified orders for active module, then fallback model for mixed data.
        const resultPrimary = await OrderModel.deleteMany({ _id: { $in: orderIds } });
        const fallbackModel = electionModule === 'assembly' ? Order : AssemblyOrder;
        const resultFallback = await fallbackModel.deleteMany({ _id: { $in: orderIds } });
        const deletedTotal = (resultPrimary.deletedCount || 0) + (resultFallback.deletedCount || 0);

        console.log(`✅ Deleted ${deletedTotal} orders`);

        res.json({
            status: 'success',
            electionModule,
            message: `Successfully deleted ${deletedTotal} order(s)`,
            deletedCount: deletedTotal,
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

// ============================================
// USER ACTIVITY & SESSION TRACKING
// ============================================

// Get user activity summary
export const getUserActivity = async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50, action } = req.query;

        // Verify user exists
        const user = await User.findById(userId).select('name email');
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        // Build query
        const query = { userId };
        if (action) {
            query.action = action;
        }

        // Get activities
        const activities = await UserActivity.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .lean();

        // Get activity statistics
        const stats = await UserActivity.aggregate([
            { $match: { userId: user._id } },
            {
                $group: {
                    _id: '$action',
                    count: { $sum: 1 },
                    lastActivity: { $max: '$timestamp' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Get total activity count
        const totalActivities = await UserActivity.countDocuments({ userId });

        res.json({
            status: 'success',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email
                },
                activities,
                statistics: stats,
                totalActivities
            }
        });

    } catch (error) {
        console.error('Error fetching user activity:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch user activity',
            error: error.message
        });
    }
};

// Get user sessions with device and location info
export const getUserSessions = async (req, res) => {
    try {
        const { userId } = req.params;
        const { active, limit = 20 } = req.query;

        // Verify user exists
        const user = await User.findById(userId).select('name email');
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        // Build query
        const query = { userId };
        if (active === 'true') {
            query.isActive = true;
        }

        // Get sessions
        const sessions = await UserSession.find(query)
            .sort({ startTime: -1 })
            .limit(parseInt(limit))
            .lean();

        // Calculate session durations
        const sessionsWithDuration = sessions.map(session => {
            const endTime = session.endTime || session.lastActivity || new Date();
            const duration = Math.floor((endTime - session.startTime) / 1000); // in seconds
            
            return {
                ...session,
                duration: {
                    seconds: duration,
                    formatted: formatDuration(duration)
                }
            };
        });

        res.json({
            status: 'success',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email
                },
                sessions: sessionsWithDuration,
                totalSessions: sessions.length
            }
        });

    } catch (error) {
        console.error('Error fetching user sessions:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch user sessions',
            error: error.message
        });
    }
};

// Get detailed activity log for a user (chronological, with all details)
export const getUserActivityLog = async (req, res) => {
    try {
        const { userId } = req.params;
        const { 
            sessionId, 
            startDate, 
            endDate, 
            limit = 100,
            page = 1 
        } = req.query;

        // Verify user exists
        const user = await User.findById(userId).select('name email');
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        // Build query
        const query = { userId };
        
        if (sessionId) {
            query.sessionId = sessionId;
        }

        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get activities with pagination
        const activities = await UserActivity.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Get total count
        const totalActivities = await UserActivity.countDocuments(query);

        // Get session info if sessionId provided
        let sessionInfo = null;
        if (sessionId) {
            sessionInfo = await UserSession.findOne({ sessionId }).lean();
        }

        res.json({
            status: 'success',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email
                },
                session: sessionInfo,
                activities,
                pagination: {
                    total: totalActivities,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(totalActivities / parseInt(limit))
                }
            }
        });

    } catch (error) {
        console.error('Error fetching activity log:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch activity log',
            error: error.message
        });
    }
};

// Get session details with all activities
export const getSessionDetails = async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Get session
        const session = await UserSession.findOne({ sessionId })
            .populate('userId', 'name email')
            .lean();

        if (!session) {
            return res.status(404).json({
                status: 'error',
                message: 'Session not found'
            });
        }

        // Get all activities for this session
        const activities = await UserActivity.find({ sessionId })
            .sort({ timestamp: 1 })
            .lean();

        // Calculate session duration
        const endTime = session.endTime || session.lastActivity || new Date();
        const duration = Math.floor((endTime - session.startTime) / 1000);

        // Get activity summary
        const activitySummary = activities.reduce((acc, activity) => {
            acc[activity.action] = (acc[activity.action] || 0) + 1;
            return acc;
        }, {});

        res.json({
            status: 'success',
            data: {
                session: {
                    ...session,
                    duration: {
                        seconds: duration,
                        formatted: formatDuration(duration)
                    }
                },
                activities,
                activitySummary,
                totalActivities: activities.length
            }
        });

    } catch (error) {
        console.error('Error fetching session details:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch session details',
            error: error.message
        });
    }
};

// Get all active sessions
export const getAllActiveSessions = async (req, res) => {
    try {
        // Get recent sessions (within last 30 minutes)
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        
        const recentSessions = await UserSession.find({ 
            isActive: true,
            $or: [
                { lastHeartbeat: { $gte: thirtyMinutesAgo } },
                { lastActivity: { $gte: thirtyMinutesAgo } }
            ]
        })
        .populate('userId', 'name email role')
        .sort({ lastHeartbeat: -1, lastActivity: -1 })
        .lean();

        const sessionsWithInfo = recentSessions.map(session => {
            const duration = Math.floor((new Date() - session.startTime) / 1000);
            const lastHeartbeat = session.lastHeartbeat || session.lastActivity;
            const timeSinceHeartbeat = Math.floor((new Date() - lastHeartbeat) / 1000);
            
            // User is truly online if:
            // 1. They have a recent heartbeat (within 2 minutes)
            // 2. Their page is visible (not just background tab)
            const isTrulyOnline = lastHeartbeat >= twoMinutesAgo && 
                                session.isPageVisible !== false;
            
            return {
                ...session,
                duration: {
                    seconds: duration,
                    formatted: formatDuration(duration)
                },
                idleTime: {
                    seconds: timeSinceHeartbeat,
                    formatted: formatDuration(timeSinceHeartbeat)
                },
                isTrulyOnline,
                onlineStatus: isTrulyOnline ? 'online' : 'away'
            };
        });

        // Only return sessions that have some recent activity
        const activeSessions = sessionsWithInfo.filter(session => {
            const lastHeartbeat = session.lastHeartbeat || session.lastActivity;
            return lastHeartbeat >= thirtyMinutesAgo;
        });

        // Separate truly online vs away sessions
        const onlineSessions = activeSessions.filter(s => s.isTrulyOnline);
        const awaySessions = activeSessions.filter(s => !s.isTrulyOnline);

        res.json({
            status: 'success',
            data: {
                sessions: activeSessions,
                onlineSessions,
                awaySessions,
                totalActiveSessions: activeSessions.length,
                trulyOnlineSessions: onlineSessions.length,
                awaySessions: awaySessions.length
            }
        });

    } catch (error) {
        console.error('Error fetching active sessions:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch active sessions',
            error: error.message
        });
    }
};

// Get recent activity feed for admin dashboard
export const getRecentActivity = async (req, res) => {
    try {
        const { limit = 50, hours = 24 } = req.query;
        
        // Get activities from the last N hours
        const hoursAgo = new Date(Date.now() - (parseInt(hours) * 60 * 60 * 1000));
        
        // Import UserActivity model
        const { default: UserActivity } = await import('../models/UserActivity.js');
        
        const activities = await UserActivity.find({
            timestamp: { $gte: hoursAgo }
        })
        .populate('userId', 'name email username')
        .sort({ timestamp: -1 })
        .limit(parseInt(limit))
        .lean();

        // Format activities for the frontend
        const formattedActivities = activities.map(activity => ({
            id: activity._id,
            type: activity.action,
            user: {
                id: activity.userId?._id,
                name: activity.userId?.name || activity.userId?.username || 'Unknown User',
                email: activity.userId?.email || ''
            },
            action: getActionLabel(activity.action),
            details: activity.details || {},
            page: activity.page || {},
            timestamp: activity.timestamp,
            metadata: activity.metadata || {},
            sessionId: activity.sessionId
        }));

        res.json({
            status: 'success',
            data: {
                activities: formattedActivities,
                totalActivities: formattedActivities.length,
                timeRange: `Last ${hours} hours`
            }
        });

    } catch (error) {
        console.error('Error fetching recent activity:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch recent activity',
            error: error.message
        });
    }
};

// Helper function to get user-friendly action labels
function getActionLabel(action) {
    const actionLabels = {
        'login': 'Logged in',
        'logout': 'Logged out',
        'register': 'Registered account',
        'page_view': 'Viewed page',
        'dashboard_view': 'Viewed dashboard',
        'create_slip_view': 'Opened slip creator',
        'preview_view': 'Previewed slip',
        'form_data_loaded': 'Loaded form data',
        'district_selected': 'Selected district',
        'local_body_selected': 'Selected local body',
        'ward_selected': 'Selected ward',
        'polling_station_selected': 'Selected polling station',
        'voter_list_extracted': 'Extracted voter list',
        'symbol_selected': 'Selected symbol',
        'slip_data_entered': 'Entered slip data',
        'preview_generated': 'Generated preview',
        'order_created': 'Created order',
        'payment_initiated': 'Initiated payment',
        'payment_success': 'Payment successful',
        'payment_failed': 'Payment failed',
        'pdf_downloaded': 'Downloaded PDF',
        'profile_updated': 'Updated profile',
        'contact_form_submitted': 'Submitted contact form',
        'error_occurred': 'Encountered error',
        'button_clicked': 'Clicked button',
        'form_submitted': 'Submitted form',
        'dropdown_selected': 'Selected option',
        'input_changed': 'Modified input',
        'checkbox_toggled': 'Toggled checkbox',
        'radio_selected': 'Selected radio option',
        'search_performed': 'Performed search',
        'file_uploaded': 'Uploaded file',
        'export_data': 'Exported data',
        'filter_applied': 'Applied filter'
    };
    
    return actionLabels[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Helper function to format duration
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

// Get User-wise Reports (Revenue, Orders, Slips)
export const getUserReports = async (req, res) => {
    try {
        const { startDate, endDate, sortBy = 'revenue', order = 'desc' } = req.query;
        const electionModule = await getPrimaryElectionModule();
        const OrderModel = electionModule === 'assembly' ? AssemblyOrder : Order;

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        const reportMatch = electionModule === 'assembly'
            ? { paymentStatus: 'completed', isDeleted: { $ne: true }, ...dateFilter }
            : { paymentStatus: 'completed', ...dateFilter };

        // Aggregate user-wise statistics
        const userStats = await OrderModel.aggregate([
            { $match: reportMatch },
            {
                $group: {
                    _id: '$userId',
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$amount' },
                    totalVoterSlips: { $sum: '$totalVoters' },
                    avgOrderValue: { $avg: '$amount' },
                    firstOrderDate: { $min: '$createdAt' },
                    lastOrderDate: { $max: '$createdAt' },
                    pendingOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    completedOrders: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            { $unwind: '$userInfo' },
            {
                $project: {
                    userId: '$_id',
                    name: '$userInfo.name',
                    email: '$userInfo.email',
                    phone: '$userInfo.phone',
                    isActive: '$userInfo.isActive',
                    customPricing: '$userInfo.customPricing',
                    totalOrders: 1,
                    totalRevenue: { $round: ['$totalRevenue', 2] },
                    totalVoterSlips: 1,
                    avgOrderValue: { $round: ['$avgOrderValue', 2] },
                    firstOrderDate: 1,
                    lastOrderDate: 1,
                    pendingOrders: 1,
                    completedOrders: 1
                }
            }
        ]);

        // Sort results
        const sortField = {
            'revenue': 'totalRevenue',
            'orders': 'totalOrders',
            'slips': 'totalVoterSlips',
            'avgOrder': 'avgOrderValue',
            'recent': 'lastOrderDate'
        }[sortBy] || 'totalRevenue';

        const sortDirection = order === 'asc' ? 1 : -1;
        userStats.sort((a, b) => {
            const aVal = a[sortField];
            const bVal = b[sortField];
            return (aVal > bVal ? 1 : -1) * sortDirection;
        });

        // Calculate summary statistics
        const summary = {
            totalUsers: userStats.length,
            totalRevenue: userStats.reduce((sum, u) => sum + u.totalRevenue, 0),
            totalOrders: userStats.reduce((sum, u) => sum + u.totalOrders, 0),
            totalVoterSlips: userStats.reduce((sum, u) => sum + u.totalVoterSlips, 0),
            avgRevenuePerUser: userStats.length > 0 
                ? userStats.reduce((sum, u) => sum + u.totalRevenue, 0) / userStats.length 
                : 0,
            avgOrdersPerUser: userStats.length > 0 
                ? userStats.reduce((sum, u) => sum + u.totalOrders, 0) / userStats.length 
                : 0,
            avgSlipsPerUser: userStats.length > 0 
                ? userStats.reduce((sum, u) => sum + u.totalVoterSlips, 0) / userStats.length 
                : 0
        };

        // Round summary values
        summary.totalRevenue = Math.round(summary.totalRevenue * 100) / 100;
        summary.avgRevenuePerUser = Math.round(summary.avgRevenuePerUser * 100) / 100;
        summary.avgOrdersPerUser = Math.round(summary.avgOrdersPerUser * 100) / 100;
        summary.avgSlipsPerUser = Math.round(summary.avgSlipsPerUser * 100) / 100;

        res.json({
            status: 'success',
            electionModule,
            data: {
                users: userStats,
                summary,
                filters: {
                    startDate: startDate || null,
                    endDate: endDate || null,
                    sortBy,
                    order
                }
            }
        });
    } catch (error) {
        console.error('Get user reports error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch user reports',
            error: error.message
        });
    }
};

// Get District-wise Analytics Report
export const getDistrictReport = async (req, res) => {
    try {
        const { startDate, endDate, sortBy = 'totalRevenue', order = 'desc' } = req.query;
        const electionModule = await getPrimaryElectionModule();

        if (electionModule === 'assembly') {
            const dateFilter = {};
            if (startDate || endDate) {
                dateFilter.createdAt = {};
                if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    dateFilter.createdAt.$lte = end;
                }
            }

            const districtStats = await AssemblyOrder.aggregate([
                {
                    $match: {
                        paymentStatus: 'completed',
                        isDeleted: { $ne: true },
                        ...dateFilter
                    }
                },
                {
                    $group: {
                        _id: '$district',
                        totalOrders: { $sum: 1 },
                        totalRevenue: { $sum: '$amount' },
                        totalVoterSlips: { $sum: '$totalVoters' },
                        constituencies: { $addToSet: '$constituency' }
                    }
                },
                {
                    $project: {
                        district: '$_id',
                        totalOrders: 1,
                        totalRevenue: { $round: ['$totalRevenue', 2] },
                        totalVoterSlips: 1,
                        totalLocalBodies: { $size: '$constituencies' },
                        totalWards: { $literal: 0 },
                        avgRevenuePerOrder: { $round: [{ $divide: ['$totalRevenue', '$totalOrders'] }, 2] },
                        avgSlipsPerOrder: { $round: [{ $divide: ['$totalVoterSlips', '$totalOrders'] }, 0] }
                    }
                },
                { $sort: { [sortBy]: order === 'desc' ? -1 : 1 } }
            ]);

            const summary = {
                totalDistricts: districtStats.length,
                totalRevenue: districtStats.reduce((sum, d) => sum + d.totalRevenue, 0),
                totalOrders: districtStats.reduce((sum, d) => sum + d.totalOrders, 0),
                totalVoterSlips: districtStats.reduce((sum, d) => sum + d.totalVoterSlips, 0),
                totalWards: 0,
                totalLocalBodies: districtStats.reduce((sum, d) => sum + d.totalLocalBodies, 0)
            };
            summary.totalRevenue = Math.round(summary.totalRevenue * 100) / 100;

            return res.json({
                status: 'success',
                electionModule,
                data: {
                    districts: districtStats,
                    summary,
                    filters: {
                        startDate: startDate || null,
                        endDate: endDate || null,
                        sortBy,
                        order
                    }
                }
            });
        }

        // District name mapping (Malayalam to English)
        const districtMapping = {
            'തിരുവനന്തപുരം': 'Thiruvananthapuram',
            'കൊല്ലം': 'Kollam',
            'പത്തനംതിട്ട': 'Pathanamthitta',
            'ആലപ്പുഴ': 'Alappuzha',
            'കോട്ടയം': 'Kottayam',
            'ഇടുക്കി': 'Idukki',
            'എറണാകുളം': 'Ernakulam',
            'തൃശ്ശൂർ': 'Thrissur',
            'പാലക്കാട്': 'Palakkad',
            'മലപ്പുറം': 'Malappuram',
            'കോഴിക്കോട്': 'Kozhikode',
            'വയനാട്': 'Wayanad',
            'കണ്ണൂർ': 'Kannur',
            'കാസർഗോഡ്': 'Kasaragod'
        };

        // Build date filter
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateFilter.createdAt.$lte = end;
            }
        }

        // Aggregate by district (normalize district names to merge Malayalam and English)
        const districtStats = await Order.aggregate([
            {
                $match: {
                    paymentStatus: 'completed',
                    ...dateFilter
                }
            },
            {
                $addFields: {
                    normalizedDistrict: {
                        $let: {
                            vars: {
                                // Extract first part before "/" if it exists, otherwise use full string
                                firstPart: {
                                    $trim: {
                                        input: {
                                            $arrayElemAt: [
                                                { $split: [{ $ifNull: ['$location.district', ''] }, '/'] },
                                                0
                                            ]
                                        }
                                    }
                                }
                            },
                            in: {
                                $switch: {
                                    branches: [
                                        // English versions (case-insensitive)
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'thiruvananthapuram'] }, then: 'Thiruvananthapuram' },
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'kollam'] }, then: 'Kollam' },
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'pathanamthitta'] }, then: 'Pathanamthitta' },
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'alappuzha'] }, then: 'Alappuzha' },
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'kottayam'] }, then: 'Kottayam' },
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'idukki'] }, then: 'Idukki' },
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'ernakulam'] }, then: 'Ernakulam' },
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'thrissur'] }, then: 'Thrissur' },
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'palakkad'] }, then: 'Palakkad' },
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'malappuram'] }, then: 'Malappuram' },
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'kozhikode'] }, then: 'Kozhikode' },
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'wayanad'] }, then: 'Wayanad' },
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'kannur'] }, then: 'Kannur' },
                                        { case: { $eq: [{ $toLower: '$$firstPart' }, 'kasaragod'] }, then: 'Kasaragod' },
                                        // Malayalam versions
                                        { case: { $eq: ['$$firstPart', 'തിരുവനന്തപുരം'] }, then: 'Thiruvananthapuram' },
                                        { case: { $eq: ['$$firstPart', 'കൊല്ലം'] }, then: 'Kollam' },
                                        { case: { $eq: ['$$firstPart', 'പത്തനംതിട്ട'] }, then: 'Pathanamthitta' },
                                        { case: { $eq: ['$$firstPart', 'ആലപ്പുഴ'] }, then: 'Alappuzha' },
                                        { case: { $eq: ['$$firstPart', 'കോട്ടയം'] }, then: 'Kottayam' },
                                        { case: { $eq: ['$$firstPart', 'ഇടുക്കി'] }, then: 'Idukki' },
                                        { case: { $eq: ['$$firstPart', 'എറണാകുളം'] }, then: 'Ernakulam' },
                                        { case: { $eq: ['$$firstPart', 'തൃശ്ശൂര്‍'] }, then: 'Thrissur' },
                                        { case: { $eq: ['$$firstPart', 'തൃശ്ശൂർ'] }, then: 'Thrissur' },
                                        { case: { $eq: ['$$firstPart', 'പാലക്കാട്'] }, then: 'Palakkad' },
                                        { case: { $eq: ['$$firstPart', 'മലപ്പുറം'] }, then: 'Malappuram' },
                                        { case: { $eq: ['$$firstPart', 'കോഴിക്കോട്'] }, then: 'Kozhikode' },
                                        { case: { $eq: ['$$firstPart', 'വയനാട്'] }, then: 'Wayanad' },
                                        { case: { $eq: ['$$firstPart', 'കണ്ണൂര്‍'] }, then: 'Kannur' },
                                        { case: { $eq: ['$$firstPart', 'കണ്ണൂർ'] }, then: 'Kannur' },
                                        { case: { $eq: ['$$firstPart', 'കാസറഗോഡ്'] }, then: 'Kasaragod' },
                                        { case: { $eq: ['$$firstPart', 'കാസർഗോഡ്'] }, then: 'Kasaragod' }
                                    ],
                                    default: '$$firstPart'
                                }
                            }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$normalizedDistrict',
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$amount' },
                    totalVoterSlips: { $sum: '$voterCount' },
                    totalWards: { $addToSet: '$location.ward' },
                    localBodies: { $addToSet: '$location.localBody' }
                }
            },
            {
                $project: {
                    district: '$_id',
                    totalOrders: 1,
                    totalRevenue: { $round: ['$totalRevenue', 2] },
                    totalVoterSlips: 1,
                    totalWards: { $size: '$totalWards' },
                    totalLocalBodies: { $size: '$localBodies' },
                    avgRevenuePerOrder: { 
                        $round: [{ $divide: ['$totalRevenue', '$totalOrders'] }, 2] 
                    },
                    avgSlipsPerOrder: { 
                        $round: [{ $divide: ['$totalVoterSlips', '$totalOrders'] }, 0] 
                    }
                }
            },
            {
                $sort: { [sortBy]: order === 'desc' ? -1 : 1 }
            }
        ]);

        // Calculate summary
        const summary = {
            totalDistricts: districtStats.length,
            totalRevenue: districtStats.reduce((sum, d) => sum + d.totalRevenue, 0),
            totalOrders: districtStats.reduce((sum, d) => sum + d.totalOrders, 0),
            totalVoterSlips: districtStats.reduce((sum, d) => sum + d.totalVoterSlips, 0),
            totalWards: districtStats.reduce((sum, d) => sum + d.totalWards, 0),
            totalLocalBodies: districtStats.reduce((sum, d) => sum + d.totalLocalBodies, 0)
        };

        summary.totalRevenue = Math.round(summary.totalRevenue * 100) / 100;

        res.json({
            status: 'success',
            data: {
                districts: districtStats,
                summary,
                filters: {
                    startDate: startDate || null,
                    endDate: endDate || null,
                    sortBy,
                    order
                }
            }
        });
    } catch (error) {
        console.error('Get district report error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch district report',
            error: error.message
        });
    }
};

// Get Symbol-wise Analytics Report
export const getSymbolReport = async (req, res) => {
    try {
        const { startDate, endDate, sortBy = 'usageCount', order = 'desc' } = req.query;
        const electionModule = await getPrimaryElectionModule();

        if (electionModule === 'assembly') {
            const dateFilter = {};
            if (startDate || endDate) {
                dateFilter.createdAt = {};
                if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    dateFilter.createdAt.$lte = end;
                }
            }

            const symbolStats = await AssemblyOrder.aggregate([
                {
                    $match: {
                        paymentStatus: 'completed',
                        isDeleted: { $ne: true },
                        ...dateFilter
                    }
                },
                {
                    $addFields: {
                        symbolKey: {
                            $ifNull: ['$customization.partyName', 'No Symbol']
                        },
                        symbolImage: {
                            $ifNull: ['$customization.partyLogo', '']
                        }
                    }
                },
                {
                    $group: {
                        _id: '$symbolKey',
                        usageCount: { $sum: 1 },
                        totalRevenue: { $sum: '$amount' },
                        totalVoterSlips: { $sum: '$totalVoters' },
                        districts: { $addToSet: '$district' },
                        constituencies: { $addToSet: '$constituency' },
                        symbolImage: { $first: '$symbolImage' }
                    }
                },
                {
                    $project: {
                        symbolId: '$_id',
                        symbolName: '$_id',
                        symbolMalayalamName: '',
                        symbolImage: 1,
                        usageCount: 1,
                        totalRevenue: { $round: ['$totalRevenue', 2] },
                        totalVoterSlips: 1,
                        districtsCount: { $size: '$districts' },
                        localBodiesCount: { $size: '$constituencies' },
                        avgRevenuePerOrder: { $round: [{ $divide: ['$totalRevenue', '$usageCount'] }, 2] },
                        avgSlipsPerOrder: { $round: [{ $divide: ['$totalVoterSlips', '$usageCount'] }, 0] }
                    }
                },
                { $sort: { [sortBy]: order === 'desc' ? -1 : 1 } }
            ]);

            const summary = {
                totalSymbolsUsed: symbolStats.length,
                totalRevenue: symbolStats.reduce((sum, s) => sum + s.totalRevenue, 0),
                totalOrders: symbolStats.reduce((sum, s) => sum + s.usageCount, 0),
                totalVoterSlips: symbolStats.reduce((sum, s) => sum + s.totalVoterSlips, 0)
            };
            summary.totalRevenue = Math.round(summary.totalRevenue * 100) / 100;

            return res.json({
                status: 'success',
                electionModule,
                data: {
                    symbols: symbolStats,
                    summary,
                    filters: {
                        startDate: startDate || null,
                        endDate: endDate || null,
                        sortBy,
                        order
                    }
                }
            });
        }

        // Build date filter
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateFilter.createdAt.$lte = end;
            }
        }

        // Get all symbols
        const symbols = await Symbol.find({ isActive: true }).select('name malayalamName imagePath');
        const symbolMap = {};
        symbols.forEach(symbol => {
            symbolMap[symbol._id.toString()] = {
                name: symbol.name,
                malayalamName: symbol.malayalamName,
                imagePath: symbol.imagePath
            };
        });

        // Aggregate by symbol
        const symbolStats = await Order.aggregate([
            {
                $match: {
                    paymentStatus: 'completed',
                    symbolId: { $exists: true, $ne: null },
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: '$symbolId',
                    usageCount: { $sum: 1 },
                    totalRevenue: { $sum: '$amount' },
                    totalVoterSlips: { $sum: '$voterCount' },
                    districts: { $addToSet: '$location.district' },
                    localBodies: { $addToSet: '$location.localBody' }
                }
            },
            {
                $project: {
                    symbolId: '$_id',
                    usageCount: 1,
                    totalRevenue: { $round: ['$totalRevenue', 2] },
                    totalVoterSlips: 1,
                    districtsCount: { $size: '$districts' },
                    localBodiesCount: { $size: '$localBodies' },
                    avgRevenuePerOrder: { 
                        $round: [{ $divide: ['$totalRevenue', '$usageCount'] }, 2] 
                    },
                    avgSlipsPerOrder: { 
                        $round: [{ $divide: ['$totalVoterSlips', '$usageCount'] }, 0] 
                    }
                }
            },
            {
                $sort: { [sortBy]: order === 'desc' ? -1 : 1 }
            }
        ]);

        // Enrich with symbol details
        const enrichedStats = symbolStats.map(stat => ({
            ...stat,
            symbolName: symbolMap[stat.symbolId.toString()]?.name || 'Unknown',
            symbolMalayalamName: symbolMap[stat.symbolId.toString()]?.malayalamName || '',
            symbolImage: symbolMap[stat.symbolId.toString()]?.imagePath || ''
        }));

        // Calculate summary
        const summary = {
            totalSymbolsUsed: symbolStats.length,
            totalRevenue: symbolStats.reduce((sum, s) => sum + s.totalRevenue, 0),
            totalOrders: symbolStats.reduce((sum, s) => sum + s.usageCount, 0),
            totalVoterSlips: symbolStats.reduce((sum, s) => sum + s.totalVoterSlips, 0),
            mostUsedSymbol: enrichedStats[0]?.symbolName || 'N/A',
            highestRevenueSymbol: [...enrichedStats].sort((a, b) => b.totalRevenue - a.totalRevenue)[0]?.symbolName || 'N/A'
        };

        summary.totalRevenue = Math.round(summary.totalRevenue * 100) / 100;

        res.json({
            status: 'success',
            data: {
                symbols: enrichedStats,
                summary,
                filters: {
                    startDate: startDate || null,
                    endDate: endDate || null,
                    sortBy,
                    order
                }
            }
        });
    } catch (error) {
        console.error('Get symbol report error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch symbol report',
            error: error.message
        });
    }
};

// Get Detailed Report for a Specific District
export const getDistrictDetailedReport = async (req, res) => {
    try {
        const { districtName } = req.params;
        console.log('📍 District Detail Request for:', districtName);
        const { startDate, endDate, sortBy = 'totalRevenue', order = 'desc' } = req.query;

        // Build date filter
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateFilter.createdAt.$lte = end;
            }
        }

        // District name variations for matching
        const districtVariations = [
            districtName,
            `${districtName} / `,  // Matches "Kottayam / കോട്ടയം"
            new RegExp(`^${districtName}\\s*/`, 'i')  // Case-insensitive with /
        ];

        // Get local body level aggregation
        const localBodyStats = await Order.aggregate([
            {
                $match: {
                    paymentStatus: 'completed',
                    $or: [
                        { 'location.district': { $regex: `^${districtName}`, $options: 'i' } },
                        { 'location.district': { $regex: `/${districtName}$`, $options: 'i' } }
                    ],
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: {
                        localBody: '$location.localBody',
                        ward: '$location.ward'
                    },
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$amount' },
                    totalVoterSlips: { $sum: '$voterCount' },
                    users: { $addToSet: '$userId' }
                }
            },
            {
                $group: {
                    _id: '$_id.localBody',
                    wards: {
                        $push: {
                            ward: '$_id.ward',
                            totalOrders: '$totalOrders',
                            totalRevenue: '$totalRevenue',
                            totalVoterSlips: '$totalVoterSlips',
                            uniqueUsers: { $size: '$users' }
                        }
                    },
                    totalOrders: { $sum: '$totalOrders' },
                    totalRevenue: { $sum: '$totalRevenue' },
                    totalVoterSlips: { $sum: '$totalVoterSlips' },
                    totalWards: { $sum: 1 }
                }
            },
            {
                $project: {
                    localBody: '$_id',
                    wards: 1,
                    totalOrders: 1,
                    totalRevenue: { $round: ['$totalRevenue', 2] },
                    totalVoterSlips: 1,
                    totalWards: 1,
                    avgRevenuePerOrder: {
                        $round: [{ $divide: ['$totalRevenue', '$totalOrders'] }, 2]
                    },
                    avgSlipsPerOrder: {
                        $round: [{ $divide: ['$totalVoterSlips', '$totalOrders'] }, 0]
                    }
                }
            },
            {
                $sort: { [sortBy]: order === 'desc' ? -1 : 1 }
            }
        ]);

        // Get district summary
        const districtSummary = await Order.aggregate([
            {
                $match: {
                    paymentStatus: 'completed',
                    $or: [
                        { 'location.district': { $regex: `^${districtName}`, $options: 'i' } },
                        { 'location.district': { $regex: `/${districtName}$`, $options: 'i' } }
                    ],
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$amount' },
                    totalVoterSlips: { $sum: '$voterCount' },
                    uniqueUsers: { $addToSet: '$userId' },
                    uniqueWards: { $addToSet: '$location.ward' },
                    uniqueLocalBodies: { $addToSet: '$location.localBody' },
                    symbols: { $addToSet: '$symbolId' }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalOrders: 1,
                    totalRevenue: { $round: ['$totalRevenue', 2] },
                    totalVoterSlips: 1,
                    uniqueUsers: { $size: '$uniqueUsers' },
                    uniqueWards: { $size: '$uniqueWards' },
                    uniqueLocalBodies: { $size: '$uniqueLocalBodies' },
                    uniqueSymbols: { $size: '$symbols' },
                    avgRevenuePerOrder: {
                        $round: [{ $divide: ['$totalRevenue', '$totalOrders'] }, 2]
                    },
                    avgSlipsPerOrder: {
                        $round: [{ $divide: ['$totalVoterSlips', '$totalOrders'] }, 0]
                    }
                }
            }
        ]);

        res.json({
            status: 'success',
            data: {
                district: districtName,
                summary: districtSummary[0] || {},
                localBodies: localBodyStats,
                filters: {
                    startDate: startDate || null,
                    endDate: endDate || null,
                    sortBy,
                    order
                }
            }
        });
    } catch (error) {
        console.error('Get district detailed report error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch district detailed report',
            error: error.message
        });
    }
};

// Update Admin Password
export const updateAdminPassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        // Validation
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                status: 'error',
                message: 'Current password and new password are required'
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({
                status: 'error',
                message: 'New password must be at least 6 characters'
            });
        }
        
        // Get admin user from database
        const admin = await User.findById(req.user.userId);
        
        if (!admin) {
            return res.status(404).json({
                status: 'error',
                message: 'Admin user not found'
            });
        }
        
        // Verify current password
        const isPasswordValid = await admin.comparePassword(currentPassword);
        
        if (!isPasswordValid) {
            return res.status(401).json({
                status: 'error',
                message: 'Current password is incorrect'
            });
        }
        
        // Update password
        admin.password = newPassword;
        await admin.save();
        
        res.json({
            status: 'success',
            message: 'Password updated successfully'
        });
        
    } catch (error) {
        console.error('Update admin password error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update password',
            error: error.message
        });
    }
};



