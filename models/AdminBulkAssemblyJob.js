import mongoose from 'mongoose';

const BulkPartSchema = new mongoose.Schema({
    partNumber: {
        type: Number,
        required: true
    },
    partName: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    voterCount: {
        type: Number,
        default: 0
    },
    pdfUrl: String,
    slipFileName: String,
    slipFileUrl: String,
    error: String,
    startedAt: Date,
    completedAt: Date
}, { _id: false });

const AdminBulkAssemblyJobSchema = new mongoose.Schema({
    jobId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['queued', 'running', 'completed', 'partial', 'failed'],
        default: 'queued',
        index: true
    },
    stateCode: { type: String, required: true },
    districtCode: { type: String, required: true },
    constituencyCode: { type: String, required: true },
    constituencyName: { type: String, required: true },
    year: { type: String, required: true },
    rollType: { type: String, required: true },
    language: { type: String, default: 'en' },
    captchaText: {
        type: String,
        select: false
    },
    captchaId: {
        type: String,
        select: false
    },
    candidate: {
        symbol: { type: String, default: '' },
        symbolName: { type: String, default: '' },
        symbolNameMalayalam: { type: String, default: '' }
    },
    parts: {
        type: [BulkPartSchema],
        default: []
    },
    totalParts: {
        type: Number,
        default: 0
    },
    completedParts: {
        type: Number,
        default: 0
    },
    failedParts: {
        type: Number,
        default: 0
    },
    zipFileName: String,
    zipFileUrl: String,
    error: String,
    startedAt: Date,
    finishedAt: Date
}, {
    timestamps: true
});

AdminBulkAssemblyJobSchema.index({ createdAt: -1 });

AdminBulkAssemblyJobSchema.pre('validate', function (next) {
    if (!this.jobId) {
        const now = new Date();
        const date = now.toISOString().slice(0, 10).replace(/-/g, '');
        const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
        this.jobId = `BASM-${date}-${rand}`;
    }
    this.totalParts = Array.isArray(this.parts) ? this.parts.length : 0;
    next();
});

const AdminBulkAssemblyJob = mongoose.model('AdminBulkAssemblyJob', AdminBulkAssemblyJobSchema);

export default AdminBulkAssemblyJob;