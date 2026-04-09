import mongoose from 'mongoose';

const TnDataSchema = new mongoose.Schema({
    stateCode: {
        type: String,
        required: true,
        default: 'S22',
        index: true
    },
    stateName: {
        type: String,
        required: true,
        default: 'Tamil Nadu'
    },
    year: {
        type: Number,
        default: null,
        index: true
    },
    rollTypeValue: {
        type: String,
        default: null
    },
    districtCode: {
        type: String,
        required: true,
        index: true
    },
    districtName: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    constituencyCode: {
        type: String,
        required: true,
        trim: true
    },
    constituencyNumber: {
        type: Number,
        default: null,
        index: true
    },
    constituencyName: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    constituencyLabel: {
        type: String,
        default: ''
    },
    source: {
        type: String,
        default: 'ECI S22 Mapping'
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    }
}, {
    timestamps: true,
    collection: 'tn_datas'
});

// Prevent duplicate constituency rows for the same state and district.
TnDataSchema.index(
    { stateCode: 1, districtCode: 1, constituencyCode: 1 },
    { unique: true }
);

// Optimized lookup for UI dropdowns.
TnDataSchema.index({
    stateCode: 1,
    districtName: 1,
    constituencyNumber: 1,
    isActive: 1
});

const TnData = mongoose.model('TnData', TnDataSchema);

export default TnData;