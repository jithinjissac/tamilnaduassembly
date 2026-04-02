import express from 'express';
import { listPDFs, deletePDF, cleanupOrphanedPDFs, listVoterSlips, deleteVoterSlip, deleteBulkVoterSlips, cleanupOrphanedVoterSlips } from '../controllers/mediaController.js';
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

// ---- Voter Slips (assembly, image-based) ----

// @route   GET /api/admin/media/voter-slips
// @desc    List all files in voter-slips directory (PDFs, ZIPs, HTMLs)
// @access  Admin only
router.get('/voter-slips', listVoterSlips);

// @route   DELETE /api/admin/media/voter-slips/:fileName
// @desc    Delete a single voter-slip file
// @access  Admin only
router.delete('/voter-slips/:fileName', deleteVoterSlip);

// @route   POST /api/admin/media/voter-slips/bulk-delete
// @desc    Delete multiple voter-slip files
// @access  Admin only
router.post('/voter-slips/bulk-delete', deleteBulkVoterSlips);

// @route   POST /api/admin/media/voter-slips/cleanup
// @desc    Delete all orphaned voter-slip files (not linked to any assembly order)
// @access  Admin only
router.post('/voter-slips/cleanup', cleanupOrphanedVoterSlips);

export default router;
