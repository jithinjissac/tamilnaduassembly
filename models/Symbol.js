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

// Index for fast search (including Malayalam)
symbolSchema.index({ name: 'text', nameMalayalam: 'text' });
symbolSchema.index({ isActive: 1, category: 1 });

const Symbol = mongoose.model('Symbol', symbolSchema);

export default Symbol;
