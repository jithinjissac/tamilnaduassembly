import mongoose from 'mongoose';

const AssemblyUserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    lastLogin: Date,
    totalOrders: {
        type: Number,
        default: 0
    },
    totalSpent: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for faster queries
AssemblyUserSchema.index({ email: 1 });
AssemblyUserSchema.index({ phone: 1 });
AssemblyUserSchema.index({ createdAt: -1 });

// Virtual for order count (computed from AssemblyOrder model)
AssemblyUserSchema.virtual('orders', {
    ref: 'AssemblyOrder',
    localField: '_id',
    foreignField: 'userId'
});

const AssemblyUser = mongoose.model('AssemblyUser', AssemblyUserSchema);

export default AssemblyUser;
