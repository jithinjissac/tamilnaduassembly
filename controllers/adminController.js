import User from '../models/User.js';
import Symbol from '../models/Symbol.js';
import Order from '../models/Order.js';
import UserActivity from '../models/UserActivity.js';
import UserSession from '../models/UserSession.js';
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
        
        const order = await Order.findOne({ orderId });
        
        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }
        
        // Check if PDF already exists on disk
        const permanentPdfDir = path.join(process.cwd(), 'public', 'permanent-pdfs');
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
        
        console.log(`🔄 ADMIN REGENERATE PDF: Starting for order ${orderId}`);
        
        const order = await Order.findOne({ orderId });
        
        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }
        
        // Delete existing PDF file if it exists
        const permanentPdfDir = path.join(process.cwd(), 'public', 'permanent-pdfs');
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


