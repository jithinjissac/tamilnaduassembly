import express from 'express';
import * as slipController from '../controllers/slipController.js';
import auth from '../middleware/auth.js';
import authHTML from '../middleware/authHTML.js';

const router = express.Router();

// @route   GET /api/slips/test-puppeteer
// @desc    Test if Puppeteer is working
// @access  Public
router.get('/test-puppeteer', slipController.testPuppeteer);

// @route   POST /api/slips/preview
// @desc    Generate preview (first 2 pages)
// @access  Private
router.post('/preview', auth, slipController.generatePreview);

// @route   GET /api/slips/preview/:orderId
// @desc    View preview HTML directly in browser (protected - requires auth and ownership)
// @access  Private (requires authentication and order ownership)
router.get('/preview/:orderId', authHTML, slipController.viewPreview);

// @route   GET /api/slips/download/:orderId
// @desc    Download full PDF (paid orders only)
// @access  Private
router.get('/download/:orderId', auth, slipController.downloadSlip);

// @route   GET /api/slips/pdf-status/:orderId
// @desc    Check PDF generation status and download eligibility
// @access  Private
router.get('/pdf-status/:orderId', auth, slipController.getPDFStatus);

// @route   DELETE /api/slips/cleanup/:filename
// @desc    Cleanup temporary PDF file
// @access  Public
router.delete('/cleanup/:filename', slipController.cleanupPreview);

// @route   GET /api/slips/preview-pdf/:filename
// @desc    Serve preview PDF file (protected - requires auth and order ownership)
// @access  Private
router.get('/preview-pdf/:filename', auth, slipController.servePreviewPDF);

export default router;
