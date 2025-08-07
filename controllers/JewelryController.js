const Jewelry = require('../models/JewelryModel');
const cloudinary = require('../config/cloudinary');

// Helper to delete images from Cloudinary
const deleteCloudinaryImages = async (images) => {
    if (!images || images.length === 0) return;
    await Promise.all(images.map(async (image) => {
        if (image.publicId) {
            try {
                await cloudinary.uploader.destroy(image.publicId);
            } catch (err) {
                console.error('Error deleting jewelry image from Cloudinary:', err);
            }
        }
    }));
};

// Validate jewelry data
const validateJewelryData = (jewelryData) => {
    if (!jewelryData.name || !jewelryData.price) {
        throw new Error('Name and price are required');
    }
    if (jewelryData.price <= 0) {
        throw new Error('Price must be greater than 0');
    }
};

// GET all jewelry items
exports.getAllJewelry = async (req, res) => {
    try {
        const jewelryItems = await Jewelry.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            data: jewelryItems
        });
    } catch (err) {
        console.error('Error fetching jewelry:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch jewelry items'
        });
    }
};

// GET single jewelry item
exports.getJewelryById = async (req, res) => {
    try {
        const jewelry = await Jewelry.findById(req.params.id);
        if (!jewelry) {
            return res.status(404).json({
                success: false,
                error: 'Jewelry item not found'
            });
        }

        res.status(200).json({
            success: true,
            data: jewelry
        });
    } catch (err) {
        console.error('Error fetching jewelry item:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch jewelry item'
        });
    }
};

// POST create new jewelry item
exports.createJewelry = async (req, res) => {
    try {
        validateJewelryData(req.body);

        // Process images if uploaded
        let images = [];
        if (req.cloudinaryUploads?.length > 0) {
            images = req.cloudinaryUploads.map(upload => ({
                imageUrl: upload.url,
                publicId: upload.public_id,
                altText: upload.originalname || 'jewelry-image'
            }));
        }

        const jewelryData = {
            ...req.body,
            images: images.length > 0 ? images : req.body.images || []
        };

        const jewelry = await Jewelry.create(jewelryData);

        res.status(201).json({
            success: true,
            data: jewelry
        });
    } catch (err) {
        console.error('Error creating jewelry:', err);

        // Cleanup on error
        if (req.cloudinaryUploads?.length > 0) {
            await deleteCloudinaryImages(req.cloudinaryUploads);
        }

        res.status(500).json({
            success: false,
            error: err.name === 'ValidationError'
                ? Object.values(err.errors).map(val => val.message)
                : err.message || 'Failed to create jewelry item'
        });
    }
};

// PUT update jewelry item
exports.updateJewelry = async (req, res) => {
    try {
        validateJewelryData(req.body);

        const currentJewelry = await Jewelry.findById(req.params.id);
        if (!currentJewelry) {
            return res.status(404).json({
                success: false,
                error: 'Jewelry item not found'
            });
        }

        // Process image updates
        let images = currentJewelry.images || [];
        if (req.cloudinaryUploads?.length > 0) {
            // Delete old images if new ones are being uploaded
            if (currentJewelry.images?.length > 0) {
                await deleteCloudinaryImages(currentJewelry.images);
            }

            images = req.cloudinaryUploads.map(upload => ({
                imageUrl: upload.url,
                publicId: upload.public_id,
                altText: upload.originalname || 'jewelry-image'
            }));
        }

        const updatedData = {
            ...req.body,
            images: images
        };

        const updatedJewelry = await Jewelry.findByIdAndUpdate(
            req.params.id,
            updatedData,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            data: updatedJewelry
        });
    } catch (err) {
        console.error('Error updating jewelry:', err);

        // Cleanup on error
        if (req.cloudinaryUploads?.length > 0) {
            await deleteCloudinaryImages(req.cloudinaryUploads);
        }

        res.status(500).json({
            success: false,
            error: err.name === 'ValidationError'
                ? Object.values(err.errors).map(val => val.message)
                : err.message || 'Failed to update jewelry item'
        });
    }
};

// DELETE jewelry item
exports.deleteJewelry = async (req, res) => {
    try {
        const jewelry = await Jewelry.findByIdAndDelete(req.params.id);
        if (!jewelry) {
            return res.status(404).json({
                success: false,
                error: 'Jewelry item not found'
            });
        }

        // Delete associated images
        if (jewelry.images?.length > 0) {
            await deleteCloudinaryImages(jewelry.images);
        }

        res.status(200).json({
            success: true,
            data: {},
            message: 'Jewelry item deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting jewelry:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to delete jewelry item'
        });
    }
};