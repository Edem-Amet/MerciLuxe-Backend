const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const AdminUser = require('../models/AdminModel');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Constants
const TOKEN_PREFIX = 'Bearer ';
const JWT_SECRET = process.env.JWT_SECRET;

// Rate limiters
const AUTH_LIMITER = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Max 100 attempts
    message: 'Too many authentication attempts. Please try again later.',
    keyGenerator: (req) => req.ip,
});

const PASSWORD_RESET_LIMITER = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Max 5 reset attempts per hour
    message: 'Too many password reset attempts. Please try again later.',
    keyGenerator: (req) => req.ip,
});

/**
 * Extract JWT token from Authorization header or cookie
 */
const extractToken = (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.toLowerCase().startsWith(TOKEN_PREFIX.toLowerCase())) {
        return authHeader.split(' ')[1];
    }
    if (req.cookies?.token) {
        return req.cookies.token;
    }
    return null;
};

/**
 * Verify JWT token and return decoded payload
 */
const verifyToken = (token) => {
    if (!token || typeof token !== 'string') {
        throw new Error('Invalid token format');
    }
    return jwt.verify(token, JWT_SECRET);
};

/**
 * Authenticate the user using token and check roles
 */
const authenticateUser = async (token, requireAdmin = false) => {
    try {
        const decoded = verifyToken(token);

        if (!decoded?._id) {
            throw new Error('Invalid token payload');
        }

        const user = await AdminUser.findById(decoded._id).select('-password');

        if (!user) {
            throw new Error('User not found');
        }

        if (!user.isVerified) {
            throw new Error('Please verify your email first');
        }

        if (requireAdmin && !user.isAdmin) {
            throw new Error('Admin privileges required');
        }

        return user;
    } catch (error) {
        logger.error(`Authentication failed: ${error.message}`);
        throw error;
    }
};

/**
 * Format and send error response
 */
const authResponse = (res, error) => {
    const statusMap = {
        TokenExpiredError: 401,
        JsonWebTokenError: 401,
        NotBeforeError: 401,
        'Authorization token required': 401,
        'Invalid token format': 401,
        'Invalid token payload': 401,
        'User not found': 401,
        'Please verify your email first': 403,
        'Admin privileges required': 403,
        'Invalid or expired reset code': 400,
        'Password reset not requested': 400
    };

    const statusCode = statusMap[error.message] || 401;

    return res.status(statusCode).json({
        success: false,
        message: error.message,
        error: error.name || 'AuthenticationError',
        timestamp: new Date().toISOString(),
    });
};

/**
 * Middleware: Protect routes for authenticated users only
 */
const protect = asyncHandler(async (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token) throw new Error('Authorization token required');

        req.user = await authenticateUser(token);
        next();
    } catch (error) {
        authResponse(res, error);
    }
});

/**
 * Middleware: Admin-only access
 */
const admin = [
    AUTH_LIMITER,
    asyncHandler(async (req, res, next) => {
        try {
            const token = extractToken(req);
            if (!token) throw new Error('Authorization token required');

            req.user = await authenticateUser(token, true);
            next();
        } catch (error) {
            authResponse(res, error);
        }
    }),
];

module.exports = {
    protect,
    admin,
    PASSWORD_RESET_LIMITER,
    AUTH_LIMITER
};