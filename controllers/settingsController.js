import Settings, { defaultSettings } from '../models/Settings.js';
import { clearSettingsCache } from '../utils/settingsHelper.js';
import { testEmailConnection, sendEmail } from '../utils/emailService.js';

// Get all settings or specific category
export const getSettings = async (req, res) => {
    try {
        const { category } = req.params;
        
        if (category) {
            // Get specific category
            if (!defaultSettings[category]) {
                return res.status(400).json({
                    status: 'error',
                    message: `Invalid category: ${category}`
                });
            }
            
            const settings = await Settings.getSettings(category);
            
            return res.json({
                status: 'success',
                category,
                settings: Object.fromEntries(settings)
            });
        } else {
            // Get all categories
            const allSettings = {};
            
            for (const cat of Object.keys(defaultSettings)) {
                const settings = await Settings.getSettings(cat);
                allSettings[cat] = Object.fromEntries(settings);
            }
            
            return res.json({
                status: 'success',
                settings: allSettings
            });
        }
    } catch (error) {
        console.error('❌ Error fetching settings:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch settings',
            error: error.message
        });
    }
};

// Update settings for a category
export const updateSettings = async (req, res) => {
    try {
        const { category } = req.params;
        const newSettings = req.body;
        const userId = req.userId;
        
        if (!defaultSettings[category]) {
            return res.status(400).json({
                status: 'error',
                message: `Invalid category: ${category}`
            });
        }
        
        const updatedSettings = await Settings.updateSettings(category, newSettings, userId);
        
        // Clear cache for this category
        clearSettingsCache(category);
        
        console.log(`✅ Settings updated for category: ${category} by user: ${userId}`);
        
        res.json({
            status: 'success',
            message: `${category} settings updated successfully`,
            category,
            settings: Object.fromEntries(updatedSettings)
        });
    } catch (error) {
        console.error('❌ Error updating settings:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update settings',
            error: error.message
        });
    }
};

// Reset settings to defaults
export const resetSettings = async (req, res) => {
    try {
        const { category } = req.params;
        const userId = req.userId;
        
        const resetSettings = await Settings.resetToDefaults(category, userId);
        
        // Clear cache for this category
        clearSettingsCache(category);
        
        console.log(`♻️ Settings reset to defaults for category: ${category} by user: ${userId}`);
        
        res.json({
            status: 'success',
            message: `${category} settings reset to defaults`,
            category,
            settings: Object.fromEntries(resetSettings)
        });
    } catch (error) {
        console.error('❌ Error resetting settings:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// Get default settings for a category (for reference)
export const getDefaultSettings = async (req, res) => {
    try {
        const { category } = req.params;
        
        if (category) {
            if (!defaultSettings[category]) {
                return res.status(400).json({
                    status: 'error',
                    message: `Invalid category: ${category}`
                });
            }
            
            return res.json({
                status: 'success',
                category,
                defaults: defaultSettings[category]
            });
        } else {
            return res.json({
                status: 'success',
                defaults: defaultSettings
            });
        }
    } catch (error) {
        console.error('❌ Error fetching default settings:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch default settings',
            error: error.message
        });
    }
};

// Get settings change history
export const getSettingsHistory = async (req, res) => {
    try {
        const { category } = req.params;
        
        const query = category ? { category } : {};
        
        const history = await Settings.find(query)
            .populate('updatedBy', 'email name')
            .sort({ lastModified: -1 })
            .limit(50)
            .lean();  // Read-only query - 30% faster!
        
        res.json({
            status: 'success',
            history: history.map(h => ({
                category: h.category,
                settings: Object.fromEntries(h.settings),
                updatedBy: h.updatedBy,
                lastModified: h.lastModified
            }))
        });
    } catch (error) {
        console.error('❌ Error fetching settings history:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch settings history',
            error: error.message
        });
    }
};

// Test email connection
export const testEmail = async (req, res) => {
    try {
        const result = await testEmailConnection();
        
        if (!result.success) {
            return res.status(400).json({
                status: 'error',
                message: result.message
            });
        }
        
        // Send test email
        const { email } = req.body;
        const testResult = await sendEmail({
            to: email || req.user.email,
            subject: 'Test Email - Kerala Voter Slip',
            html: `
                <h2>✅ Email Configuration Successful!</h2>
                <p>Your email settings are working correctly.</p>
                <p>This is a test email sent from your Kerala Voter Slip application.</p>
                <p>Sent at: ${new Date().toLocaleString()}</p>
            `
        });
        
        if (testResult.success) {
            res.json({
                status: 'success',
                message: 'Test email sent successfully',
                messageId: testResult.messageId
            });
        } else {
            res.status(500).json({
                status: 'error',
                message: 'Failed to send test email: ' + testResult.error
            });
        }
    } catch (error) {
        console.error('❌ Error testing email:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to test email',
            error: error.message
        });
    }
};
