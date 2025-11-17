import mongoose from 'mongoose';

const UserActivitySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sessionId: {
        type: String,
        required: true,
        index: true
    },
    // Activity Type
    action: {
        type: String,
        required: true,
        enum: [
            // Authentication
            'login', 'logout', 'register', 'password_reset_request', 'password_reset',
            // Navigation
            'page_view', 'dashboard_view', 'create_slip_view', 'preview_view',
            // Slip Creation & Form Interactions
            'form_data_loaded', 'district_selected', 'local_body_selected', 'ward_selected',
            'polling_station_selected', 'voter_list_extracted', 'symbol_selected', 
            'slip_data_entered', 'preview_generated',
            // Form Interactions
            'dropdown_selected', 'radio_selected', 'checkbox_toggled', 'input_changed',
            'button_clicked', 'form_submitted',
            // Orders & Payment
            'order_created', 'payment_initiated', 'payment_success', 'payment_failed',
            'invoice_downloaded', 'pdf_downloaded', 'order_viewed',
            // Settings & Profile
            'profile_viewed', 'profile_updated', 'settings_changed',
            // Other Actions
            'file_uploaded', 'search_performed', 'filter_applied', 'export_data',
            'contact_form_submitted', 'help_viewed', 'error_occurred'
        ]
    },
    // Activity Details
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    // Page Information
    page: {
        url: String,
        title: String,
        referrer: String
    },
    // Timestamp
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    // Additional Context
    metadata: {
        duration: Number, // Time spent on action in ms
        success: Boolean,
        errorMessage: String,
        previousAction: String
    }
}, {
    timestamps: true
});

// Compound indexes for efficient queries
UserActivitySchema.index({ userId: 1, timestamp: -1 });
UserActivitySchema.index({ sessionId: 1, timestamp: -1 });
UserActivitySchema.index({ action: 1, timestamp: -1 });
UserActivitySchema.index({ userId: 1, action: 1, timestamp: -1 });

// TTL index - automatically delete activities older than 90 days
UserActivitySchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

export default mongoose.model('UserActivity', UserActivitySchema);
