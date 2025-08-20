const jwt = require('jsonwebtoken');

/**
 * @desc    Generate JWT token for admin users
 * @param   {string} id - Admin user's MongoDB _id
 * @param   {boolean} [isAdmin=true] - Admin status (defaults to true for your admin system)
 * @param   {boolean} [isVerified=false] - Email verification status
 * @returns {string} Signed JWT token
 * @throws  {Error} If JWT_SECRET is not configured
 */
const generateAdminToken = (id, isAdmin = true, isVerified = false) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET must be configured in environment variables');
    }


    return jwt.sign(
        {
            _id: id,
            isAdmin,       // Explicitly showing admin status
            isVerified    // Including verification status
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN || '30d', // Configurable expiration
            issuer: process.env.JWT_ISSUER || 'admin-portal-api',
            audience: 'admin-portal',
            algorithm: 'HS256' // Explicit algorithm specification
        }
    );
};

module.exports = generateAdminToken;