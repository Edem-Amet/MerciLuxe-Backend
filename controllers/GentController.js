const Gent = require('../models/GentModel');
const cloudinary = require('../config/cloudinary');

// ===== Helper to delete Cloudinary files =====
const deleteCloudinaryFiles = async (files, type = 'image') => {
    if (!files || files.length === 0) return;

    await Promise.all(
        files.map(async (file) => {
            if (file.publicId) {
                try {
                    if (type === 'image') {
                        await cloudinary.uploader.destroy(file.publicId);
                    } else if (type === 'video') {
                        await cloudinary.uploader.destroy(file.publicId, { resource_type: 'video' });
                    }
                } catch (err) {
                    console.error(`Error deleting Gent ${type} from Cloudinary:`, err);
                }
            }
        })
    );
};

// ===== Validate Gent data =====
const validateGentData = (data) => {
    if (!data.name || !data.price) {
        throw new Error('Name and price are required');
    }
    if (data.price <= 0) {
        throw new Error('Price must be greater than 0');
    }
};

// ===== GET all Gent items =====
exports.getAllGent = async (req, res) => {
    try {
        const items = await Gent.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: items });
    } catch (err) {
        console.error('Error fetching Gent items:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch Gent items' });
    }
};

// ===== GET single Gent item =====
exports.getGentById = async (req, res) => {
    try {
        const item = await Gent.findById(req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Gent item not found' });
        }
        res.status(200).json({ success: true, data: item });
    } catch (err) {
        console.error('Error fetching Gent item:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch Gent item' });
    }
};

// ===== POST create Gent item =====
exports.createGent = async (req, res) => {
    try {
        validateGentData(req.body);

        let images = [];
        let videos = [];

        if (req.cloudinaryUploads?.images?.length > 0) {
            images = req.cloudinaryUploads.images.map(upload => ({
                imageUrl: upload.url,
                publicId: upload.public_id,
                altText: upload.originalname || 'gent-image'
            }));
        }

        if (req.cloudinaryUploads?.videos?.length > 0) {
            videos = req.cloudinaryUploads.videos.map(upload => ({
                videoUrl: upload.url,
                publicId: upload.public_id,
                title: upload.originalname || 'gent-video'
            }));
        }

        const data = {
            ...req.body,
            images: images.length > 0 ? images : req.body.images || [],
            videos: videos.length > 0 ? videos : req.body.videos || []
        };

        const item = await Gent.create(data);

        res.status(201).json({ success: true, data: item });
    } catch (err) {
        console.error('Error creating Gent item:', err);

        // Cleanup uploaded files if creation fails
        if (req.cloudinaryUploads?.images?.length > 0) {
            await deleteCloudinaryFiles(req.cloudinaryUploads.images, 'image');
        }
        if (req.cloudinaryUploads?.videos?.length > 0) {
            await deleteCloudinaryFiles(req.cloudinaryUploads.videos, 'video');
        }

        res.status(500).json({
            success: false,
            error: err.name === 'ValidationError'
                ? Object.values(err.errors).map(val => val.message)
                : err.message || 'Failed to create Gent item'
        });
    }
};

// ===== PUT update Gent item =====
exports.updateGent = async (req, res) => {
    try {
        validateGentData(req.body);

        const currentItem = await Gent.findById(req.params.id);
        if (!currentItem) {
            return res.status(404).json({ success: false, error: 'Gent item not found' });
        }

        let images = currentItem.images || [];
        let videos = currentItem.videos || [];

        if (req.cloudinaryUploads?.images?.length > 0) {
            if (currentItem.images?.length > 0) {
                await deleteCloudinaryFiles(currentItem.images, 'image');
            }
            images = req.cloudinaryUploads.images.map(upload => ({
                imageUrl: upload.url,
                publicId: upload.public_id,
                altText: upload.originalname || 'gent-image'
            }));
        }

        if (req.cloudinaryUploads?.videos?.length > 0) {
            if (currentItem.videos?.length > 0) {
                await deleteCloudinaryFiles(currentItem.videos, 'video');
            }
            videos = req.cloudinaryUploads.videos.map(upload => ({
                videoUrl: upload.url,
                publicId: upload.public_id,
                title: upload.originalname || 'gent-video'
            }));
        }

        const updatedData = {
            ...req.body,
            images,
            videos
        };

        const updatedItem = await Gent.findByIdAndUpdate(
            req.params.id,
            updatedData,
            { new: true, runValidators: true }
        );

        res.status(200).json({ success: true, data: updatedItem });
    } catch (err) {
        console.error('Error updating Gent item:', err);

        // Cleanup failed uploads
        if (req.cloudinaryUploads?.images?.length > 0) {
            await deleteCloudinaryFiles(req.cloudinaryUploads.images, 'image');
        }
        if (req.cloudinaryUploads?.videos?.length > 0) {
            await deleteCloudinaryFiles(req.cloudinaryUploads.videos, 'video');
        }

        res.status(500).json({
            success: false,
            error: err.name === 'ValidationError'
                ? Object.values(err.errors).map(val => val.message)
                : err.message || 'Failed to update Gent item'
        });
    }
};

// ===== DELETE Gent item =====
exports.deleteGent = async (req, res) => {
    try {
        const item = await Gent.findByIdAndDelete(req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Gent item not found' });
        }

        if (item.images?.length > 0) {
            await deleteCloudinaryFiles(item.images, 'image');
        }
        if (item.videos?.length > 0) {
            await deleteCloudinaryFiles(item.videos, 'video');
        }

        res.status(200).json({
            success: true,
            data: {},
            message: 'Gent item deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting Gent item:', err);
        res.status(500).json({ success: false, error: 'Failed to delete Gent item' });
    }
};
