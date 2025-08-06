const mongoose = require('mongoose');

const categoryPreviewSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
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
            }
        }
    ],
    link: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        default: '',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    index: {
        type: Number,
        default: 0,
    }
}, {
    timestamps: true,
});

const CategoryPreview = mongoose.model('CategoryPreview', categoryPreviewSchema);

module.exports = CategoryPreview;
