import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Order from '../models/Order.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get PDF storage directories
const getPDFDirectory = () => {
    return path.join(process.cwd(), 'public', 'permanent-pdfs');
};

const getTempPDFDirectory = () => {
    return path.join(process.cwd(), 'public', 'temp-pdfs');
};

// List all PDFs with metadata
export const listPDFs = async (req, res) => {
    try {
        const pdfDir = getPDFDirectory();
        const tempPdfDir = getTempPDFDirectory();
        
        // Ensure directories exist
        if (!fs.existsSync(pdfDir)) {
            fs.mkdirSync(pdfDir, { recursive: true });
        }
        if (!fs.existsSync(tempPdfDir)) {
            fs.mkdirSync(tempPdfDir, { recursive: true });
        }

        // Read permanent PDF files
        const permanentFiles = fs.readdirSync(pdfDir).filter(file => file.endsWith('.pdf'));
        
        // Read temporary PDF files
        const tempFiles = fs.readdirSync(tempPdfDir).filter(file => file.endsWith('.pdf'));
        
        // Get all order IDs from database
        const orders = await Order.find({}, 'orderId').lean();
        const orderIds = new Set(orders.map(o => o.orderId));

        // Process permanent PDF files
        const permanentPdfs = permanentFiles.map(fileName => {
            const filePath = path.join(pdfDir, fileName);
            const stats = fs.statSync(filePath);
            const orderId = fileName.replace('.pdf', '');
            
            return {
                orderId,
                fileName,
                size: stats.size,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
                hasOrder: orderIds.has(orderId),
                type: 'permanent'
            };
        });

        // Process temporary PDF files
        const tempPdfs = tempFiles.map(fileName => {
            const filePath = path.join(tempPdfDir, fileName);
            const stats = fs.statSync(filePath);
            const orderId = fileName.replace('-preview.pdf', '');
            
            return {
                orderId,
                fileName,
                size: stats.size,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
                hasOrder: orderIds.has(orderId),
                type: 'temporary'
            };
        });

        // Combine and sort by creation date (newest first)
        const allPdfs = [...permanentPdfs, ...tempPdfs];
        allPdfs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Calculate statistics
        const stats = {
            total: allPdfs.length,
            permanent: permanentPdfs.length,
            temporary: tempPdfs.length,
            totalSize: allPdfs.reduce((sum, pdf) => sum + pdf.size, 0),
            permanentSize: permanentPdfs.reduce((sum, pdf) => sum + pdf.size, 0),
            temporarySize: tempPdfs.reduce((sum, pdf) => sum + pdf.size, 0),
            linked: allPdfs.filter(p => p.hasOrder).length,
            orphaned: allPdfs.filter(p => !p.hasOrder).length
        };

        res.json({
            status: 'success',
            pdfs: allPdfs,
            stats
        });

    } catch (error) {
        console.error('Error listing PDFs:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to list PDFs',
            error: error.message
        });
    }
};

// Delete a specific PDF
export const deletePDF = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { type } = req.query; // 'permanent' or 'temporary'
        
        let filePath;
        let fileName;
        
        if (type === 'temporary') {
            const tempPdfDir = getTempPDFDirectory();
            fileName = `${orderId}-preview.pdf`;
            filePath = path.join(tempPdfDir, fileName);
        } else {
            const pdfDir = getPDFDirectory();
            fileName = `${orderId}.pdf`;
            filePath = path.join(pdfDir, fileName);
        }

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                status: 'error',
                message: 'PDF file not found'
            });
        }

        // Get file size before deletion
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;

        // Delete the file
        fs.unlinkSync(filePath);

        console.log(`🗑️ Deleted ${type || 'permanent'} PDF: ${fileName} (${(fileSize / 1024).toFixed(2)} KB)`);

        res.json({
            status: 'success',
            message: 'PDF deleted successfully',
            deletedFile: fileName,
            freedSpace: fileSize
        });

    } catch (error) {
        console.error('Error deleting PDF:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to delete PDF',
            error: error.message
        });
    }
};

// Cleanup orphaned PDFs (PDFs without corresponding orders)
export const cleanupOrphanedPDFs = async (req, res) => {
    try {
        const pdfDir = getPDFDirectory();
        const tempPdfDir = getTempPDFDirectory();
        
        // Ensure directories exist
        if (!fs.existsSync(pdfDir)) {
            fs.mkdirSync(pdfDir, { recursive: true });
        }
        if (!fs.existsSync(tempPdfDir)) {
            fs.mkdirSync(tempPdfDir, { recursive: true });
        }

        // Read all PDF files
        const permanentFiles = fs.readdirSync(pdfDir).filter(file => file.endsWith('.pdf'));
        const tempFiles = fs.readdirSync(tempPdfDir).filter(file => file.endsWith('.pdf'));
        
        // Get all order IDs from database
        const orders = await Order.find({}, 'orderId').lean();
        const orderIds = new Set(orders.map(o => o.orderId));

        let deletedCount = 0;
        let freedSpace = 0;

        // Delete orphaned permanent PDFs
        for (const fileName of permanentFiles) {
            const orderId = fileName.replace('.pdf', '');
            
            // If this PDF doesn't have a corresponding order, delete it
            if (!orderIds.has(orderId)) {
                const filePath = path.join(pdfDir, fileName);
                const stats = fs.statSync(filePath);
                
                fs.unlinkSync(filePath);
                deletedCount++;
                freedSpace += stats.size;
                
                console.log(`🗑️ Cleaned up orphaned permanent PDF: ${fileName}`);
            }
        }

        // Delete orphaned temporary PDFs
        for (const fileName of tempFiles) {
            const orderId = fileName.replace('-preview.pdf', '');
            
            // If this PDF doesn't have a corresponding order, delete it
            if (!orderIds.has(orderId)) {
                const filePath = path.join(tempPdfDir, fileName);
                const stats = fs.statSync(filePath);
                
                fs.unlinkSync(filePath);
                deletedCount++;
                freedSpace += stats.size;
                
                console.log(`🗑️ Cleaned up orphaned temporary PDF: ${fileName}`);
            }
        }

        res.json({
            status: 'success',
            message: `Cleanup complete: ${deletedCount} orphaned PDFs deleted`,
            deleted: deletedCount,
            freed: formatBytes(freedSpace)
        });

    } catch (error) {
        console.error('Error cleaning up PDFs:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to cleanup PDFs',
            error: error.message
        });
    }
};

// Helper function to format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
