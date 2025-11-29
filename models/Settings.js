import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        unique: true,
        enum: ['email', 'slip', 'payment', 'popup', 'secError']
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
        activeGateway: 'razorpay', // 'razorpay', 'cashfree', or 'payumoney'
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
        },
        payumoney: {
            enabled: false,
            merchantKey: process.env.PAYUMONEY_MERCHANT_KEY || '',
            merchantSalt: process.env.PAYUMONEY_MERCHANT_SALT || '',
            environment: process.env.PAYUMONEY_ENV || 'production' // 'test' or 'production'
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
        // Font sizes for 5 slips per page (with symbol)
        fiveSlips: {
            symbolHeader: '8pt',
            symbolImage: '24mm',
            symbolName: '9.5pt',
            slipNumber: '11pt',
            secId: '10pt',
            voterName: '11pt',
            infoRow: '10pt',
            infoLabel: '17mm',
            pollingStation: '10pt',
            // Margins
            wardMarginBottom: '1mm',
            headerMarginBottom: '1mm',
            voterNameMarginBottom: '1mm',
            infoRowMarginBottom: '0.8mm'
        },
        // Font sizes for 6 slips per page (with symbol)
        sixSlips: {
            symbolHeader: '7pt',
            symbolImage: '20mm',
            symbolName: '8.5pt',
            slipNumber: '10pt',
            secId: '9pt',
            voterName: '11pt',
            infoRow: '9pt',
            infoLabel: '16mm',
            pollingStation: '9pt',
            // Margins
            wardMarginBottom: '0.8mm',
            headerMarginBottom: '0.8mm',
            voterNameMarginBottom: '0.8mm',
            infoRowMarginBottom: '0.6mm'
        },
        // Font sizes for 5 slips per page (symbol-free)
        fiveSlipsFree: {
            slipNumberLabel: '12pt',
            slipNumberValue: '20pt',
            secId: '11pt',
            voterName: '13pt',
            infoRow: '11pt',
            infoLabel: '18mm',
            pollingStation: '11pt',
            wardInfo: '11pt',
            // Margins
            wardMarginBottom: '0mm',
            wardPadding: '0mm 0 0.2mm 0',
            headerMarginBottom: '0.5mm',
            headerMarginTop: '0.5mm',
            voterNameMarginBottom: '1mm',
            infoRowMarginBottom: '0.6mm'
        },
        // Font sizes for 6 slips per page (symbol-free)
        sixSlipsFree: {
            slipNumberLabel: '10pt',
            slipNumberValue: '18pt',
            secId: '10pt',
            voterName: '12pt',
            infoRow: '10pt',
            infoLabel: '16mm',
            pollingStation: '10pt',
            wardInfo: '10pt',
            // Margins
            wardMarginBottom: '0mm',
            wardPadding: '0mm 0 0.2mm 0',
            headerMarginBottom: '0.4mm',
            headerMarginTop: '0.4mm',
            voterNameMarginBottom: '0.8mm',
            infoRowMarginBottom: '0.5mm'
        },
        // Multi-symbol: 5 slips per page
        multiSymbolFive: {
            leftWidth: '68mm',
            headerText: 'നമ്മുടെ ചിഹ്നം',
            headerFont: '8pt',
            symbolImageSize: '18mm',
            symbolNameFont: '7pt',
            slipNumber: '11pt',
            secId: '10pt',
            voterName: '11pt',
            infoRow: '10pt',
            infoLabel: '17mm',
            pollingStation: '10pt',
            wardMarginBottom: '1mm',
            headerMarginBottom: '1mm',
            voterNameMarginBottom: '1mm',
            infoRowMarginBottom: '0.8mm'
        },
        // Multi-symbol: 6 slips per page
        multiSymbolSix: {
            leftWidth: '68mm',
            headerText: 'നമ്മുടെ ചിഹ്നം',
            headerFont: '7pt',
            symbolImageSize: '16mm',
            symbolNameFont: '6.5pt',
            slipNumber: '10pt',
            secId: '9pt',
            voterName: '11pt',
            infoRow: '9pt',
            infoLabel: '16mm',
            pollingStation: '9pt',
            wardMarginBottom: '0.8mm',
            headerMarginBottom: '0.8mm',
            voterNameMarginBottom: '0.8mm',
            infoRowMarginBottom: '0.6mm'
        }
    },
    popup: {
        enabled: false,
        title: 'Announcement',
        content: '',
        showOnce: false,
        delay: 1000
    },
    secError: {
        title: 'SEC Website Unavailable',
        message: 'The Kerala State Election Commission website is currently experiencing technical difficulties. Please try again after some time.'
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
    } else {
        // Merge with defaults to add any new fields
        const defaults = defaultSettings[category] || {};
        const currentSettings = settings.settings instanceof Map 
            ? Object.fromEntries(settings.settings) 
            : settings.settings;
        
        let needsUpdate = false;
        const mergedSettings = { ...currentSettings };
        
        // Add missing top-level keys from defaults
        for (const key in defaults) {
            if (!(key in mergedSettings)) {
                mergedSettings[key] = defaults[key];
                needsUpdate = true;
            }
        }
        
        // Save if we added new fields
        if (needsUpdate) {
            settings.settings = new Map(Object.entries(mergedSettings));
            await settings.save();
        }
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
