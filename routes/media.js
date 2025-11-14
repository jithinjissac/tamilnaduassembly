import express from 'express';
import { listPDFs, deletePDF, cleanupOrphanedPDFs } from '../controllers/mediaController.js';
import auth from '../middleware/auth.js';
import { isAdmin } from '../middleware/adminAuth.js';

const router = express.Router();

// All routes require admin authentication
router.use(auth);
router.use(isAdmin);

// @route   GET /api/admin/media/pdfs
// @desc    List all PDF files with metadata
// @access  Admin only
router.get('/pdfs', listPDFs);

// @route   DELETE /api/admin/media/pdfs/:orderId
// @desc    Delete a specific PDF file
// @access  Admin only
router.delete('/pdfs/:orderId', deletePDF);

// @route   POST /api/admin/media/cleanup
// @desc    Delete all orphaned PDFs (PDFs without orders)
// @access  Admin only
router.post('/cleanup', cleanupOrphanedPDFs);

export default router;
