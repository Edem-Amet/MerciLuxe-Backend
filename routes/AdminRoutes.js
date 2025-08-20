const express = require('express');
const router = express.Router();
const {
    registerAdmin,
    verifyEmail,
    loginAdmin,
    requestPasswordReset,
    verifyResetCode,
    resetPassword
} = require('../controllers/AdminController');
const { PASSWORD_RESET_LIMITER } = require('../middleware/authMiddleware');


// Public Routes
router.post('/register', registerAdmin);
router.get('/verify-email', verifyEmail);
router.post('/login', loginAdmin);

// Password Reset Routes
router.post('/request-password-reset', PASSWORD_RESET_LIMITER, requestPasswordReset);
router.post('/verify-reset-code', PASSWORD_RESET_LIMITER, verifyResetCode);
router.post('/reset-password', PASSWORD_RESET_LIMITER, resetPassword);

module.exports = router;