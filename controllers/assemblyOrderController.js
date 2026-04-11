import AssemblyOrder from '../models/AssemblyOrder.js';
import User from '../models/User.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getPreviewPayloadById } from './assemblyVoterController_v2.js';
import { saveVoterSnippetSlipsToFile } from '../utils/imageSlipGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureAssemblyGoogleDriveUpload(order, pdfFullPath) {
    if (!order || !pdfFullPath || order.googleDriveLink) {
        return order?.googleDriveLink || null;
    }

    try {
        const { uploadToGoogleDrive, isGoogleDriveConfigured } = await import('../utils/googleDrive.js');
        if (!isGoogleDriveConfigured()) {
            console.log('ℹ️ Assembly: Google Drive not configured, skipping upload');
            return null;
        }

        console.log(`📤 Assembly: Uploading ${order.orderId} PDF to Google Drive...`);
        const driveLink = await uploadToGoogleDrive(pdfFullPath, order.orderId);
        if (driveLink) {
            order.googleDriveLink = driveLink;
            await order.save();
            console.log(`✅ Assembly: Google Drive upload successful: ${driveLink}`);
            return driveLink;
        }

        console.warn(`⚠️ Assembly: Google Drive upload returned empty link for ${order.orderId}`);
        return null;
    } catch (driveError) {
        console.error(`❌ Assembly: Google Drive upload error for ${order.orderId}:`, driveError.message);
        return null;
    }
}

// Generate unique assembly order ID
const generateOrderId = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `ASM-${dateStr}-${randomStr}`;
};

// Create new assembly order
export const createOrder = async (req, res) => {
    try {
        const {
            location,
            voters,
            candidate,
            previewId,
            slipFilePdf,
            previewSlipFilePdf
        } = req.body;

        const userId = req.userId;

        if (!location || !voters || !Array.isArray(voters) || voters.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Location and voters array are required'
            });
        }

        // Get user's custom price per voter
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        const totalVoters = voters.length;
        const pricePerVoter = user.pricePerVoter !== undefined ? user.pricePerVoter : 0.50;
        const amount = Math.round(totalVoters * pricePerVoter * 100) / 100;

        const orderId = generateOrderId();

        const order = new AssemblyOrder({
            orderId,
            userId,
            state: location.state || 'Kerala',
            stateCode: location.stateCode || 'S11',
            district: location.district || '',
            districtCode: location.districtCode || '',
            constituency: location.constituency || '',
            constituencyCode: location.constituencyCode || '',
            year: location.year || '',
            rollType: location.rollType || '',
            language: location.language || 'en',
            voters: [], // Voter images stored via previewId, not in DB
            totalVoters,
            previewId: previewId || null,
            selectedParts: (location.selectedParts || []).map(p => ({
                partNumber: p.partNumber || '',
                partName: p.partName || ''
            })),
            amount,
            pricePerVoter,
            customization: {
                partyName: candidate?.symbolName || '',
                partyNameMalayalam: candidate?.symbolNameMalayalam || candidate?.symbolName || '',
                partyLogo: candidate?.symbol || '',
                symbolText: candidate?.symbolName || '',
                symbolTextMalayalam: candidate?.symbolNameMalayalam || candidate?.symbolName || '',
                candidateName: '',
                candidateNameMalayalam: '',
                candidatePhoto: candidate?.candidatePhoto || ''
            },
            paymentStatus: amount === 0 ? 'completed' : 'pending',
            status: amount === 0 ? 'completed' : 'payment_pending',
            paidAt: amount === 0 ? new Date() : null,
            previewPdfPath: previewSlipFilePdf || slipFilePdf || null,
            pdfPath: slipFilePdf || null,
            pdfGenerated: !!slipFilePdf,
            pdfGeneratedAt: slipFilePdf ? new Date() : null
        });

        await order.save();

        console.log(`✅ Assembly order created: ${orderId} with ${totalVoters} voters, amount: ₹${amount}`);

        res.status(201).json({
            status: 'success',
            message: 'Assembly order created successfully',
            order: {
                id: order._id,
                orderId: order.orderId,
                totalVoters: order.totalVoters,
                amount: order.amount,
                paymentStatus: order.paymentStatus
            }
        });

    } catch (error) {
        console.error('Create assembly order error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create assembly order',
            error: error.message
        });
    }
};

// Get all assembly orders for logged-in user
export const getUserOrders = async (req, res) => {
    try {
        const userId = req.userId;

        const orders = await AssemblyOrder.find({ userId, isDeleted: { $ne: true } })
            .select('-voters -__v')
            .sort({ createdAt: -1 })
            .lean();

        res.json(orders.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            customization: {
                partyName: order.customization?.partyName || '-',
                partyLogo: order.customization?.partyLogo || ''
            },
            location: {
                district: order.district,
                districtName: order.district,
                localBody: order.constituency,
                localBodyName: order.constituency,
                ward: order.constituencyCode,
                wardName: order.constituency,
                selectedParts: Array.isArray(order.selectedParts)
                    ? order.selectedParts.map(part => ({
                        partNumber: part?.partNumber || '',
                        partName: part?.partName || ''
                    }))
                    : []
            },
            voterCount: order.totalVoters,
            amount: order.amount,
            paymentStatus: order.paymentStatus,
            createdAt: order.createdAt,
            paidAt: order.paidAt,
            downloadCount: order.downloadCount || 0
        })));

    } catch (error) {
        console.error('Get assembly orders error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to get orders',
            error: error.message
        });
    }
};

