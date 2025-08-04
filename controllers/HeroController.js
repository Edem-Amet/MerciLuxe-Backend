const Hero = require('../models/HeroModel');
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

// GET all hero sections (matches frontend expectation)
exports.getAllHeroes = async (req, res) => {
    try {
        const heroes = await Hero.find().sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: heroes // Remove one level of nesting
        });
    } catch (err) {
        console.error('Error fetching heroes:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch hero sections'
        });
    }
};

// GET single hero section
exports.getHeroById = async (req, res) => {
    try {
        const hero = await Hero.findById(req.params.id);
        if (!hero) {
            return res.status(404).json({
                success: false,
                error: 'Hero section not found'
            });
        }

        res.status(200).json({
            success: true,
            data: hero
        });
    } catch (err) {
        console.error('Error fetching hero:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch hero section'
        });
    }
};

// POST create new hero section
exports.createHero = async (req, res) => {
    try {
        const { hallTagline, heading, description, published, buttons } = req.body;

        // Validation
        if (!hallTagline || !heading || !description) {
            return res.status(400).json({
                success: false,
                error: 'Hall tagline, heading, and description are required'
            });
        }

        // Prepare images
        let images = [];
        if (req.cloudinaryUploads?.length > 0) {
            images = req.cloudinaryUploads.map(upload => ({
                imageUrl: upload.url,
                publicId: upload.public_id,
                altText: upload.originalname || 'hero-image'
            }));
        }

        // Create new hero
        const newHero = await Hero.create({
            hallTagline,
            heading,
            description,
            buttons: parseJSONField(buttons),
            published: published === 'true' || published === true,
            images
        });

        res.status(201).json({
            success: true,
            data: newHero
        });
    } catch (err) {
        console.error('Error creating hero:', err);

        // Cleanup on error
        if (req.cloudinaryUploads?.length > 0) {
            await deleteCloudinaryImages(req.cloudinaryUploads);
        }

        res.status(500).json({
            success: false,
            error: err.name === 'ValidationError'
                ? Object.values(err.errors).map(val => val.message)
                : 'Failed to create hero section'
        });
    }
};

// PUT update hero section
exports.updateHero = async (req, res) => {
    try {
        const { id } = req.params;
        const { hallTagline, heading, description, published, buttons } = req.body;

        // Validation
        if (!hallTagline || !heading || !description) {
            return res.status(400).json({
                success: false,
                error: 'Hall tagline, heading, and description are required'
            });
        }

        // Get current hero
        const currentHero = await Hero.findById(id);
        if (!currentHero) {
            return res.status(404).json({
                success: false,
                error: 'Hero section not found'
            });
        }

        // Prepare update data
        const updateData = {
            hallTagline,
            heading,
            description,
            buttons: parseJSONField(buttons),
            published: published === 'true' || published === true
        };

        // Handle image updates
        if (req.cloudinaryUploads?.length > 0) {
            // Delete old images
            if (currentHero.images?.length > 0) {
                await deleteCloudinaryImages(currentHero.images);
            }

            // Add new images
            updateData.images = req.cloudinaryUploads.map(upload => ({
                imageUrl: upload.url,
                publicId: upload.public_id,
                altText: upload.originalname || 'hero-image'
            }));
        }

        const updatedHero = await Hero.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: updatedHero
        });
    } catch (err) {
        console.error('Error updating hero:', err);

        // Cleanup on error
        if (req.cloudinaryUploads?.length > 0) {
            await deleteCloudinaryImages(req.cloudinaryUploads);
        }

        res.status(500).json({
            success: false,
            error: err.name === 'ValidationError'
                ? Object.values(err.errors).map(val => val.message)
                : 'Failed to update hero section'
        });
    }
};

// DELETE hero section
exports.deleteHero = async (req, res) => {
    try {
        const hero = await Hero.findByIdAndDelete(req.params.id);
        if (!hero) {
            return res.status(404).json({
                success: false,
                error: 'Hero section not found'
            });
        }

        // Delete associated images
        if (hero.images?.length > 0) {
            await deleteCloudinaryImages(hero.images);
        }

        res.status(200).json({
            success: true,
            data: {},
            message: 'Hero section deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting hero:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to delete hero section'
        });
    }
};