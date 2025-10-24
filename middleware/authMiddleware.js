// middlewares/AuthMiddleware.js
const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminModel');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    logger.error('CRITICAL: JWT_SECRET is not defined in environment variables');
    throw new Error('JWT_SECRET must be defined');
}

// ====== RATE LIMITERS ======

// General authentication endpoints rate limiter
const AUTH_LIMITER = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: {
        success: false,
        message: 'Too many requests from this IP. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    handler: (req, res) => {
        logger.warn(`Rate limit exceeded for IP: ${req.ip} - ${req.method} ${req.originalUrl}`);
        res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again later.',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    }
});

// Strict login rate limiter
const LOGIN_LIMITER = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 login attempts per window
    message: {
        success: false,
        message: 'Too many login attempts. Please try again later.',
        code: 'LOGIN_RATE_LIMIT_EXCEEDED'
    },
    skipSuccessfulRequests: true, // Don't count successful logins
    skipFailedRequests: false,
    handler: (req, res) => {
        logger.warn(`Login rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            success: false,
            message: 'Too many login attempts. Please wait 15 minutes and try again.',
            code: 'LOGIN_RATE_LIMIT_EXCEEDED',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    }
});

// Password reset rate limiter
const PASSWORD_RESET_LIMITER = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 reset attempts per hour
    message: {
        success: false,
        message: 'Too many password reset attempts. Please try again later.',
        code: 'RESET_RATE_LIMIT_EXCEEDED'
    },
    handler: (req, res) => {
        logger.warn(`Password reset rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            success: false,
            message: 'Too many password reset attempts. Please wait 1 hour and try again.',
            code: 'RESET_RATE_LIMIT_EXCEEDED',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    }
});

