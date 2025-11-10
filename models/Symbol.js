import mongoose from 'mongoose';

const symbolSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    nameMalayalam: {
        type: String,
        trim: true,
        default: ''
    },
    imageUrl: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['political-party', 'independent', 'other'],
        default: 'political-party'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for fast queries
symbolSchema.index({ name: 'text', nameMalayalam: 'text' });  // Text search
symbolSchema.index({ isActive: 1, category: 1 });  // Filter by active status and category
symbolSchema.index({ createdAt: -1 });  // Sort by creation date (admin listing)
symbolSchema.index({ uploadedBy: 1 });  // Filter by uploader

const Symbol = mongoose.model('Symbol', symbolSchema);

export default Symbol;
