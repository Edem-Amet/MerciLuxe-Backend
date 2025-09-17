// routes/adminRoutes.js
const express = require('express');
const router = express.Router();

const {
    registerAdmin,
    loginAdmin,
    logoutAdmin,
    logoutAllDevices,
    getProfile,
    getDashboardStats,
    getActiveSessions,
    updateNotificationPreferences,
    changePassword,
    verifyResetCode,

    // Principal Admin functions
    getPendingRegistrations,
    approveAdmin,
    rejectAdmin,
    getAllAdmins,
    toggleAdminStatus,

    // Password reset
    requestPasswordReset,
    resetPassword
} = require('../controllers/AdminController');

const {
    protect,
    principalOnly,
    adminOrPrincipal,
    securityHeaders,
    LOGIN_LIMITER,
    PASSWORD_RESET_LIMITER,
    REGISTRATION_LIMITER,
    AUTH_LIMITER
} = require('../middleware/authMiddleware');

// Apply security headers to all routes
router.use(securityHeaders);

// ===== PUBLIC ROUTES (No authentication required) =====
router.post('/register', REGISTRATION_LIMITER, registerAdmin);
router.post('/login', LOGIN_LIMITER, loginAdmin);
router.post('/request-password-reset', PASSWORD_RESET_LIMITER, requestPasswordReset);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password', PASSWORD_RESET_LIMITER, resetPassword);

// ===== PROTECTED ROUTES (Require authentication) =====

// Profile and auth routes
router.get('/profile', AUTH_LIMITER, protect, getProfile);
router.post('/logout', protect, logoutAdmin);

// Dashboard and stats - any authenticated admin
router.get('/dashboard-stats', protect, adminOrPrincipal, getDashboardStats);

// Security settings - any authenticated admin
router.get('/active-sessions', protect, getActiveSessions);
router.post('/update-notifications', protect, updateNotificationPreferences);
router.post('/change-password', protect, changePassword);

// ===== PRINCIPAL ADMIN ONLY ROUTES =====

// Logout all devices - principal only
router.post('/logout-all', protect, principalOnly, logoutAllDevices);

// Admin management - principal only
router.get('/pending-registrations', protect, principalOnly, getPendingRegistrations);
router.post('/approve/:adminId', protect, principalOnly, approveAdmin);
router.post('/reject/:adminId', protect, principalOnly, rejectAdmin);
router.patch('/toggle-status/:adminId', protect, principalOnly, toggleAdminStatus);
router.get('/admins', protect, principalOnly, getAllAdmins);

// ===== TEST/DEBUG ROUTES =====

// Health check
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Admin routes are working',
        timestamp: new Date().toISOString()
    });
});

// Test authentication
router.get('/test-auth', protect, (req, res) => {
    res.json({
        success: true,
        message: 'Authentication working',
        user: {
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            status: req.user.status,
            isPrincipal: req.user.isPrincipal()
        }
    });
});

// Test principal access
router.get('/test-principal', protect, principalOnly, (req, res) => {
    res.json({
        success: true,
        message: 'Principal access working',
        user: {
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            isPrincipal: true
        }
    });
});

module.exports = router;