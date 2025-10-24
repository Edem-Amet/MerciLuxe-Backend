// routes/AdminRoutes.js
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
    terminateSession,
    updateNotificationPreferences,
    changePassword,
    requestPasswordReset,
    verifyResetCode,
    resetPassword,
    getPendingRegistrations,
    approveAdmin,
    rejectAdmin,
    getAllAdmins,
    toggleAdminStatus,
    deleteAdmin,
    getAdminDetails,
    getSecurityReport
} = require('../controllers/AdminController');

const {
    protect,
    principalOnly,
    adminOrPrincipal,
    LOGIN_LIMITER,
    PASSWORD_RESET_LIMITER,
    REGISTRATION_LIMITER
} = require('../middleware/authMiddleware');

// ===== PUBLIC ROUTES =====
// Registration
router.post('/register', REGISTRATION_LIMITER, registerAdmin);

// Login
router.post('/login', LOGIN_LIMITER, loginAdmin);

// Password Reset
router.post('/password/reset-request', PASSWORD_RESET_LIMITER, requestPasswordReset);
router.post('/password/verify-code', PASSWORD_RESET_LIMITER, verifyResetCode);
router.post('/password/reset', PASSWORD_RESET_LIMITER, resetPassword);

// ===== PROTECTED ROUTES (All Authenticated Admins) =====
// Logout
router.post('/logout', protect, logoutAdmin);
router.post('/logout-all', protect, logoutAllDevices);

// Profile
router.get('/profile', protect, getProfile);

// Dashboard
router.get('/dashboard/stats', protect, adminOrPrincipal, getDashboardStats);

// Sessions Management
router.get('/sessions', protect, getActiveSessions);
router.delete('/sessions/:sessionId', protect, terminateSession);

// Settings
router.patch('/notifications', protect, updateNotificationPreferences);
router.post('/password/change', protect, changePassword);

// Security
router.get('/security/report', protect, getSecurityReport);

// ===== PRINCIPAL ADMIN ONLY ROUTES =====
// Admin Management
router.get('/admins/pending', protect, principalOnly, getPendingRegistrations);
router.get('/admins', protect, principalOnly, getAllAdmins);
router.get('/admins/:adminId', protect, principalOnly, getAdminDetails);

// Approval Actions
router.patch('/admins/:adminId/approve', protect, principalOnly, approveAdmin);
router.patch('/admins/:adminId/reject', protect, principalOnly, rejectAdmin);
router.patch('/admins/:adminId/toggle-status', protect, principalOnly, toggleAdminStatus);
router.delete('/admins/:adminId', protect, principalOnly, deleteAdmin);

module.exports = router;