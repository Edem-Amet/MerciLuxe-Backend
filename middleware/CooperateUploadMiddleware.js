const multer = require('multer');
const cloudinary = require('../config/cloudinary');

// Configure Cloudinary
cloudinary.config({ secure: true });

// In-memory storage for multer
const storage = multer.memoryStorage();

// Allow both image and video types
const fileFilter = (req, file, cb) => {
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/mov', 'video/quicktime'];

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
                const folder = isVideo ? 'cooperate_videos' : 'cooperate_images';

                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        folder,
                        resource_type: isVideo ? 'video' : 'image'
                    },
                    (error, result) => {
                        if (error) {
                            reject(error);
                        } else {
                            if (isVideo) {
                                req.cloudinaryUploads.videos.push(result);
                            } else {
                                req.cloudinaryUploads.images.push(result);
                            }
                            resolve(result);
                        }
                    }
                );

                uploadStream.end(file.buffer);
            }))
        );

        next();
    } catch (error) {
        console.error('Cooperate upload failed:', error);
        res.status(500).json({ error: 'Cooperate media upload failed' });
    }
};

module.exports = { upload, uploadToCloudinary };
