const Cooperate = require('../models/CooperateModel');
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
                    console.error(`Error deleting Cooperate ${type} from Cloudinary:`, err);
                }
            }
        })
    );
};

// ===== Validate Cooperate data =====
const validateCooperateData = (data) => {
    if (!data.name || !data.price) {
        throw new Error('Name and price are required');
    }
    if (data.price <= 0) {
        throw new Error('Price must be greater than 0');
    }
};

// ===== GET all Cooperate items =====
exports.getAllCooperate = async (req, res) => {
    try {
        const items = await Cooperate.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: items });
    } catch (err) {
        console.error('Error fetching Cooperate items:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch Cooperate items' });
    }
};

// ===== GET single Cooperate item =====
exports.getCooperateById = async (req, res) => {
    try {
        const item = await Cooperate.findById(req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Cooperate item not found' });
        }
        res.status(200).json({ success: true, data: item });
    } catch (err) {
        console.error('Error fetching Cooperate item:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch Cooperate item' });
    }
};

// ===== POST create Cooperate item =====
exports.createCooperate = async (req, res) => {
    try {
        validateCooperateData(req.body);

        let images = [];
        let videos = [];

        if (req.cloudinaryUploads?.images?.length > 0) {
            images = req.cloudinaryUploads.images.map(upload => ({
                imageUrl: upload.url,
                publicId: upload.public_id,
                altText: upload.originalname || 'cooperate-image'
            }));
        }

        if (req.cloudinaryUploads?.videos?.length > 0) {
            videos = req.cloudinaryUploads.videos.map(upload => ({
                videoUrl: upload.url,
                publicId: upload.public_id,
                title: upload.originalname || 'cooperate-video'
            }));
        }

        const data = {
            ...req.body,
            images: images.length > 0 ? images : req.body.images || [],
            videos: videos.length > 0 ? videos : req.body.videos || []
        };

        const item = await Cooperate.create(data);

        res.status(201).json({ success: true, data: item });
    } catch (err) {
        console.error('Error creating Cooperate item:', err);

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
                : err.message || 'Failed to create Cooperate item'
        });
    }
};

// ===== PUT update Cooperate item =====
exports.updateCooperate = async (req, res) => {
    try {
        validateCooperateData(req.body);

        const currentItem = await Cooperate.findById(req.params.id);
        if (!currentItem) {
            return res.status(404).json({ success: false, error: 'Cooperate item not found' });
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
                altText: upload.originalname || 'cooperate-image'
            }));
        }

        if (req.cloudinaryUploads?.videos?.length > 0) {
            if (currentItem.videos?.length > 0) {
                await deleteCloudinaryFiles(currentItem.videos, 'video');
            }
            videos = req.cloudinaryUploads.videos.map(upload => ({
                videoUrl: upload.url,
                publicId: upload.public_id,
                title: upload.originalname || 'cooperate-video'
            }));
        }

        const updatedData = {
            ...req.body,
            images,
            videos
        };

        const updatedItem = await Cooperate.findByIdAndUpdate(
            req.params.id,
            updatedData,
            { new: true, runValidators: true }
        );

        res.status(200).json({ success: true, data: updatedItem });
    } catch (err) {
        console.error('Error updating Cooperate item:', err);

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
                : err.message || 'Failed to update Cooperate item'
        });
    }
};

// ===== DELETE Cooperate item =====
exports.deleteCooperate = async (req, res) => {
    try {
        const item = await Cooperate.findByIdAndDelete(req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Cooperate item not found' });
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
            message: 'Cooperate item deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting Cooperate item:', err);
        res.status(500).json({ success: false, error: 'Failed to delete Cooperate item' });
    }
};
