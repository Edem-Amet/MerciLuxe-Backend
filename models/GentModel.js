const mongoose = require('mongoose');

const GentSchema = new mongoose.Schema({
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
        default: 'Gent’s Corner', // tailored for gents
    },
    images: [
        {
            imageUrl: {
                type: String,
                default: '', // optional
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
                default: '', // optional
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

module.exports = mongoose.model('Gent', GentSchema);
