const Category = require('../models/CategoryModel');
const cloudinary = require('../config/cloudinary');

// Helper to delete images from Cloudinary
const deleteCloudinaryImages = async (images) => {
    if (!images || images.length === 0) return;
    await Promise.all(images.map(async (image) => {
        if (image.publicId) {
            try {
                await cloudinary.uploader.destroy(image.publicId);
            } catch (err) {
                console.error('Error deleting from Cloudinary:', err);
            }
        }
    }));
};

// Parse JSON fields safely
const parseJSONField = (field) => {
    try {
        return typeof field === 'string' ? JSON.parse(field) : field || [];
    } catch (err) {
        console.error('Error parsing JSON field:', err);
        return [];
    }
};

// GET all categories
exports.getAllCategories = async (req, res) => {
    try {
        const categories = await Category.find().sort({ index: 1 });

        res.status(200).json({
            success: true,
            data: categories
        });
    } catch (err) {
        console.error('Error fetching categories:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch categories'
        });
    }
};

// GET single category
exports.getCategoryById = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }

        res.status(200).json({
            success: true,
            data: category
        });
    } catch (err) {
        console.error('Error fetching category:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch category'
        });
    }
};

// POST create category
exports.createCategory = async (req, res) => {
    try {
        const { title, link, description, isActive, index } = req.body;

        // Validation
        if (!title || !link) {
            return res.status(400).json({
                success: false,
                error: 'Title and link are required'
            });
        }

        // Prepare images
        let images = [];
        if (req.cloudinaryUploads?.length > 0) {
            images = req.cloudinaryUploads.map(upload => ({
                imageUrl: upload.url,
                publicId: upload.public_id,
                altText: upload.originalname || 'category-image'
            }));
        }

        const newCategory = await Category.create({
            title,
            link,
            description,
            isActive: isActive === 'true' || isActive === true,
            index: parseInt(index) || 0,
            images
        });

        res.status(201).json({
            success: true,
            data: newCategory
        });
    } catch (err) {
        console.error('Error creating category:', err);

        // Cleanup on error
        if (req.cloudinaryUploads?.length > 0) {
            await deleteCloudinaryImages(req.cloudinaryUploads);
        }

        res.status(500).json({
            success: false,
            error: err.name === 'ValidationError'
                ? Object.values(err.errors).map(val => val.message)
                : 'Failed to create category'
        });
    }
};

// PUT update category
exports.updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, link, description, isActive, index } = req.body;

        // Validation
        if (!title || !link) {
            return res.status(400).json({
                success: false,
                error: 'Title and link are required'
            });
        }

        // Get current category
        const currentCategory = await Category.findById(id);
        if (!currentCategory) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }

        const updateData = {
            title,
            link,
            description,
            isActive: isActive === 'true' || isActive === true,
            index: parseInt(index) || 0
        };

        // Handle image updates
        if (req.cloudinaryUploads?.length > 0) {
            if (currentCategory.images?.length > 0) {
                await deleteCloudinaryImages(currentCategory.images);
            }

            updateData.images = req.cloudinaryUploads.map(upload => ({
                imageUrl: upload.url,
                publicId: upload.public_id,
                altText: upload.originalname || 'category-image'
            }));
        }

        const updatedCategory = await Category.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: updatedCategory
        });
    } catch (err) {
        console.error('Error updating category:', err);

        if (req.cloudinaryUploads?.length > 0) {
            await deleteCloudinaryImages(req.cloudinaryUploads);
        }

        res.status(500).json({
            success: false,
            error: err.name === 'ValidationError'
                ? Object.values(err.errors).map(val => val.message)
                : 'Failed to update category'
        });
    }
};

// DELETE category
exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findByIdAndDelete(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }

        // Delete associated images
        if (category.images?.length > 0) {
            await deleteCloudinaryImages(category.images);
        }

        res.status(200).json({
            success: true,
            data: {},
            message: 'Category deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting category:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to delete category'
        });
    }
};