// Registration rate limiter
const REGISTRATION_LIMITER = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 registration attempts per hour
    message: {
        success: false,
        message: 'Too many registration attempts. Please try again later.',
        code: 'REGISTRATION_RATE_LIMIT_EXCEEDED'
    },
    handler: (req, res) => {
        logger.warn(`Registration rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            success: false,
            message: 'Too many registration attempts. Please wait 1 hour and try again.',
            code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    }
});

// ====== HELPER FUNCTIONS ======

/**
 * Extract JWT token from request
 * Checks cookies first, then Authorization header
 */
const extractToken = (req) => {
    // Check for token in cookies (preferred method)
    if (req.cookies?.adminToken) {
        return req.cookies.adminToken;
    }

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader) {
        if (authHeader.toLowerCase().startsWith('bearer ')) {
            return authHeader.substring(7).trim();
        }
        // Also support without 'Bearer ' prefix
        return authHeader.trim();
    }

    return null;
};

/**
 * Verify JWT token and return decoded payload
 */
const verifyToken = (token) => {
    if (!token) {
        throw new Error('Authorization token required');
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Validate token structure
        if (!decoded._id && !decoded.id) {
            throw new Error('Invalid token payload');
        }

        return decoded;
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            throw new Error('Token expired');
        }
        if (err.name === 'JsonWebTokenError') {
            throw new Error('Invalid token');
        }
        throw new Error('Token verification failed');
    }
};

/**
 * Authenticate user from decoded token
 * Performs comprehensive validation
 */
const authenticateUser = async (decoded, req) => {
    // Extract user ID (support both _id and id)
    const userId = decoded._id || decoded.id;

    if (!userId) {
        throw new Error('Invalid token payload');
    }

    // Find user by ID
    const user = await AdminUser.findById(userId);

    if (!user) {
        throw new Error('User not found');
    }

    // Check if account is deleted
    if (user.isDeleted) {
        throw new Error('Account has been deleted');
    }

    // Check account approval status
    if (user.status !== 'approved') {
        throw new Error(`Account ${user.status}`);
    }

    // Check if account is locked
    if (user.isLocked) {
        const unlockTime = Math.ceil((user.lockoutUntil - Date.now()) / 60000);
        throw new Error(`Account locked. Try again in ${unlockTime} minutes`);
    }

    // Verify session is still active (if sessionId is in token)
    if (decoded.sessionId) {
        const activeSession = user.activeSessions.find(
            session => session.sessionId === decoded.sessionId && session.isActive
        );

        if (!activeSession) {
            throw new Error('Session expired or invalid');
        }

        // Check if session has expired based on expiresAt
        if (activeSession.expiresAt && activeSession.expiresAt < new Date()) {
            activeSession.isActive = false;
            await user.save();
            throw new Error('Session expired');
        }

        // Update session activity timestamp
        user.updateSessionActivity(decoded.sessionId);
        await user.save();

        return { user, sessionId: decoded.sessionId };
    }

    return { user, sessionId: null };
};

/**
 * Send standardized authentication error response
 */
const sendAuthError = (res, error, req) => {
    const errorMap = {
        'Authorization token required': { status: 401, code: 'NO_TOKEN' },
        'Token expired': { status: 401, code: 'TOKEN_EXPIRED' },
        'Invalid token': { status: 401, code: 'INVALID_TOKEN' },
        'Token verification failed': { status: 401, code: 'TOKEN_VERIFICATION_FAILED' },
        'Invalid token payload': { status: 401, code: 'INVALID_PAYLOAD' },
        'User not found': { status: 401, code: 'USER_NOT_FOUND' },
        'Account has been deleted': { status: 403, code: 'ACCOUNT_DELETED' },
        'Session expired or invalid': { status: 401, code: 'SESSION_EXPIRED' },
        'Session expired': { status: 401, code: 'SESSION_EXPIRED' },
    };

    // Handle account status errors
    if (error.message.startsWith('Account ')) {
        if (error.message.includes('locked')) {
            return res.status(423).json({
                success: false,
                message: error.message,
                code: 'ACCOUNT_LOCKED'
            });
        }
        return res.status(403).json({
            success: false,
            message: error.message,
            code: 'ACCOUNT_NOT_APPROVED'
        });
    }

    const { status, code } = errorMap[error.message] || { status: 401, code: 'AUTH_ERROR' };

    // Log authentication failures
    logger.warn(`Auth failure: ${error.message} - IP: ${req?.ip} - Path: ${req?.originalUrl}`);

    return res.status(status).json({
        success: false,
        message: error.message,
        code
    });
};

// ====== MIDDLEWARE FUNCTIONS ======

/**
 * Main authentication middleware
 * Protects routes that require authentication
 */
const protect = async (req, res, next) => {
    try {
        // Extract token from request
        const token = extractToken(req);

        if (!token) {
            throw new Error('Authorization token required');
        }

        // Verify token
        const decoded = verifyToken(token);

        // Authenticate user
        const { user, sessionId } = await authenticateUser(decoded, req);

        // Attach user and session to request
        req.user = user;
        req.sessionId = sessionId;
        req.tokenPayload = decoded;

        // Log successful authentication (debug only)
        logger.debug(`Authenticated: ${user.email} - ${req.method} ${req.originalUrl}`);

        next();
    } catch (err) {
        sendAuthError(res, err, req);
    }
};

/**
 * Principal admin only middleware
 * Requires user to be a principal admin
 */
const principalOnly = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
            code: 'AUTH_REQUIRED'
        });
    }

    if (!req.user.isPrincipal()) {
        logger.warn(`Unauthorized principal access attempt: ${req.user.email} - ${req.method} ${req.originalUrl}`);
        return res.status(403).json({
            success: false,
            message: 'Principal admin privileges required',
            code: 'INSUFFICIENT_PRIVILEGES'
        });
    }

    logger.info(`Principal admin access: ${req.user.email} - ${req.method} ${req.originalUrl}`);
    next();
};

/**
 * Admin or principal middleware
 * Requires user to be either admin or principal
 */
const adminOrPrincipal = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
            code: 'AUTH_REQUIRED'
        });
    }

    if (!req.user.canAccessAdmin()) {
        logger.warn(`Unauthorized admin access attempt: ${req.user.email} - ${req.method} ${req.originalUrl}`);
        return res.status(403).json({
            success: false,
            message: 'Admin privileges required',
            code: 'INSUFFICIENT_PRIVILEGES'
        });
    }

    next();
};

/**
 * Optional authentication middleware
 * Authenticates user if token is present, but doesn't fail if missing
 */
const optionalAuth = async (req, res, next) => {
    try {
        const token = extractToken(req);

        if (token) {
            const decoded = verifyToken(token);
            const { user, sessionId } = await authenticateUser(decoded, req);
            req.user = user;
            req.sessionId = sessionId;
            req.tokenPayload = decoded;
        }
    } catch (err) {
        // Don't fail, just log
        logger.debug(`Optional auth failed: ${err.message}`);
    }

    next();
};

/**
 * Security headers middleware
 * Adds security-related HTTP headers
 */
const securityHeaders = (req, res, next) => {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy (basic)
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    );

    // HSTS for production
    if (process.env.NODE_ENV === 'production') {
        res.setHeader(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains; preload'
        );
    }

    next();
};

/**
 * Request sanitization middleware
 * Sanitizes user input to prevent XSS and injection attacks
 */
const sanitizeRequest = (req, res, next) => {
    const sanitize = (obj) => {
        if (typeof obj === 'string') {
            // Remove potentially dangerous characters
            return obj
                .replace(/<script[^>]*>.*?<\/script>/gi, '')
                .replace(/<[^>]+>/g, '')
                .trim();
        }
        if (Array.isArray(obj)) {
            return obj.map(sanitize);
        }
        if (obj && typeof obj === 'object') {
            const sanitized = {};
            for (const key in obj) {
                sanitized[key] = sanitize(obj[key]);
            }
            return sanitized;
        }
        return obj;
    };

    if (req.body) {
        req.body = sanitize(req.body);
    }
    if (req.query) {
        req.query = sanitize(req.query);
    }
    if (req.params) {
        req.params = sanitize(req.params);
    }

    next();
};

/**
 * Validate MongoDB ObjectId middleware
 */
const validateObjectId = (paramName = 'id') => {
    return (req, res, next) => {
        const id = req.params[paramName];

        if (!id) {
            return res.status(400).json({
                success: false,
                message: `${paramName} is required`,
                code: 'MISSING_PARAMETER'
            });
        }

        // Simple ObjectId validation (24 hex characters)
        if (!/^[a-f\d]{24}$/i.test(id)) {
            return res.status(400).json({
                success: false,
                message: `Invalid ${paramName} format`,
                code: 'INVALID_ID'
            });
        }

        next();
    };
};

// ====== EXPORTS ======

module.exports = {
    // Main middlewares
    protect,
    principalOnly,
    adminOrPrincipal,
    optionalAuth,

    // Security middlewares
    securityHeaders,
    sanitizeRequest,
    validateObjectId,

    // Rate limiters
    AUTH_LIMITER,
    LOGIN_LIMITER,
    PASSWORD_RESET_LIMITER,
    REGISTRATION_LIMITER,

    // Helper functions (exported for testing)
    extractToken,
    verifyToken,
    authenticateUser
};