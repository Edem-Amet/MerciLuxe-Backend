const multer = require('multer');
const cloudinary = require('../config/cloudinary');

// Configure Cloudinary
cloudinary.config({ secure: true });

// Use in-memory storage for multer
const storage = multer.memoryStorage();

// Only allow specific image types
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
};

// Multer middleware for uploading multiple images (max 5MB each)
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Cloudinary middleware specific to Jewelry uploads
const uploadToCloudinary = async (req, res, next) => {
    if (!req.files || req.files.length === 0) return next();

    try {
        req.cloudinaryUploads = await Promise.all(
            req.files.map(file => new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'jewelry_images' },  // <-- Change the folder name here
                    (error, result) => error ? reject(error) : resolve(result)
                );
                uploadStream.end(file.buffer);
            }))
        );
        next();
    } catch (error) {
        console.error('Jewelry upload failed:', error);
        res.status(500).json({ error: 'Jewelry image upload failed' });
    }
};

module.exports = { upload, uploadToCloudinary };
