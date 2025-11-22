const Product = require('../models/ProductModel');
const cloudinary = require('../config/cloudinary');

// ===== Helper to delete Cloudinary files =====
const deleteCloudinaryFiles = async (files, type = 'image') => {
    if (!files || files.length === 0) return;

    await Promise.all(
        files.map(async (file) => {
            const publicId = file.publicId || file.public_id;
            if (publicId) {
                try {
                    if (type === 'image') {
                        await cloudinary.uploader.destroy(publicId);
                    } else if (type === 'video') {
                        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
                    }
                } catch (err) {
                    console.error(`Error deleting ${type} from Cloudinary:`, err);
                }
            }
        })
    );
};

// ===== Validate Product data =====
const validateProductData = (data) => {
    if (!data.name || !data.name.trim()) {
        throw new Error('Product name is required');
    }
    if (!data.price || data.price <= 0) {
        throw new Error('Price must be greater than 0');
    }
    if (!data.category) {
        throw new Error('Category is required');
    }

    const validCategories = ['Gents', 'Haven', 'Cooperate', 'Souvenirs', 'Beads', 'Jewelry', 'Special'];
    if (!validCategories.includes(data.category)) {
        throw new Error(`Category must be one of: ${validCategories.join(', ')}`);
    }
};

// ==================== PRODUCT CONTROLLERS ====================

/**
 * GET all products with filters and pagination
 * @route GET /api/products
 * @access Public
 */
exports.getAllProducts = async (req, res) => {
    try {
        const {
            category,
            inStock,
            onSale,
            minPrice,
            maxPrice,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            page = 1,
            limit = 12
        } = req.query;

        let query = {};

        // Category filter
        if (category) {
            query.category = category;
        }

        // Stock filter
        if (inStock === 'true') {
            query.inStock = true;
            query.stockQuantity = { $gt: 0 };
        }

        // Sale filter
        if (onSale === 'true') {
            query.isOnSale = true;
            const now = new Date();
            query.$or = [
                {
                    $and: [
                        { discountStartDate: { $lte: now } },
                        { discountEndDate: { $gte: now } }
                    ]
                },
                {
                    $and: [
                        { discountStartDate: null },
                        { discountEndDate: null }
                    ]
                }
            ];
        }

        // Price range filter
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        // Search filter
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { name: searchRegex },
                { description: searchRegex }
            ];
        }

        // Sorting
        const sort = {};
        switch (sortBy) {
            case 'price':
                sort.price = sortOrder === 'asc' ? 1 : -1;
                break;
            case 'name':
                sort.name = sortOrder === 'asc' ? 1 : -1;
                break;
            case 'stock':
                sort.stockQuantity = sortOrder === 'asc' ? 1 : -1;
                break;
            default:
                sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
        }

        // Pagination
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Execute query
        const [products, total] = await Promise.all([
            Product.find(query)
                .sort(sort)
                .limit(limitNum)
                .skip(skip)
                .lean(),
            Product.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            data: {
                products,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    totalProducts: total,
                    productsPerPage: limitNum,
                    hasNextPage: pageNum * limitNum < total,
                    hasPrevPage: pageNum > 1
                }
            }
        });

    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch products'
        });
    }
};

/**
 * GET single product by ID
 * @route GET /api/products/:id
 * @access Public
 */
exports.getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        res.status(200).json({
            success: true,
            data: product
        });
    } catch (err) {
        console.error('Error fetching product:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch product'
        });
    }
};

/**
 * GET products by category
 * @route GET /api/products/category/:category
 * @access Public
 */
exports.getProductsByCategory = async (req, res) => {
    try {
        const { category } = req.params;
        const { page = 1, limit = 12, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

        const validCategories = ['Gents', 'Haven', 'Cooperate', 'Souvenirs', 'Beads', 'Jewelry', 'Special'];

        if (!validCategories.includes(category)) {
            return res.status(400).json({
                success: false,
                error: `Invalid category. Must be one of: ${validCategories.join(', ')}`
            });
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const [products, total] = await Promise.all([
            Product.findByCategory(category)
                .sort(sort)
                .limit(limitNum)
                .skip(skip)
                .lean(),
            Product.countDocuments({ category, inStock: true })
        ]);

        res.status(200).json({
            success: true,
            data: {
                products,
                category,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    totalProducts: total,
                    productsPerPage: limitNum,
                    hasNextPage: pageNum * limitNum < total,
                    hasPrevPage: pageNum > 1
                }
            }
        });

    } catch (err) {
        console.error('Error fetching products by category:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch products by category'
        });
    }
};

/**
 * GET products on sale
 * @route GET /api/products/sale
 * @access Public
 */
exports.getProductsOnSale = async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const products = await Product.findOnSale(parseInt(limit));

        res.status(200).json({
            success: true,
            data: products
        });

    } catch (err) {
        console.error('Error fetching products on sale:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch products on sale'
        });
    }
};

