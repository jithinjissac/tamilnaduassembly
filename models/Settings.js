import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        unique: true,
        enum: ['email', 'payment']
    },
    settings: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastModified: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries
// Note: category already has unique index from schema definition
settingsSchema.index({ lastModified: -1 });  // Fast history sorting

// Default settings for email only
export const defaultSettings = {
    email: {
        enableEmailNotifications: false,
        smtpHost: '',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: '',
        smtpPassword: '',
        fromEmail: '',
        fromName: 'Kerala Voter Slip',
        emailTemplates: {
            orderConfirmation: true,
            paymentSuccess: true,
            pdfReady: true,
            orderExpiry: false
        },
        smsNotifications: false,
        webhookURL: ''
    },
    payment: {
        activeGateway: 'razorpay', // 'razorpay' or 'cashfree'
        razorpay: {
            enabled: true,
            keyId: process.env.RAZORPAY_KEY_ID || '',
            keySecret: process.env.RAZORPAY_KEY_SECRET || '',
            webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || ''
        },
        cashfree: {
            enabled: false,
            appId: process.env.CASHFREE_APP_ID || '',
            secretKey: process.env.CASHFREE_SECRET_KEY || '',
            environment: 'TEST' // 'TEST' or 'PROD'
        }
    }
};

// Static method to get settings by category
settingsSchema.statics.getSettings = async function(category) {
    let settings = await this.findOne({ category });
    
    if (!settings) {
        // Create default settings if not exists
        settings = await this.create({
            category,
            settings: defaultSettings[category] || {}
        });
    }
    
    return settings.settings;
};

// Static method to update settings
settingsSchema.statics.updateSettings = async function(category, newSettings, userId) {
    let settings = await this.findOne({ category });
    
    if (!settings) {
        settings = new this({
            category,
            settings: newSettings,
            updatedBy: userId
        });
    } else {
        settings.settings = new Map(Object.entries(newSettings));
        settings.updatedBy = userId;
        settings.lastModified = new Date();
    }
    
    await settings.save();
    return settings.settings;
};

// Static method to reset to defaults
settingsSchema.statics.resetToDefaults = async function(category, userId) {
    const defaults = defaultSettings[category];
    if (!defaults) {
        throw new Error(`No default settings found for category: ${category}`);
    }
    
    return await this.updateSettings(category, defaults, userId);
};

export default mongoose.model('Settings', settingsSchema);
