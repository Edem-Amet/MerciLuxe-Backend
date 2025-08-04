const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true // force HTTPS
});

// Utility functions
cloudinary.utils = {
    // Extract public ID from Cloudinary URL
    getPublicId: (url) => {
        if (!url) return null;
        const matches = url.match(/upload\/(?:v\d+\/)?([^\.]+)/);
        return matches ? matches[1] : null;
    },

    // Generate optimized image URL
    optimizedUrl: (url, options = {}) => {
        if (!url) return null;
        const publicId = cloudinary.utils.getPublicId(url);
        if (!publicId) return url;

        const defaults = {
            quality: 'auto:good',
            format: 'webp',
            fetch_format: 'auto',
            dpr: 'auto'
        };

        const transformOptions = { ...defaults, ...options };
        return cloudinary.url(publicId, transformOptions);
    }
};

module.exports = cloudinary;