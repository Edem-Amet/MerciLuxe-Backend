const mongoose = require('mongoose');

const packageRequestSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
    },
    location: {
        type: String,
        required: [true, 'Location is required'],
        trim: true,
    },
    whatsappNumber: {
        type: String,
        required: [true, 'WhatsApp number is required'],
        trim: true,
    },
    packageOfInterest: {
        type: String,
        required: [true, 'Package of interest is required'],
        trim: true,
    },
    submittedAt: {
        type: Date,
        default: Date.now,
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('PackageRequest', packageRequestSchema);