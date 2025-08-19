const mongoose = require('mongoose');

const CooperateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
    },
    price: {
        type: Number,
        required: true,
    },
    category: {
        type: String,
        default: 'Cooperate',
    },
    images: [
        {
            imageUrl: {
                type: String,
                default: '',
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
                default: '', // optional video
            },
            title: {
                type: String,
                default: '',
            },
        },
    ],
    inStock: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

module.exports = mongoose.model('Cooperate', CooperateSchema);
