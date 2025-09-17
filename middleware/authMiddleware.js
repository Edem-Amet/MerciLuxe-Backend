const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminModel');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET;

// ====== Rate Limiters ======
const AUTH_LIMITER = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const LOGIN_LIMITER = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many login attempts. Please try again later.' },
    skipSuccessfulRequests: true,
});

const PASSWORD_RESET_LIMITER = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many password reset attempts. Please try again later.' },
});

const REGISTRATION_LIMITER = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many registration attempts. Please try again later.' },
});

// ====== Helpers ======
const extractToken = (req) => {
    if (req.cookies?.adminToken) return req.cookies.adminToken;

    const authHeader = req.headers.authorization;
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
        return authHeader.split(' ')[1];
    }
    return null;
};

const verifyToken = (token) => {
    if (!token) throw new Error('Authorization token required');
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        if (err.name === 'TokenExpiredError') throw new Error('Token expired');
        if (err.name === 'JsonWebTokenError') throw new Error('Invalid token');
        throw new Error('Token verification failed');
    }
};

const authenticateUser = async (decoded) => {
    // Check for both id and _id to handle different token formats
    const userId = decoded.id || decoded._id;

    if (!userId) {
        throw new Error('Invalid token payload');
    }

    const user = await AdminUser.findById(userId);
    if (!user) throw new Error('User not found');

    if (user.status !== 'approved') throw new Error('Account not approved');
    if (user.isLocked) throw new Error('Account temporarily locked');

    // Verify session is still active
    if (decoded.sessionId) {
        const activeSession = user.activeSessions.find(
            session => session.sessionId === decoded.sessionId && session.isActive
        );
        if (!activeSession) {
            throw new Error('Session expired or invalid');
        }
    }

    return { user, sessionId: decoded.sessionId };
};

const sendAuthError = (res, error) => {
    const errorMap = {
        'Authorization token required': { status: 401, code: 'NO_TOKEN' },
        'Token expired': { status: 401, code: 'TOKEN_EXPIRED' },
        'Invalid token': { status: 401, code: 'INVALID_TOKEN' },
        'Token verification failed': { status: 401, code: 'TOKEN_VERIFICATION_FAILED' },
        'Invalid token payload': { status: 401, code: 'INVALID_PAYLOAD' },
        'User not found': { status: 401, code: 'USER_NOT_FOUND' },
        'Account not approved': { status: 403, code: 'ACCOUNT_NOT_APPROVED' },
        'Account temporarily locked': { status: 423, code: 'ACCOUNT_LOCKED' },
        'Session expired or invalid': { status: 401, code: 'SESSION_EXPIRED' },
    };

    const { status, code } = errorMap[error.message] || { status: 401, code: 'AUTH_ERROR' };

    return res.status(status).json({
        success: false,
        message: error.message,
        code,
    });
};

// ====== Middlewares ======
const protect = async (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token) throw new Error('Authorization token required');

        const decoded = verifyToken(token);
        const { user, sessionId } = await authenticateUser(decoded);

        req.user = user;
        req.sessionId = sessionId;
        next();
    } catch (err) {
        sendAuthError(res, err);
    }
};

const principalOnly = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    if (!req.user.isPrincipal()) {
        return res.status(403).json({ success: false, message: 'Principal admin privileges required', code: 'INSUFFICIENT_PRIVILEGES' });
    }

    logger.info(`Principal admin access: ${req.user.email} - ${req.method} ${req.originalUrl}`);
    next();
};

const adminOrPrincipal = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    if (!req.user.canAccessAdmin()) {
        return res.status(403).json({ success: false, message: 'Admin privileges required', code: 'INSUFFICIENT_PRIVILEGES' });
    }

    next();
};

const securityHeaders = (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
};

module.exports = {
    protect,
    principalOnly,
    adminOrPrincipal,
    securityHeaders,
    AUTH_LIMITER,
    LOGIN_LIMITER,
    PASSWORD_RESET_LIMITER,
    REGISTRATION_LIMITER,
};