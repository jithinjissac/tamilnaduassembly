import Settings, { defaultSettings } from '../models/Settings.js';
import { clearSettingsCache } from '../utils/settingsHelper.js';
import { testEmailConnection, sendEmail } from '../utils/emailService.js';

// Get all settings or specific category
export const getSettings = async (req, res) => {
    try {
        const { category } = req.params;
        
        // Helper function to convert nested Maps to objects
        const convertMapToObject = (settingsMap) => {
            const settings = {};
            for (const [key, value] of settingsMap) {
                if (value instanceof Map) {
                    settings[key] = Object.fromEntries(value);
                } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    settings[key] = value;
                } else {
                    settings[key] = value;
                }
            }
            return settings;
        };
        
        if (category) {
            // Get specific category
            if (!defaultSettings[category]) {
                return res.status(400).json({
                    status: 'error',
                    message: `Invalid category: ${category}`
                });
            }
            
            const settingsMap = await Settings.getSettings(category);
            const settings = convertMapToObject(settingsMap);
            
            return res.json({
                status: 'success',
                category,
                settings: settings
            });
        } else {
            // Get all categories
            const allSettings = {};
            
            for (const cat of Object.keys(defaultSettings)) {
                const settingsMap = await Settings.getSettings(cat);
                allSettings[cat] = convertMapToObject(settingsMap);
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
        
        // If slip settings changed, delete all preview PDFs to force regeneration with new settings
        if (category === 'slip') {
            try {
                const fs = await import('fs');
                const path = await import('path');
                const { fileURLToPath } = await import('url');
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = path.dirname(__filename);
                
                const previewDir = path.join(__dirname, '..', 'public', 'preview-pdfs');
                if (fs.existsSync(previewDir)) {
                    const files = await fs.promises.readdir(previewDir);
                    let deletedCount = 0;
                    for (const file of files) {
                        if (file.endsWith('.pdf')) {
                            await fs.promises.unlink(path.join(previewDir, file)).catch(() => {});
                            deletedCount++;
                        }
                    }
                    console.log(`🗑️ Deleted ${deletedCount} preview PDFs after slip settings update`);
                }
            } catch (err) {
                console.warn('⚠️ Could not clear preview PDF cache:', err.message);
            }
        }
        
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
            subject: 'Test Email - Kerala Voter Information Slip',
            html: `
                <h2>✅ Email Configuration Successful!</h2>
                <p>Your email settings are working correctly.</p>
                <p>This is a test email sent from your Kerala Voter Information Slip application.</p>
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
