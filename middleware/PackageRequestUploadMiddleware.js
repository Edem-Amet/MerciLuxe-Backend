const multer = require('multer');
const path = require('path');

// Use memory storage to handle file in memory before saving
const storage = multer.memoryStorage();

// File filter configuration for package images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpg|jpeg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    // Check MIME types
    const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/webp'
    ];
    const mimetype = allowedMimeTypes.includes(file.mimetype);

    if (mimetype && extname) {
        cb(null, true);
    } else {
        cb(
            new Error('Invalid file type. Only JPG, JPEG, PNG, and WEBP images are allowed for package uploads.'),
            false
        );
    }
};

// Configure multer instance
const packageUpload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
        files: 1 // Only one image per package request
    },
    fileFilter
});

module.exports = packageUpload;
