const express = require('express');
const router = express.Router();
const jewelryController = require('../controllers/jewelryController');
const { upload, uploadToCloudinary } = require('../middleware/JewelryUploadMiddleware');

// Error handler middleware for jewelry uploads
const handleUploadErrors = (err, req, res, next) => {
    if (err) {
        console.error('Jewelry upload error:', err);

        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                error: 'File too large (max 5MB)'
            });
        }

        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                error: 'Too many files (max 5 allowed)'
            });
        }

        if (err.message.includes('image')) {
            return res.status(415).json({
                success: false,
                error: err.message
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Jewelry upload failed'
        });
    }
    next();
};

// GET all jewelry items
router.get('/', jewelryController.getAllJewelry);

// POST create new jewelry item
router.post(
    '/',
    upload.array('images', 5), // Allowing more images for jewelry items
    handleUploadErrors,
    async (req, res, next) => {
        try {
            console.log('Jewelry files received:', req.files?.length);
            console.log('Jewelry data:', JSON.stringify(req.body, null, 2));
            next();
        } catch (err) {
            next(err);
        }
    },
    uploadToCloudinary,
    jewelryController.createJewelry
);

// Cloudinary health check endpoint
router.get('/health/cloudinary', async (req, res) => {
    try {
        const cloudinary = require('../config/cloudinary');
        if (!cloudinary.config().cloud_name || !cloudinary.config().api_key) {
            throw new Error('Cloudinary configuration missing');
        }

        const result = await Promise.race([
            cloudinary.api.ping(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Cloudinary timeout after 5 seconds')), 5000)
            )
        ]);

        res.json({
            status: 'ok',
            details: {
                cloud_name: cloudinary.config().cloud_name,
                api_key_configured: !!cloudinary.config().api_key,
                responsive: result === 'pong'
            }
        });
    } catch (err) {
        console.error('Cloudinary health check failed:', err);
        res.status(503).json({
            status: 'error',
            error: process.env.NODE_ENV === 'production'
                ? 'Image service unavailable'
                : err.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Routes for single jewelry item
router.route('/:id')
    .get(jewelryController.getJewelryById)
    .put(
        upload.array('images', 5),
        handleUploadErrors,
        uploadToCloudinary,
        jewelryController.updateJewelry
    )
    .delete(jewelryController.deleteJewelry);

module.exports = router;