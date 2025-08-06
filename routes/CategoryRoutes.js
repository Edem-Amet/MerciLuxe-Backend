const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/CategoryController');
const { upload, uploadToCloudinary } = require('../middleware/CategoryUploadMiddleware');

// Error handler middleware
const handleUploadErrors = (err, req, res, next) => {
    if (err) {
        console.error('Upload error:', err);

        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                error: 'File size too large (max 5MB)'
            });
        }

        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                error: 'Too many files (max 3 allowed)'
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
            error: 'Upload failed, try again'
        });
    }
    next();
};

// GET all categories
router.get('/', categoryController.getAllCategories);

// POST create new category
router.post(
    '/',
    upload.array('images', 3),
    handleUploadErrors,
    async (req, res, next) => {
        try {
            console.log('Files received:', req.files?.length);
            console.log('Body content:', JSON.stringify(req.body, null, 2));
            next();
        } catch (err) {
            next(err);
        }
    },
    uploadToCloudinary,
    categoryController.createCategory
);

// Cloudinary health check
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

// Routes for single category (GET, PUT, DELETE)
router.route('/:id')
    .get(categoryController.getCategoryById)
    .put(
        upload.array('images', 3),
        handleUploadErrors,
        uploadToCloudinary,
        categoryController.updateCategory
    )
    .delete(categoryController.deleteCategory);

module.exports = router;
