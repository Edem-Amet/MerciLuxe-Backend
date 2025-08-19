const express = require('express');
const router = express.Router();
const souvenirController = require('../controllers/SouvenirController');
const { upload, uploadToCloudinary } = require('../middleware/SouvenirUploadMiddleware');

// ===== Error handler middleware for Souvenir uploads =====
const handleUploadErrors = (err, req, res, next) => {
    if (err) {
        console.error('Souvenir upload error:', err);

        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                error: 'File too large (max 20MB)'
            });
        }

        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                error: 'Too many files uploaded'
            });
        }

        if (err.message.includes('image') || err.message.includes('video')) {
            return res.status(415).json({
                success: false,
                error: err.message
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Souvenir upload failed'
        });
    }
    next();
};

// ===== GET all Souvenir items =====
router.get('/', souvenirController.getAllSouvenir);

// ===== POST create new Souvenir item =====
router.post(
    '/',
    upload.array('files', 10), // Accept up to 10 files (images/videos mixed)
    handleUploadErrors,
    async (req, res, next) => {
        try {
            console.log('Souvenir files received:', req.files?.length);
            console.log('Souvenir data:', JSON.stringify(req.body, null, 2));
            next();
        } catch (err) {
            next(err);
        }
    },
    uploadToCloudinary,
    souvenirController.createSouvenir
);

// ===== Cloudinary health check endpoint =====
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
                ? 'Media service unavailable'
                : err.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ===== Routes for single Souvenir item =====
router.route('/:id')
    .get(souvenirController.getSouvenirById)
    .put(
        upload.array('files', 10),
        handleUploadErrors,
        uploadToCloudinary,
        souvenirController.updateSouvenir
    )
    .delete(souvenirController.deleteSouvenir);

module.exports = router;