/**
 * GET low stock products
 * @route GET /api/products/low-stock
 * @access Public
 */
exports.getLowStockProducts = async (req, res) => {
    try {
        const products = await Product.findLowStock();

        res.status(200).json({
            success: true,
            data: products
        });

    } catch (err) {
        console.error('Error fetching low stock products:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch low stock products'
        });
    }
};

/**
 * GET all in-stock products
 * @route GET /api/products/in-stock
 * @access Public
 */
exports.getInStockProducts = async (req, res) => {
    try {
        const products = await Product.findInStock();

        res.status(200).json({
            success: true,
            data: products
        });

    } catch (err) {
        console.error('Error fetching in-stock products:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch in-stock products'
        });
    }
};

/**
 * POST create new product
 * @route POST /api/products
 * @access Public
 */
exports.createProduct = async (req, res) => {
    try {
        console.log('📦 Creating new product...');

        validateProductData(req.body);

        let images = [];
        let videos = [];

        // Handle uploaded images
        if (req.cloudinaryUploads?.images?.length > 0) {
            images = req.cloudinaryUploads.images.map(upload => ({
                imageUrl: upload.url,
                publicId: upload.public_id,
                altText: upload.originalname || 'product-image'
            }));
        }

        // Handle uploaded videos
        if (req.cloudinaryUploads?.videos?.length > 0) {
            videos = req.cloudinaryUploads.videos.map(upload => ({
                videoUrl: upload.url,
                publicId: upload.public_id,
                title: upload.originalname || 'product-video'
            }));
        }

        // Prepare product data
        const productData = {
            name: req.body.name.trim(),
            description: req.body.description || '',
            price: parseFloat(req.body.price),
            originalPrice: req.body.originalPrice ? parseFloat(req.body.originalPrice) : null,
            category: req.body.category,
            images: images.length > 0 ? images : req.body.images || [],
            videos: videos.length > 0 ? videos : req.body.videos || [],
            inStock: req.body.inStock !== undefined ? (req.body.inStock === 'true' || req.body.inStock === true) : true,
            stockQuantity: req.body.stockQuantity ? parseInt(req.body.stockQuantity) : 0,
            lowStockThreshold: req.body.lowStockThreshold ? parseInt(req.body.lowStockThreshold) : 10,
            isOnSale: req.body.isOnSale !== undefined ? (req.body.isOnSale === 'true' || req.body.isOnSale === true) : false,
            discountPercentage: req.body.discountPercentage ? parseFloat(req.body.discountPercentage) : 0,
            discountAmount: req.body.discountAmount ? parseFloat(req.body.discountAmount) : 0,
            discountStartDate: req.body.discountStartDate ? new Date(req.body.discountStartDate) : null,
            discountEndDate: req.body.discountEndDate ? new Date(req.body.discountEndDate) : null
        };

        const product = await Product.create(productData);

        console.log(`✅ Product created: ${product._id}`);

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product
        });

    } catch (err) {
        console.error('Error creating product:', err);

        // Cleanup uploaded files if creation fails
        if (req.cloudinaryUploads?.images?.length > 0) {
            await deleteCloudinaryFiles(req.cloudinaryUploads.images, 'image');
        }
        if (req.cloudinaryUploads?.videos?.length > 0) {
            await deleteCloudinaryFiles(req.cloudinaryUploads.videos, 'video');
        }

        res.status(500).json({
            success: false,
            error: err.message || 'Failed to create product'
        });
    }
};

/**
 * PUT update product
 * @route PUT /api/products/:id
 * @access Public
 */
