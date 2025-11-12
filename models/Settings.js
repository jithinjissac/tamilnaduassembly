import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        unique: true,
        enum: ['email', 'slip']
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
    slip: {
        // Font sizes for 5 slips per page
        fiveSlips: {
            symbolHeader: '8pt',
            symbolImage: '24mm',
            symbolName: '9.5pt',
            slipNumber: '11pt',
            secId: '10pt',
            voterName: '11pt',
            infoRow: '10pt',
            infoLabel: '17mm',
            pollingStation: '10pt'
        },
        // Font sizes for 6 slips per page
        sixSlips: {
            symbolHeader: '7pt',
            symbolImage: '20mm',
            symbolName: '8.5pt',
            slipNumber: '10pt',
            secId: '9pt',
            voterName: '11pt',
            infoRow: '9pt',
            infoLabel: '16mm',
            pollingStation: '9pt'
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
