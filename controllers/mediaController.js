import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Order from '../models/Order.js';
import AssemblyOrder from '../models/AssemblyOrder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get PDF storage directories
const getPDFDirectory = () => {
    return path.join(__dirname, '..', 'public', 'permanent-pdfs');
};

const getTempPDFDirectory = () => {
    return path.join(process.cwd(), 'public', 'temp-pdfs');
};

// Resolve voter-slips directory (Railway volume > GCS mount > local)
const getVoterSlipsDirectory = () => {
    const railwayVolume = process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data/slips';
    if (fs.existsSync(railwayVolume)) {
        return path.join(railwayVolume, 'voter-slips');
    }
    const mountedBucketPath = process.env.GCS_MOUNT_PATH || '/slipsdata';
    if (fs.existsSync(mountedBucketPath)) {
        return path.join(mountedBucketPath, 'voter-slips');
    }
    return path.join(__dirname, '..', 'voter-slips');
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

// Detect file category from filename
function categorizeVoterSlipFile(fileName) {
    if (fileName.endsWith('.zip')) return 'zip';
    if (fileName.endsWith('.html')) return 'html';
    if (fileName.endsWith('.pdf')) {
        if (fileName.startsWith('voter-slips-IMG-')) return 'image-pdf';
        if (fileName.startsWith('assembly-slips-')) return 'assembly-pdf';
        return 'pdf';
    }
    return 'other';
}

// List all files in voter-slips directory
export const listVoterSlips = async (req, res) => {
    try {
        const slipsDir = getVoterSlipsDirectory();
        if (!fs.existsSync(slipsDir)) {
            fs.mkdirSync(slipsDir, { recursive: true });
        }

        // Get all assembly orders to cross-reference filenames
        const assemblyOrders = await AssemblyOrder.find({}, 'orderId pdfPath pdfFileName').lean();
        const linkedFilenames = new Set();
        for (const o of assemblyOrders) {
            if (o.pdfFileName) linkedFilenames.add(o.pdfFileName);
            if (o.pdfPath) linkedFilenames.add(path.basename(o.pdfPath));
        }

        const ALLOWED_EXT = new Set(['.pdf', '.zip', '.html']);
        const entries = fs.readdirSync(slipsDir, { withFileTypes: true });
        const files = [];

        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const ext = path.extname(entry.name).toLowerCase();
            if (!ALLOWED_EXT.has(ext)) continue;

            const filePath = path.join(slipsDir, entry.name);
            const stats = fs.statSync(filePath);
            files.push({
                fileName: entry.name,
                category: categorizeVoterSlipFile(entry.name),
                size: stats.size,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
                linked: linkedFilenames.has(entry.name),
                url: `/voter-slips/${encodeURIComponent(entry.name)}`
            });
        }

        // Sort newest first
        files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const stats = {
            total: files.length,
            pdfs: files.filter(f => f.category === 'pdf' || f.category === 'image-pdf' || f.category === 'assembly-pdf').length,
            zips: files.filter(f => f.category === 'zip').length,
            htmls: files.filter(f => f.category === 'html').length,
            totalSize: files.reduce((s, f) => s + f.size, 0),
            linked: files.filter(f => f.linked).length,
            orphaned: files.filter(f => !f.linked).length
        };

        res.json({ status: 'success', files, stats });
    } catch (error) {
        console.error('Error listing voter information slips:', error);
        res.status(500).json({ status: 'error', message: 'Failed to list voter information slips', error: error.message });
    }
};

// Delete a single voter-slip file by filename
export const deleteVoterSlip = async (req, res) => {
    try {
        const fileName = decodeURIComponent(req.params.fileName);
        // Prevent path traversal
        if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
            return res.status(400).json({ status: 'error', message: 'Invalid filename' });
        }

        const slipsDir = getVoterSlipsDirectory();
        const filePath = path.join(slipsDir, fileName);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ status: 'error', message: 'File not found' });
        }

        const stats = fs.statSync(filePath);
        fs.unlinkSync(filePath);

        console.log(`🗑️ Deleted voter information slip file: ${fileName} (${formatBytes(stats.size)})`);
        res.json({ status: 'success', message: 'File deleted successfully', deletedFile: fileName, freedSpace: stats.size });
    } catch (error) {
        console.error('Error deleting voter information slip:', error);
        res.status(500).json({ status: 'error', message: 'Failed to delete file', error: error.message });
    }
};

// Delete multiple voter-slip files
export const deleteBulkVoterSlips = async (req, res) => {
    try {
        const { fileNames } = req.body;
        if (!Array.isArray(fileNames) || fileNames.length === 0) {
            return res.status(400).json({ status: 'error', message: 'fileNames array required' });
        }

        const slipsDir = getVoterSlipsDirectory();
        let deleted = 0;
        let freed = 0;
        const errors = [];

        for (const rawName of fileNames) {
            const fileName = String(rawName);
            if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
                errors.push({ fileName, error: 'Invalid filename' });
                continue;
            }
            const filePath = path.join(slipsDir, fileName);
            try {
                if (fs.existsSync(filePath)) {
                    const s = fs.statSync(filePath);
                    fs.unlinkSync(filePath);
                    deleted++;
                    freed += s.size;
                } else {
                    errors.push({ fileName, error: 'Not found' });
                }
            } catch (e) {
                errors.push({ fileName, error: e.message });
            }
        }

        res.json({ status: 'success', deleted, freed, errors });
    } catch (error) {
        console.error('Error bulk-deleting voter information slips:', error);
        res.status(500).json({ status: 'error', message: 'Failed to delete files', error: error.message });
    }
};

// Cleanup orphaned voter-slip files (not linked to any assembly order)
export const cleanupOrphanedVoterSlips = async (req, res) => {
    try {
        const slipsDir = getVoterSlipsDirectory();
        if (!fs.existsSync(slipsDir)) {
            return res.json({ status: 'success', deleted: 0, freed: formatBytes(0) });
        }

        const assemblyOrders = await AssemblyOrder.find({}, 'pdfPath pdfFileName').lean();
        const linkedFilenames = new Set();
        for (const o of assemblyOrders) {
            if (o.pdfFileName) linkedFilenames.add(o.pdfFileName);
            if (o.pdfPath) linkedFilenames.add(path.basename(o.pdfPath));
        }

        const ALLOWED_EXT = new Set(['.pdf', '.zip', '.html']);
        const entries = fs.readdirSync(slipsDir, { withFileTypes: true });
        let deleted = 0;
        let freed = 0;

        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const ext = path.extname(entry.name).toLowerCase();
            if (!ALLOWED_EXT.has(ext)) continue;
            if (!linkedFilenames.has(entry.name)) {
                const filePath = path.join(slipsDir, entry.name);
                try {
                    const s = fs.statSync(filePath);
                    fs.unlinkSync(filePath);
                    deleted++;
                    freed += s.size;
                    console.log(`🗑️ Cleaned up orphaned voter information slip: ${entry.name}`);
                } catch (e) { /* skip */ }
            }
        }

        res.json({ status: 'success', message: `Cleanup complete: ${deleted} files deleted`, deleted, freed: formatBytes(freed) });
    } catch (error) {
        console.error('Error cleaning up voter information slips:', error);
        res.status(500).json({ status: 'error', message: 'Failed to cleanup voter information slips', error: error.message });
    }
};