exports.updateProduct = async (req, res) => {
    try {
        console.log(`📝 Updating product: ${req.params.id}`);

        validateProductData(req.body);

        const currentProduct = await Product.findById(req.params.id);

        if (!currentProduct) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        let images = currentProduct.images || [];
        let videos = currentProduct.videos || [];

        // Handle new images (replace old ones)
        if (req.cloudinaryUploads?.images?.length > 0) {
            console.log('🖼️ Replacing product images...');

            // Delete old images
            if (currentProduct.images?.length > 0) {
                await deleteCloudinaryFiles(currentProduct.images, 'image');
            }

            images = req.cloudinaryUploads.images.map(upload => ({
                imageUrl: upload.url,
                publicId: upload.public_id,
                altText: upload.originalname || 'product-image'
            }));
        }

        // Handle new videos (replace old ones)
        if (req.cloudinaryUploads?.videos?.length > 0) {
            console.log('🎥 Replacing product videos...');

            // Delete old videos
            if (currentProduct.videos?.length > 0) {
                await deleteCloudinaryFiles(currentProduct.videos, 'video');
            }

            videos = req.cloudinaryUploads.videos.map(upload => ({
                videoUrl: upload.url,
                publicId: upload.public_id,
                title: upload.originalname || 'product-video'
            }));
        }

        // Prepare update data
        const updatedData = {
            name: req.body.name.trim(),
            description: req.body.description || '',
            price: parseFloat(req.body.price),
            originalPrice: req.body.originalPrice ? parseFloat(req.body.originalPrice) : null,
            category: req.body.category,
            images,
            videos,
            inStock: req.body.inStock !== undefined ? (req.body.inStock === 'true' || req.body.inStock === true) : currentProduct.inStock,
            stockQuantity: req.body.stockQuantity !== undefined ? parseInt(req.body.stockQuantity) : currentProduct.stockQuantity,
            lowStockThreshold: req.body.lowStockThreshold !== undefined ? parseInt(req.body.lowStockThreshold) : currentProduct.lowStockThreshold,
            isOnSale: req.body.isOnSale !== undefined ? (req.body.isOnSale === 'true' || req.body.isOnSale === true) : currentProduct.isOnSale,
            discountPercentage: req.body.discountPercentage !== undefined ? parseFloat(req.body.discountPercentage) : currentProduct.discountPercentage,
            discountAmount: req.body.discountAmount !== undefined ? parseFloat(req.body.discountAmount) : currentProduct.discountAmount,
            discountStartDate: req.body.discountStartDate !== undefined ? (req.body.discountStartDate ? new Date(req.body.discountStartDate) : null) : currentProduct.discountStartDate,
            discountEndDate: req.body.discountEndDate !== undefined ? (req.body.discountEndDate ? new Date(req.body.discountEndDate) : null) : currentProduct.discountEndDate
        };

        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            updatedData,
            { new: true, runValidators: true }
        );

        console.log(`✅ Product updated: ${updatedProduct._id}`);

        res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            data: updatedProduct
        });

    } catch (err) {
        console.error('Error updating product:', err);

        // Cleanup failed uploads
        if (req.cloudinaryUploads?.images?.length > 0) {
            await deleteCloudinaryFiles(req.cloudinaryUploads.images, 'image');
        }
        if (req.cloudinaryUploads?.videos?.length > 0) {
            await deleteCloudinaryFiles(req.cloudinaryUploads.videos, 'video');
        }

        res.status(500).json({
            success: false,
            error: err.message || 'Failed to update product'
        });
    }
};

/**
 * DELETE product
 * @route DELETE /api/products/:id
 * @access Public
 */
exports.deleteProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Delete images from Cloudinary
        if (product.images?.length > 0) {
            await deleteCloudinaryFiles(product.images, 'image');
        }

        // Delete videos from Cloudinary
        if (product.videos?.length > 0) {
            await deleteCloudinaryFiles(product.videos, 'video');
        }

        console.log(`✅ Product deleted: ${req.params.id}`);

        res.status(200).json({
            success: true,
            data: {},
            message: 'Product deleted successfully'
        });

    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to delete product'
        });
    }
};

/**
 * PUT update product stock
 * @route PUT /api/products/:id/stock
 * @access Public
 */
exports.updateStock = async (req, res) => {
    try {
        const { stockQuantity, operation = 'set' } = req.body;

        if (stockQuantity === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Stock quantity is required'
            });
        }

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        await product.updateStock(parseInt(stockQuantity), operation);

        res.status(200).json({
            success: true,
            message: 'Stock updated successfully',
            data: product
        });

    } catch (err) {
        console.error('Error updating stock:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to update stock'
        });
    }
};

/**
 * PUT reduce stock after purchase
 * @route PUT /api/products/:id/reduce-stock
 * @access Public
 */
exports.reduceStock = async (req, res) => {
    try {
        const { quantity = 1 } = req.body;

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        if (product.stockQuantity < quantity) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient stock'
            });
        }

        await product.reduceStock(parseInt(quantity));

        res.status(200).json({
            success: true,
            message: 'Stock reduced successfully',
            data: product
        });

    } catch (err) {
        console.error('Error reducing stock:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to reduce stock'
        });
    }
};

/**
 * GET product statistics
 * @route GET /api/products/stats
 * @access Public
 */
exports.getProductStats = async (req, res) => {
    try {
        const [
            totalProducts,
            inStockCount,
            outOfStockCount,
            lowStockCount,
            onSaleCount,
            categoryBreakdown
        ] = await Promise.all([
            Product.countDocuments(),
            Product.countDocuments({ inStock: true }),
            Product.countDocuments({ inStock: false }),
            Product.countDocuments({
                inStock: true,
                $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] },
                stockQuantity: { $gt: 0 }
            }),
            Product.countDocuments({ isOnSale: true }),
            Product.aggregate([
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 },
                        avgPrice: { $avg: '$price' },
                        totalStock: { $sum: '$stockQuantity' }
                    }
                },
                { $sort: { count: -1 } }
            ])
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalProducts,
                inStockCount,
                outOfStockCount,
                lowStockCount,
                onSaleCount,
                categoryBreakdown
            }
        });

    } catch (err) {
        console.error('Error fetching product statistics:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch product statistics'
        });
    }
};