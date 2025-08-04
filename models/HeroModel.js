const mongoose = require('mongoose');

const HeroSchema = new mongoose.Schema({
    images: [
        {
            imageUrl: {
                type: String,
                required: true,
            },
            altText: {
                type: String,
                required: true,
            },
        },
    ],
    hallTagline: {
        type: String,
        required: true,
    },
    heading: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    buttons: [
        {
            label: {
                type: String,
                required: true,
            },
            link: {
                type: String,
                required: true,
            },
            style: {
                type: String,
                enum: ['primary', 'outline'],
                required: true,
            },
        },
    ],
    published: {
        type: Boolean,
        required: true,
    },
}, { timestamps: true });

module.exports = mongoose.model('Hero', HeroSchema);
