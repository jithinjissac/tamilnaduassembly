import express from 'express';
import { 
    getSettings, 
    updateSettings, 
    resetSettings, 
    getDefaultSettings,
    getSettingsHistory,
    testEmail,
    getActiveGateway
} from '../controllers/settingsController.js';
import { previewEmailTemplate } from '../controllers/templatePreviewController.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Public route - no auth required for gateway detection
router.get('/active-gateway', getActiveGateway);

// All other routes require admin authentication
router.use(adminAuth);

// Get all settings or specific category
router.get('/', getSettings);
router.get('/:category', getSettings);

// Update settings for a category
router.put('/:category', updateSettings);

// Reset settings to defaults
router.post('/reset/:category', resetSettings);

// Get default settings (for reference)
router.get('/defaults/:category?', getDefaultSettings);

// Get settings change history
router.get('/history/:category?', getSettingsHistory);

// Test email connection
router.post('/test-email', testEmail);

// Preview email template
router.get('/preview-template/:templateType', previewEmailTemplate);

export default router;
