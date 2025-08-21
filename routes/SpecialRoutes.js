const express = require('express');
const router = express.Router();
const specialPackageController = require('../controllers/SpecialController');
const { upload, uploadToCloudinary } = require('../middleware/SpecialUploadMiddleware');

// ===== Error handler middleware for Special Package uploads =====
const handleUploadErrors = (err, req, res, next) => {
    if (err) {
        console.error('Special Package upload error:', err);

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
            error: 'Special Package upload failed'
        });
    }
    next();
};

// ===== GET all Special Packages =====
router.get('/', specialPackageController.getAllSpecialPackages);

// ===== POST create new Special Package =====
router.post(
    '/',
    upload.array('files', 10), // Accept up to 10 files (images/videos mixed)
    handleUploadErrors,
    async (req, res, next) => {
        try {
            console.log('Special Package files received:', req.files?.length);
            console.log('Special Package data:', JSON.stringify(req.body, null, 2));
            next();
        } catch (err) {
            next(err);
        }
    },
    uploadToCloudinary,
    specialPackageController.createSpecialPackage
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

// ===== Routes for single Special Package =====
router.route('/:id')
    .get(specialPackageController.getSpecialPackageById)
    .put(
        upload.array('files', 10),
        handleUploadErrors,
        uploadToCloudinary,
        specialPackageController.updateSpecialPackage
    )
    .delete(specialPackageController.deleteSpecialPackage);

module.exports = router;
