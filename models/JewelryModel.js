const mongoose = require('mongoose');

const JewelrySchema = new mongoose.Schema({
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
        default: 'Jewelry',
    },
    images: [
        {
            imageUrl: {
                type: String,
                required: true,
            },
            altText: {
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

module.exports = mongoose.model('Jewelry', JewelrySchema);