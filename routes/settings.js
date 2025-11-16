import express from 'express';
import { 
    getSettings, 
    updateSettings, 
    resetSettings, 
    getDefaultSettings,
    getSettingsHistory,
    testEmail
} from '../controllers/settingsController.js';
import { previewEmailTemplate } from '../controllers/templatePreviewController.js';
import { adminAuth, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Public endpoint for popup settings (needed for index.html)
// This must come BEFORE adminAuth middleware
router.get('/popup', optionalAuth, async (req, res, next) => {
    req.params.category = 'popup';
    return getSettings(req, res, next);
});

// PUT endpoint for popup (requires auth)
router.put('/popup', adminAuth, async (req, res, next) => {
    req.params.category = 'popup';
    return updateSettings(req, res, next);
});

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
