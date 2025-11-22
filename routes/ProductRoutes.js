const express = require('express');
const router = express.Router();
const productController = require('../controllers/ProductController');
const { upload, uploadToCloudinary } = require('../middleware/ProductUploadMiddleware');

// ==================== ERROR HANDLING MIDDLEWARE ====================

const handleUploadErrors = (err, req, res, next) => {
    if (err) {
        console.error('❌ Upload error:', err);

        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                message: 'File too large. Maximum size is 20MB per file.',
                error: 'FILE_TOO_LARGE'
            });
        }

        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files. Maximum 10 files allowed.',
                error: 'TOO_MANY_FILES'
            });
        }

        if (err.message && (err.message.includes('image') || err.message.includes('video') || err.message.includes('file'))) {
            return res.status(415).json({
                success: false,
                message: err.message,
                error: 'INVALID_FILE_TYPE'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'File upload failed',
            error: process.env.NODE_ENV === 'development' ? err.message : 'UPLOAD_FAILED'
        });
    }
    next();
};

// ==================== VALIDATION MIDDLEWARE ====================

const validateProductCreation = (req, res, next) => {
    try {
        console.log('✓ Validating product creation...');
        console.log(`Files: ${req.files?.length || 0}`);
        console.log('Product data:', JSON.stringify(req.body, null, 2));

        const { name, price, category } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Product name is required',
                error: 'NAME_REQUIRED'
            });
        }

        if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid price is required and must be greater than 0',
                error: 'PRICE_REQUIRED'
            });
        }

        if (!category || !category.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Category is required',
                error: 'CATEGORY_REQUIRED'
            });
        }

        const validCategories = ['Gents', 'Haven', 'Cooperate', 'Souvenirs', 'Beads', 'Jewelry', 'Special'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({
                success: false,
                message: `Category must be one of: ${validCategories.join(', ')}`,
                error: 'INVALID_CATEGORY'
            });
        }

        next();
    } catch (err) {
        next(err);
    }
};

const validateProductUpdate = (req, res, next) => {
    try {
        const { name, price, category } = req.body;

        if (name !== undefined && (!name || !name.trim())) {
            return res.status(400).json({
                success: false,
                message: 'Product name cannot be empty',
                error: 'NAME_EMPTY'
            });
        }

        if (price !== undefined && (isNaN(parseFloat(price)) || parseFloat(price) <= 0)) {
            return res.status(400).json({
                success: false,
                message: 'Price must be greater than 0',
                error: 'PRICE_INVALID'
            });
        }

        if (category !== undefined && category !== '') {
            const validCategories = ['Gents', 'Haven', 'Cooperate', 'Souvenirs', 'Beads', 'Jewelry', 'Special'];
            if (!validCategories.includes(category)) {
                return res.status(400).json({
                    success: false,
                    message: `Category must be one of: ${validCategories.join(', ')}`,
                    error: 'INVALID_CATEGORY'
                });
            }
        }

        next();
    } catch (err) {
        next(err);
    }
};

const validateStockUpdate = (req, res, next) => {
    const { stockQuantity } = req.body;

    if (stockQuantity === undefined) {
        return res.status(400).json({
            success: false,
            message: 'Stock quantity is required',
            error: 'STOCK_REQUIRED'
        });
    }

    if (isNaN(parseInt(stockQuantity)) || parseInt(stockQuantity) < 0) {
        return res.status(400).json({
            success: false,
            message: 'Stock quantity must be a non-negative number',
            error: 'STOCK_INVALID'
        });
    }

    next();
};

// ==================== PUBLIC GET ROUTES ====================

// Get all products with filtering, sorting, and pagination
router.get('/', productController.getAllProducts);

// Get products on sale
router.get('/sale', productController.getProductsOnSale);

// Get low stock products
router.get('/low-stock', productController.getLowStockProducts);

// Get all in-stock products
router.get('/in-stock', productController.getInStockProducts);

