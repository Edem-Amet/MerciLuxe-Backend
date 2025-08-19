const express = require('express');
const router = express.Router();
const cooperateController = require('../controllers/CooperateController');
const { upload, uploadToCloudinary } = require('../middleware/CooperateUploadMiddleware');

// ===== Error handler middleware for Cooperate uploads =====
const handleUploadErrors = (err, req, res, next) => {
    if (err) {
        console.error('Cooperate upload error:', err);

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
            error: 'Cooperate upload failed'
        });
    }
    next();
};

// ===== GET all Cooperate items =====
router.get('/', cooperateController.getAllCooperate);

// ===== POST create new Cooperate item =====
router.post(
    '/',
    upload.array('files', 10), // Accept up to 10 files (images/videos mixed)
    handleUploadErrors,
    async (req, res, next) => {
        try {
            console.log('Cooperate files received:', req.files?.length);
            console.log('Cooperate data:', JSON.stringify(req.body, null, 2));
            next();
        } catch (err) {
            next(err);
        }
    },
    uploadToCloudinary,
    cooperateController.createCooperate
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

// ===== Routes for single Cooperate item =====
router.route('/:id')
    .get(cooperateController.getCooperateById)
    .put(
        upload.array('files', 10),
        handleUploadErrors,
        uploadToCloudinary,
        cooperateController.updateCooperate
    )
    .delete(cooperateController.deleteCooperate);

module.exports = router;
