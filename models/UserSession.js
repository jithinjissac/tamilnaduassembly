import mongoose from 'mongoose';

const UserSessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    // Device Information
    device: {
        userAgent: String,
        browser: {
            name: String,
            version: String
        },
        os: {
            name: String,
            version: String
        },
        device: {
            deviceType: String, // Mobile, Desktop, Tablet
            vendor: String,
            model: String
        },
        screen: {
            width: Number,
            height: Number
        }
    },
    // Location Information
    location: {
        ip: String,
        country: String,
        region: String,
        city: String,
        latitude: Number,
        longitude: Number,
        timezone: String,
        isp: String
    },
    // Session Details
    startTime: {
        type: Date,
        default: Date.now,
        index: true
    },
    endTime: {
        type: Date
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Activity Summary
    activityCount: {
        type: Number,
        default: 0
    },
    pageViews: [{
        page: String,
        timestamp: Date
    }]
}, {
    timestamps: true
});

// Indexes for efficient queries
UserSessionSchema.index({ userId: 1, startTime: -1 });
UserSessionSchema.index({ isActive: 1, lastActivity: -1 });
UserSessionSchema.index({ 'location.ip': 1 });

export default mongoose.model('UserSession', UserSessionSchema);
