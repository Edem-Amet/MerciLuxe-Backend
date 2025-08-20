const mongoose = require('mongoose');

const BeadSchema = new mongoose.Schema({
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
        default: 'Beads',
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
                default: '',
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

module.exports = mongoose.model('Bead', BeadSchema);
