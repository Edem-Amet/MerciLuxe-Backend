const Souvenir = require('../models/SouvenirModel');
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
                    console.error(`Error deleting Souvenir ${type} from Cloudinary:`, err);
                }
            }
        })
    );
};

// ===== Validate Souvenir data =====
const validateSouvenirData = (data) => {
    if (!data.name || !data.price) {
        throw new Error('Name and price are required');
    }
    if (data.price <= 0) {
        throw new Error('Price must be greater than 0');
    }
};

// ===== GET all Souvenir items =====
exports.getAllSouvenir = async (req, res) => {
    try {
        const items = await Souvenir.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: items });
    } catch (err) {
        console.error('Error fetching Souvenir items:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch Souvenir items' });
    }
};

// ===== GET single Souvenir item =====
exports.getSouvenirById = async (req, res) => {
    try {
        const item = await Souvenir.findById(req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Souvenir item not found' });
        }
        res.status(200).json({ success: true, data: item });
    } catch (err) {
        console.error('Error fetching Souvenir item:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch Souvenir item' });
    }
};

// ===== POST create Souvenir item =====
exports.createSouvenir = async (req, res) => {
    try {
        validateSouvenirData(req.body);

        let images = [];
        let videos = [];

        if (req.cloudinaryUploads?.images?.length > 0) {
            images = req.cloudinaryUploads.images.map(upload => ({
                imageUrl: upload.url,
                publicId: upload.public_id,
                altText: upload.originalname || 'souvenir-image'
            }));
        }

        if (req.cloudinaryUploads?.videos?.length > 0) {
            videos = req.cloudinaryUploads.videos.map(upload => ({
                videoUrl: upload.url,
                publicId: upload.public_id,
                title: upload.originalname || 'souvenir-video'
            }));
        }

        const data = {
            ...req.body,
            images: images.length > 0 ? images : req.body.images || [],
            videos: videos.length > 0 ? videos : req.body.videos || []
        };

        const item = await Souvenir.create(data);

        res.status(201).json({ success: true, data: item });
    } catch (err) {
        console.error('Error creating Souvenir item:', err);

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
                : err.message || 'Failed to create Souvenir item'
        });
    }
};

// ===== PUT update Souvenir item =====
exports.updateSouvenir = async (req, res) => {
    try {
        validateSouvenirData(req.body);

        const currentItem = await Souvenir.findById(req.params.id);
        if (!currentItem) {
            return res.status(404).json({ success: false, error: 'Souvenir item not found' });
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
                altText: upload.originalname || 'souvenir-image'
            }));
        }

        if (req.cloudinaryUploads?.videos?.length > 0) {
            if (currentItem.videos?.length > 0) {
                await deleteCloudinaryFiles(currentItem.videos, 'video');
            }
            videos = req.cloudinaryUploads.videos.map(upload => ({
                videoUrl: upload.url,
                publicId: upload.public_id,
                title: upload.originalname || 'souvenir-video'
            }));
        }

        const updatedData = {
            ...req.body,
            images,
            videos
        };

        const updatedItem = await Souvenir.findByIdAndUpdate(
            req.params.id,
            updatedData,
            { new: true, runValidators: true }
        );

        res.status(200).json({ success: true, data: updatedItem });
    } catch (err) {
        console.error('Error updating Souvenir item:', err);

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
                : err.message || 'Failed to update Souvenir item'
        });
    }
};

// ===== DELETE Souvenir item =====
exports.deleteSouvenir = async (req, res) => {
    try {
        const item = await Souvenir.findByIdAndDelete(req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, error: 'Souvenir item not found' });
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
            message: 'Souvenir item deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting Souvenir item:', err);
        res.status(500).json({ success: false, error: 'Failed to delete Souvenir item' });
    }
};
