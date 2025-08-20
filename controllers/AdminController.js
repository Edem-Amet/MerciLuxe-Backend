const AdminUser = require('../models/AdminModel');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/sendEmail');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
const RESET_CODE_EXPIRY = 15 * 60 * 1000; // 15 minutes

// Helper functions
const generateToken = (id) => jwt.sign({ _id: id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

// Register new admin
const registerAdmin = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        const existingAdmin = await AdminUser.findOne({ email: email.toLowerCase().trim() });
        if (existingAdmin) {
            return res.status(400).json({
                success: false,
                message: 'Email already in use'
            });
        }

        const adminUser = await AdminUser.create({
            name,
            email: email.toLowerCase().trim(),
            password
        });

        const verificationToken = generateToken(adminUser._id);
        adminUser.verificationToken = verificationToken;
        await adminUser.save();

        await sendVerificationEmail({
            email: adminUser.email,
            name: adminUser.name,
            token: verificationToken
        });

        return res.status(201).json({
            success: true,
            message: 'Registration successful. Check your email for verification.',
            data: {
                _id: adminUser._id,
                name: adminUser.name,
                email: adminUser.email,
                isVerified: adminUser.isVerified
            }
        });
    } catch (error) {
        logger.error(`Register Error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
};

// Email verification
const verifyEmail = async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Missing token'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const admin = await AdminUser.findById(decoded._id);
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        if (admin.isVerified) {
            return res.status(400).json({
                success: false,
                message: 'Email already verified'
            });
        }

        admin.isVerified = true;
        admin.verificationToken = undefined;
        await admin.save();

        return res.status(200).json({
            success: true,
            message: 'Email verified successfully'
        });
    } catch (error) {
        logger.error(`Email verification error: ${error.message}`);

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Server error during verification'
        });
    }
};

// Admin login
const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const admin = await AdminUser.findOne({ email: email.toLowerCase().trim() });
        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const passwordMatch = await admin.matchPassword(password);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        if (!admin.isVerified) {
            return res.status(403).json({
                success: false,
                message: 'Verify your email first'
            });
        }

        const token = generateToken(admin._id);

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        });

        return res.status(200).json({
            success: true,
            message: 'Logged in successfully',
            data: {
                _id: admin._id,
                name: admin.name,
                email: admin.email,
                isAdmin: admin.isAdmin,
                token
            }
        });
    } catch (error) {
        logger.error(`Login Error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
};

// Request password reset
const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const admin = await AdminUser.findOne({ email: email.toLowerCase().trim() });
        if (!admin) {
            // Don't reveal if email exists or not for security
            return res.status(200).json({
                success: true,
                message: 'If an account exists, a reset code has been sent'
            });
        }

        // Generate 6-digit reset code
        const resetCode = crypto.randomInt(100000, 999999).toString();
        const resetCodeExpires = new Date(Date.now() + RESET_CODE_EXPIRY);

        // Save to database
        admin.resetPasswordToken = resetCode;
        admin.resetPasswordExpires = resetCodeExpires;
        await admin.save();

        // Send email
        await sendPasswordResetEmail({
            email: admin.email,
            name: admin.name,
            code: resetCode
        });

        return res.status(200).json({
            success: true,
            message: 'Password reset code sent to your email',
            data: { email: admin.email }
        });
    } catch (error) {
        logger.error(`Password reset request error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error requesting password reset'
        });
    }
};

// Verify reset code
const verifyResetCode = async (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({
                success: false,
                message: 'Email and code are required'
            });
        }

        // Find admin with matching email, code and valid expiration
        const admin = await AdminUser.findOne({
            email: email.toLowerCase().trim(),
            resetPasswordToken: code,
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!admin) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset code'
            });
        }

        // Generate temporary token for password reset
        const tempToken = jwt.sign(
            {
                _id: admin._id,
                email: admin.email,
                resetCode: code,
                purpose: 'password_reset'
            },
            JWT_SECRET,
            { expiresIn: '10m' }
        );

        return res.status(200).json({
            success: true,
            message: 'Reset code verified',
            data: { tempToken }
        });
    } catch (error) {
        logger.error(`Reset code verification error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error verifying reset code'
        });
    }
};

// Reset password
const resetPassword = async (req, res) => {
    try {
        const { tempToken, newPassword } = req.body;

        if (!tempToken || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Token and new password are required'
            });
        }

        // Verify the temporary token
        const decoded = jwt.verify(tempToken, JWT_SECRET);

        if (decoded.purpose !== 'password_reset') {
            return res.status(400).json({
                success: false,
                message: 'Invalid token purpose'
            });
        }

        // Find admin with matching credentials
        const admin = await AdminUser.findOne({
            _id: decoded._id,
            email: decoded.email,
            resetPasswordToken: decoded.resetCode,
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!admin) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        // Update password and clear reset fields
        admin.password = newPassword;
        admin.resetPasswordToken = undefined;
        admin.resetPasswordExpires = undefined;
        admin.lastPasswordReset = new Date();
        await admin.save();

        return res.status(200).json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (error) {
        logger.error(`Password reset error: ${error.message}`);

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Reset token expired'
            });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid reset token'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Error resetting password'
        });
    }
};

module.exports = {
    registerAdmin,
    verifyEmail,
    loginAdmin,
    requestPasswordReset,
    verifyResetCode,
    resetPassword
};