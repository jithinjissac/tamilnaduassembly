import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        unique: true,
        enum: ['email', 'slip', 'payment', 'popup']
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
    payment: {
        activeGateway: 'razorpay', // 'razorpay' or 'cashfree'
        razorpay: {
            enabled: true,
            keyId: process.env.RAZORPAY_KEY_ID || '',
            keySecret: process.env.RAZORPAY_KEY_SECRET || ''
        },
        cashfree: {
            enabled: false,
            appId: process.env.CASHFREE_APP_ID || '',
            secretKey: process.env.CASHFREE_SECRET_KEY || '',
            environment: process.env.CASHFREE_ENV || 'production' // 'sandbox' or 'production'
        }
    },
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
        orderConfirmation: {
            subject: 'Order Confirmed - {{wardName}} - {{orderId}}',
            heading: 'Order Confirmed Successfully!',
            message: `നമസ്കാരം {{userName}},

Your order has been confirmed successfully!

📋 Order Details:
• Order ID: {{orderId}}
• Ward: {{wardName}}
• Polling Station: {{pollingStation}}
• Symbol: {{symbolName}}
• Total Voters: {{voterCount}}

Your voter slips are being prepared and will be ready for download shortly.`
        },
        paymentSuccess: {
            subject: 'Payment Successful - {{wardName}} - {{orderId}}',
            heading: 'Payment Received Successfully!',
            message: `നമസ്കാരം {{userName}},

Your payment has been received successfully!

💰 Payment Details:
• Amount Paid: ₹{{amount}}
• Order ID: {{orderId}}
• Ward: {{wardName}}

Your voter slips PDF is being generated and will be ready for download shortly.`
        },
        pdfReady: {
            subject: 'Your Voter Slips are Ready - {{wardName}} - {{orderId}}',
            heading: 'Your PDF is Ready for Download!',
            message: `നമസ്കാരം {{userName}},

Great news! Your voter slips PDF is now ready for download.

📄 PDF Details:
• Order ID: {{orderId}}
• Ward: {{wardName}}
• Polling Station: {{pollingStation}}
• Symbol: {{symbolName}}
• Total Voters: {{voterCount}}

Login to https://easyslip.in to download your PDF.`
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
    },
    popup: {
        enabled: false,
        title: 'Announcement',
        content: '',
        showOnce: false,
        delay: 1000
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
