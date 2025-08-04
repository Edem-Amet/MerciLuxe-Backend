const multer = require('multer');
const cloudinary = require('../config/cloudinary');

// Configure Cloudinary
cloudinary.config({ secure: true });

// Multer configuration
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Cloudinary upload middleware
const uploadToCloudinary = async (req, res, next) => {
    if (!req.files || req.files.length === 0) return next();

    try {
        req.cloudinaryUploads = await Promise.all(
            req.files.map(file => new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: 'hero_images' },
                    (error, result) => error ? reject(error) : resolve(result)
                );
                uploadStream.end(file.buffer);
            }))
        );
        next();
    } catch (error) {
        console.error('Upload failed:', error);
        res.status(500).json({ error: 'Image upload failed' });
    }
};

module.exports = { upload, uploadToCloudinary };