const mongoose = require('mongoose');

const SpecialPackageSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true, // Package must have a name
    },
    description: {
        type: String,
        default: '', // Optional description of the package
    },
    price: {
        type: Number,
        required: true, // Each package must have a price
    },
    category: {
        type: String,
        default: 'Special Package', // 🎁 default category for special packages
    },
    images: [
        {
            imageUrl: {
                type: String,
                default: '', // Optional image
            },
            altText: {
                type: String,
                default: '',
            },
        },
    ],
    videos: [
        {
            videoUrl: {
                type: String,
                default: '', // Optional video
            },
            title: {
                type: String,
                default: '',
            },
        },
    ],
    inStock: {
        type: Boolean,
        default: true, // Package availability
    },
}, { timestamps: true });

module.exports = mongoose.model('SpecialPackage', SpecialPackageSchema);
