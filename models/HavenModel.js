const mongoose = require('mongoose');

const QueensHavenSchema = new mongoose.Schema({
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
        default: 'Queens Haven',
    },
    images: [
        {
            imageUrl: {
                type: String,
                default: '', // not required
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
                default: '', // not required
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

module.exports = mongoose.model('QueensHaven', QueensHavenSchema);
