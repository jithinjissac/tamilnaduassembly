import mongoose from 'mongoose';

const VoterSchema = new mongoose.Schema({
    serialNo: String,
    name: {
        type: String,
        required: true
    },
    relativeName: String,
    relationType: String, // Father/Mother/Husband/Wife
    houseNo: String,
    age: String,
    gender: {
        type: String,
        enum: ['M', 'F', 'O']
    },
    epicNo: String // Voter ID Card Number
}, { _id: false });

const CustomizationSchema = new mongoose.Schema({
    partyName: String,
    partyNameMalayalam: String,
    partyLogo: String, // URL or base64
    symbolText: String,
    symbolTextMalayalam: String,
    primaryColor: {
        type: String,
        default: '#006D3B'
    },
    secondaryColor: {
        type: String,
        default: '#FFB81C'
    },
    additionalText: String,
    candidateName: String,
    candidateNameMalayalam: String,
    candidatePhoto: String
}, { _id: false });

const AssemblyOrderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Location details
    state: {
        type: String,
        required: true
    },
    stateCode: {
        type: String,
        required: true
    },
    district: {
        type: String,
        required: true
    },
    districtCode: {
        type: String,
        required: true
    },
    constituency: {
        type: String,
        required: true
    },
    constituencyCode: {
        type: String,
        required: true
    },
    
    // Form metadata
    year: String,
    rollType: String,
    language: String,
    
    // Voter data
    voters: [VoterSchema],
    totalVoters: {
        type: Number,
        required: true
    },
    
    // Preview session reference (for image-based voter data)
    previewId: String,
    
    // Selected polling parts info
    selectedParts: [{
        partNumber: String,
        partName: String
    }],
    
    // Customization
    customization: CustomizationSchema,
    
    // Payment
    amount: {
        type: Number,
        required: true
    },
    pricePerVoter: {
        type: Number,
        default: 0.50
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending',
        index: true
    },
    paymentMethod: {
        type: String,
        enum: ['razorpay', 'cashfree', 'payumoney', 'admin_bypass']
    },
    paymentId: String,
    paymentDetails: mongoose.Schema.Types.Mixed,
    paidAt: Date,
    
    // Payment gateway specific fields
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    cashfreeOrderId: String,
    cashfreeSessionId: String,
    cashfreePaymentId: String,
    payumoneyTxnId: String,
    payumoneyPaymentId: String,
    
    // PDF management
    // Preview PDF path (first pages), stored for persistent preview serving.
    previewPdfPath: String,
    pdfGenerated: {
        type: Boolean,
        default: false
    },
    pdfPath: String,
    googleDriveLink: {
        type: String,
        default: null
    },
    pdfGeneratedAt: Date,
    downloadCount: {
        type: Number,
        default: 0
    },
    lastDownloadAt: Date,
    
    // Status
    status: {
        type: String,
        enum: ['draft', 'payment_pending', 'completed', 'failed', 'cancelled'],
        default: 'draft',
        index: true
    },
    
    // Metadata
    notes: String,
    adminNotes: String,
    deletedAt: Date,
    isDeleted: {
        type: Boolean,
        default: false,
        index: true
    }
}, {
    timestamps: true
});

// Indexes for performance
AssemblyOrderSchema.index({ userId: 1, createdAt: -1 });
AssemblyOrderSchema.index({ paymentStatus: 1 });
AssemblyOrderSchema.index({ status: 1 });
AssemblyOrderSchema.index({ orderId: 1 }, { unique: true });
AssemblyOrderSchema.index({ constituency: 1 });
AssemblyOrderSchema.index({ district: 1 });

// Pre-save middleware to generate orderId
AssemblyOrderSchema.pre('save', async function(next) {
    if (!this.orderId) {
        const date = new Date();
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.orderId = `ASM-${dateStr}-${randomStr}`;
    }
    next();
});

// Method to calculate amount (₹0.50 per voter)
AssemblyOrderSchema.methods.calculateAmount = function() {
    return this.totalVoters * 0.50;
};

// Static method to get user's total spent
AssemblyOrderSchema.statics.getUserTotalSpent = async function(userId) {
    const result = await this.aggregate([
        {
            $match: {
                userId: mongoose.Types.ObjectId(userId),
                paymentStatus: 'completed',
                isDeleted: false
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: '$amount' }
            }
        }
    ]);
    
    return result[0]?.total || 0;
};

const AssemblyOrder = mongoose.model('AssemblyOrder', AssemblyOrderSchema);

export default AssemblyOrder;
