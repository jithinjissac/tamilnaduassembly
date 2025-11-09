import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    customization: {
        symbolId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Symbol',
            required: true
        },
        symbolImage: {
            type: String, // URL to symbol image
            required: true
        },
        symbolName: {
            type: String,
            required: true
        },
        // Legacy fields for backward compatibility
        partyLogo: {
            type: String
        },
        partyName: {
            type: String
        },
        symbolText: {
            type: String
        },
        colorScheme: {
            type: Object,
            default: {}
        }
    },
    location: {
        district: {
            type: String,
            required: true
        },
        districtName: String,
        localBody: {
            type: String,
            required: true
        },
        localBodyName: String,
        ward: {
            type: String,
            required: true
        },
        wardName: String,
        pollingStation: {
            type: String,
            required: true
        },
        pollingStationName: String
    },
    voters: [{
        sl_no: String,
        name: String,
        guardian_name: String,
        house_no: String,
        house_name: String,
        gender_age: String,
        sec_id: String,
        // Added for multi-polling-station extraction
        polling_station_name: String, // Full polling station text (e.g., "001 - SCHOOL NAME")
        polling_station_value: String // Original value/id used in SEC form
    }],
    totalVoters: {
        type: Number,
        required: true
    },
    originalAmount: {
        type: Number,
        required: true
    },
    pricePerVoter: {
        type: Number,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    paidAt: Date,
    downloadCount: {
        type: Number,
        default: 0
    },
    lastDownloadAt: Date
});

// Index for order uniqueness check (symbol + location combination)
OrderSchema.index({ 
    userId: 1, 
    'customization.symbolId': 1, 
    'location.district': 1, 
    'location.localBody': 1, 
    'location.ward': 1, 
    'location.pollingStation': 1 
});

// Index for user orders listing
OrderSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Order', OrderSchema);