// Get product statistics
router.get('/stats', productController.getProductStats);

// Get products by category
router.get('/category/:category', productController.getProductsByCategory);

// Get single product by ID
router.get('/:id', productController.getProductById);

// ==================== PRODUCT CRUD ROUTES ====================

// Create new product
router.post(
    '/',
    upload.array('files', 10), // Accept up to 10 files (images/videos mixed)
    handleUploadErrors,
    validateProductCreation,
    uploadToCloudinary,
    productController.createProduct
);

// Update product
router.put(
    '/:id',
    upload.array('files', 10),
    handleUploadErrors,
    validateProductUpdate,
    uploadToCloudinary,
    productController.updateProduct
);

// Delete product
router.delete('/:id', productController.deleteProduct);

// ==================== STOCK MANAGEMENT ROUTES ====================

// Update product stock (add/subtract/set)
router.put(
    '/:id/stock',
    validateStockUpdate,
    productController.updateStock
);

// Reduce stock after purchase
router.put(
    '/:id/reduce-stock',
    productController.reduceStock
);

// ==================== HEALTH CHECK ROUTES ====================

// Cloudinary health check
router.get('/health/cloudinary', async (req, res) => {
    try {
        const cloudinary = require('../config/cloudinary');
        const config = cloudinary.config();

        if (!config.cloud_name || !config.api_key) {
            throw new Error('Cloudinary configuration missing');
        }

        const result = await Promise.race([
            cloudinary.api.ping(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Cloudinary timeout after 5 seconds')), 5000)
            )
        ]);

        res.json({
            success: true,
            status: 'healthy',
            service: 'Cloudinary',
            details: {
                cloud_name: config.cloud_name,
                api_key_configured: !!config.api_key,
                responsive: result === 'pong'
            },
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('❌ Cloudinary health check failed:', err);
        res.status(503).json({
            success: false,
            status: 'unhealthy',
            service: 'Cloudinary',
            error: process.env.NODE_ENV === 'production'
                ? 'Media service unavailable'
                : err.message,
            timestamp: new Date().toISOString()
        });
    }
});

// API health check
router.get('/health/api', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        service: 'Product API',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime()
    });
});

// Database health check
router.get('/health/database', async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const dbState = mongoose.connection.readyState;

        const states = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };

        if (dbState !== 1) {
            throw new Error(`Database ${states[dbState]}`);
        }

        const Product = require('../models/ProductModel');
        await Product.findOne().limit(1).lean();

        res.json({
            success: true,
            status: 'healthy',
            service: 'Database',
            state: states[dbState],
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('❌ Database health check failed:', err);
        res.status(503).json({
            success: false,
            status: 'unhealthy',
            service: 'Database',
            error: process.env.NODE_ENV === 'production'
                ? 'Database unavailable'
                : err.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Comprehensive system health check
router.get('/health', async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const cloudinary = require('../config/cloudinary');

        const health = {
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                api: {
                    status: 'healthy',
                    uptime: process.uptime()
                },
                database: {
                    status: mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy',
                    state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState]
                },
                cloudinary: {
                    status: cloudinary.config().cloud_name ? 'healthy' : 'unhealthy',
                    configured: !!cloudinary.config().cloud_name
                }
            }
        };

        const allHealthy = Object.values(health.services).every(s => s.status === 'healthy');
        health.success = allHealthy;
        health.status = allHealthy ? 'healthy' : 'degraded';

        res.status(allHealthy ? 200 : 503).json(health);

    } catch (err) {
        console.error('❌ System health check failed:', err);
        res.status(503).json({
            success: false,
            status: 'unhealthy',
            error: process.env.NODE_ENV === 'production'
                ? 'System check failed'
                : err.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ==================== ERROR HANDLERS ====================

// 404 handler for undefined routes
router.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        error: 'NOT_FOUND',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});

// Global error handler
router.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? {
            message: err.message,
            stack: err.stack,
            name: err.name
        } : 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;