// Get single assembly order details
export const getOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.userId;
        const userRole = req.userRole;

        const query = { orderId };
        if (userRole !== 'admin') {
            query.userId = userId;
        }

        const order = await AssemblyOrder.findOne(query).lean().select('-__v');

        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found or access denied'
            });
        }

        if (order.paymentStatus === 'completed') {
            res.set('Cache-Control', 'private, max-age=3600');
        }

        res.json({
            status: 'success',
            order
        });

    } catch (error) {
        console.error('Get assembly order error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to get order',
            error: error.message
        });
    }
};

// Get assembly order statistics
export const getOrderStats = async (req, res) => {
    try {
        const userId = req.userId;

        const totalOrders = await AssemblyOrder.countDocuments({ userId, isDeleted: { $ne: true } });
        const completedOrders = await AssemblyOrder.countDocuments({ userId, paymentStatus: 'completed', isDeleted: { $ne: true } });

        const stats = await AssemblyOrder.aggregate([
            { $match: { userId: userId, isDeleted: { $ne: true } } },
            {
                $group: {
                    _id: '$paymentStatus',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    totalVoters: { $sum: '$totalVoters' }
                }
            }
        ]);

        let totalVoters = 0;
        let totalAmount = 0;

        stats.forEach(stat => {
            totalVoters += stat.totalVoters;
            if (stat._id === 'completed') {
                totalAmount += stat.totalAmount;
            }
        });

        res.json({
            totalOrders,
            completedOrders,
            totalVoters,
            totalAmount
        });

    } catch (error) {
        console.error('Get assembly stats error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to get statistics',
            error: error.message
        });
    }
};

// Complete assembly order (free or admin bypass)
export const completeFreeOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.userId;
        const userRole = req.userRole;

        const query = { orderId };
        // Non-admin users can only complete their own orders
        if (userRole !== 'admin') {
            query.userId = userId;
        }

        const order = await AssemblyOrder.findOne(query);

        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }

        // Only block non-admin users from completing paid orders
        if (order.amount > 0 && userRole !== 'admin') {
            return res.status(400).json({
                status: 'error',
                message: 'This order requires payment. Amount due: ₹' + order.amount.toFixed(2)
            });
        }

        if (order.paymentStatus === 'completed') {
            return res.json({
                status: 'success',
                message: 'Order already completed',
                order: { orderId: order.orderId, paymentStatus: order.paymentStatus }
            });
        }

        order.paymentStatus = 'completed';
        order.paidAt = new Date();
        order.paymentMethod = 'admin_bypass';
        order.status = 'completed';
        await order.save();

        console.log(`✅ Free assembly order completed: ${orderId}`);

        res.json({
            status: 'success',
            message: 'Order completed successfully',
            order: { orderId: order.orderId, paymentStatus: order.paymentStatus, paidAt: order.paidAt }
        });

    } catch (error) {
        console.error('Complete free assembly order error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to complete order',
            error: error.message
        });
    }
};

// Download assembly order PDF
export const downloadPDF = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.userId;
        const userRole = req.userRole;

        const query = { orderId };
        if (userRole !== 'admin') {
            query.userId = userId;
        }

        const order = await AssemblyOrder.findOne(query);

        if (!order) {
            return res.status(404).json({ status: 'error', message: 'Order not found' });
        }

        if (order.paymentStatus !== 'completed') {
            return res.status(403).json({ status: 'error', message: 'Payment not completed' });
        }

        // If no PDF path stored, try to generate from preview session
        if (!order.pdfPath) {
            console.log(`📄 Order ${orderId} has no pdfPath, attempting to generate from preview session...`);
            
            if (order.previewId) {
                const previewPayload = getPreviewPayloadById(order.previewId);
                if (previewPayload && Array.isArray(previewPayload.voters) && previewPayload.voters.length > 0) {
                    try {
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
                        console.log(`✅ Generated PDF for order ${orderId}: ${order.pdfPath}`);
                    } catch (genErr) {
                        console.error(`❌ Failed to generate PDF for ${orderId}:`, genErr.message);
                        return res.status(500).json({ status: 'error', message: 'Failed to generate PDF. Please re-extract.' });
                    }
                } else {
                    return res.status(404).json({ 
                        status: 'error', 
                        message: 'PDF not available. Preview session expired. Please create a new order.' 
                    });
                }
            } else {
                return res.status(404).json({ status: 'error', message: 'PDF not available for this order' });
            }
        }

        // pdfPath is stored as "/voter-slips/filename.pdf", resolve to absolute via Railway volume
        const railwayVolume = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data/slips';
        const voterSlipsDir = fs.existsSync(railwayVolume)
            ? path.join(railwayVolume, 'voter-slips')
            : path.join(__dirname, '..', 'voter-slips');
        const pdfFullPath = path.join(voterSlipsDir, path.basename(order.pdfPath));

        if (!fs.existsSync(pdfFullPath)) {
            return res.status(404).json({ status: 'error', message: 'PDF file not found on server' });
        }

        // Upload once to Google Drive (if configured) and persist link on assembly order.
        await ensureAssemblyGoogleDriveUpload(order, pdfFullPath);

        // Update download stats
        order.downloadCount = (order.downloadCount || 0) + 1;
        order.lastDownloadAt = new Date();
        await order.save();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="voter-slips-${orderId}.pdf"`);
        
        const fileStream = fs.createReadStream(pdfFullPath);
        fileStream.pipe(res);

    } catch (error) {
        console.error('Download assembly PDF error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to download PDF' });
    }
};
