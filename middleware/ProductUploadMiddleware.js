const multer = require('multer');
const cloudinary = require('../config/cloudinary');

// Configure Cloudinary
cloudinary.config({ secure: true });

// In-memory storage for multer
const storage = multer.memoryStorage();

// Allow both image and video types
const fileFilter = (req, file, cb) => {
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/mov', 'video/quicktime', 'video/avi'];

    if (![...allowedImageTypes, ...allowedVideoTypes].includes(file.mimetype)) {
        return cb(new Error('Only image and video files are allowed'), false);
    }
    cb(null, true);
};

// Multer middleware for handling uploads (max 20MB per file to allow videos)
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB max
});

// Upload images/videos to Cloudinary
const uploadToCloudinary = async (req, res, next) => {
    if (!req.files || req.files.length === 0) return next();

    req.cloudinaryUploads = { images: [], videos: [] };

    try {
        await Promise.all(
            req.files.map(file => new Promise((resolve, reject) => {
                const isVideo = file.mimetype.startsWith('video/');
                const folder = isVideo ? 'products_videos' : 'products_images';

                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        folder,
                        resource_type: isVideo ? 'video' : 'image',
                        transformation: !isVideo ? [
                            { width: 1000, height: 1000, crop: 'limit', quality: 'auto' }
                        ] : undefined
                    },
                    (error, result) => {
                        if (error) {
                            console.error('Cloudinary upload error:', error);
                            reject(error);
                        } else {
                            const uploadData = {
                                url: result.secure_url,
                                public_id: result.public_id,
                                originalname: file.originalname,
                                resource_type: result.resource_type,
                                format: result.format,
                                bytes: result.bytes,
                                width: result.width,
                                height: result.height
                            };

                            if (isVideo) {
                                req.cloudinaryUploads.videos.push(uploadData);
                            } else {
                                req.cloudinaryUploads.images.push(uploadData);
                            }
                            resolve(result);
                        }
                    }
                );

                uploadStream.end(file.buffer);
            }))
        );

        console.log(`✅ Uploaded ${req.cloudinaryUploads.images.length} images and ${req.cloudinaryUploads.videos.length} videos`);
        next();
    } catch (error) {
        console.error('❌ Product media upload failed:', error);
        res.status(500).json({
            success: false,
            error: 'Product media upload failed',
            message: error.message
        });
    }
};

// Helper function to delete files from Cloudinary
const deleteFromCloudinary = async (publicIds) => {
    if (!publicIds || publicIds.length === 0) return;

    try {
        await Promise.all(
            publicIds.map(async (publicId) => {
                try {
                    // Try deleting as image first
                    await cloudinary.uploader.destroy(publicId);
                } catch (err) {
                    // If fails, try as video
                    try {
                        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
                    } catch (videoErr) {
                        console.error(`Failed to delete ${publicId}:`, videoErr);
                    }
                }
            })
        );
        console.log(`✅ Deleted ${publicIds.length} files from Cloudinary`);
    } catch (error) {
        console.error('Error deleting from Cloudinary:', error);
        throw error;
    }
};

module.exports = {
    upload,
    uploadToCloudinary,
    deleteFromCloudinary
};