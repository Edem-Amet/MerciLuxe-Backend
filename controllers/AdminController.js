// controllers/AdminController.js
const AdminUser = require('../models/AdminModel');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
    sendNewRegistrationAlert,
    sendApprovalNotification,
    sendRejectionNotification,
    sendPasswordResetEmail,
    sendLoginNotification
} = require('../utils/sendEmail');
const { parseUserAgent, getLocationFromIP } = require('../utils/DeviceUtils');
const logger = require('../utils/Logger');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Helper functions
const generateToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const extractDeviceInfo = (req) => {
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection.remoteAddress || '';

    return {
        userAgent,
        ip,
        location: getLocationFromIP ? getLocationFromIP(ip) : 'Unknown',
        ...(parseUserAgent ? parseUserAgent(userAgent) : {})
    };
};

// REGISTRATION - Anyone can request admin access
const registerAdmin = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Check if user already exists
        const existingAdmin = await AdminUser.findOne({ email: email.toLowerCase().trim() });
        if (existingAdmin) {
            return res.status(400).json({
                success: false,
                message: 'Email already in use'
            });
        }

        // Create admin user with pending status
        const adminUser = new AdminUser({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password,
            role: 'admin',
            status: 'pending'
        });

        await adminUser.save();

        // Notify all principal admins about new registration
        try {
            const principalAdmins = await AdminUser.find({
                role: 'principal',
                status: 'approved',
                'emailNotifications.newRegistration': true
            });

            for (const principal of principalAdmins) {
                await sendNewRegistrationAlert({
                    email: principal.email,
                    principalName: principal.name,
                    newAdminName: adminUser.name,
                    newAdminEmail: adminUser.email
                });
            }
        } catch (emailError) {
            logger.error(`Failed to send registration alerts: ${emailError.message}`);
        }

        logger.info(`New admin registration pending approval: ${adminUser.email}`);

        return res.status(201).json({
            success: true,
            message: 'Registration submitted successfully. Awaiting principal admin approval.',
            data: {
                _id: adminUser._id,
                name: adminUser.name,
                email: adminUser.email,
                status: adminUser.status
            }
        });
    } catch (error) {
        logger.error(`Registration Error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
};

// LOGIN - Only approved users can login
const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const deviceInfo = extractDeviceInfo(req);

        const admin = await AdminUser.findOne({ email: email.toLowerCase().trim() });
        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Account lock check
        if (admin.isLocked) {
            return res.status(423).json({
                success: false,
                message: 'Account temporarily locked due to failed login attempts'
            });
        }

        // Verify password
        const passwordMatch = await admin.matchPassword(password);
        if (!passwordMatch) {
            await admin.handleFailedLogin();
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Must be approved
        if (admin.status !== 'approved') {
            return res.status(403).json({
                success: false,
                message: `Account status: ${admin.status}. Please wait for principal admin approval.`,
                code: 'ACCOUNT_NOT_APPROVED'
            });
        }

        // Reset failed attempts & clean old sessions
        admin.resetFailedLogins();
        admin.cleanExpiredSessions();

        // Create new session
        const sessionId = admin.addSession(deviceInfo);

        const token = generateToken({
            _id: admin._id,
            sessionId,
            email: admin.email,
            role: admin.role
        });

        // Update last login
        admin.lastLogin = new Date();
        await admin.save();

        // Send login notification
        try {
            if (admin.emailNotifications?.newLogin) {
                await sendLoginNotification({
                    email: admin.email,
                    name: admin.name,
                    deviceInfo,
                    loginTime: new Date()
                });
            }
        } catch (emailError) {
            logger.error(`Login notification failed: ${emailError.message}`);
        }

        // Set cookie
        res.cookie('adminToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            maxAge: 24 * 60 * 60 * 1000, // 24h
            path: '/'
        });

        logger.info(`Successful login: ${admin.email}`);

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            data: {
                _id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
                status: admin.status,
                sessionId,
                isPrincipal: admin.isPrincipal(),
                activeSessions: admin.activeSessions.filter(s => s.isActive).length,
                lastLogin: admin.lastLogin
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

// LOGOUT
const logoutAdmin = async (req, res) => {
    try {
        if (req.user && req.sessionId) {
            req.user.removeSession(req.sessionId);
            req.user.lastLogout = new Date();
            await req.user.save();
        }

        res.clearCookie('adminToken', { path: '/' });
        return res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        logger.error(`Logout error: ${error.message}`);
        res.clearCookie('adminToken', { path: '/' });
        return res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });
    }
};

// LOGOUT ALL DEVICES - PRINCIPAL ONLY
const logoutAllDevices = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        // Only principal can logout all devices
        if (!req.user.isPrincipal()) {
            return res.status(403).json({
                success: false,
                message: 'Principal admin privileges required'
            });
        }

        // Deactivate all sessions
        req.user.activeSessions.forEach(session => {
            session.isActive = false;
        });

        req.user.lastLogout = new Date();
        await req.user.save();

        res.clearCookie('adminToken', { path: '/' });

        logger.info(`Principal admin logged out from all devices: ${req.user.email}`);

        return res.status(200).json({
            success: true,
            message: 'Logged out from all devices successfully'
        });
    } catch (error) {
        logger.error(`Logout all devices error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error logging out from all devices'
        });
    }
};

// GET PROFILE
const getProfile = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        res.status(200).json({
            success: true,
            admin: {
                _id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                role: req.user.role,
                status: req.user.status,
                isPrincipal: req.user.isPrincipal(),
                activeSessions: req.user.activeSessions.filter(s => s.isActive).length,
                lastLogin: req.user.lastLogin,
                createdAt: req.user.createdAt,
                emailNotifications: req.user.emailNotifications
            }
        });
    } catch (error) {
        logger.error("Get profile error:", error.message);
        res.status(500).json({
            success: false,
            message: "Error fetching profile"
        });
    }
};

// GET DASHBOARD STATS
const getDashboardStats = async (req, res) => {
    try {
        // Mock data - replace with actual database queries
        const stats = {
            totalBooks: 150,
            featuredBooks: 12,
            activeHeroes: 5,
            totalCategories: 8,
            recentActivity: [
                { action: 'Book added', item: 'The Great Adventure', time: new Date() },
                { action: 'Hero updated', item: 'Main Banner', time: new Date(Date.now() - 3600000) }
            ]
        };

        // If principal, add admin stats
        if (req.user.isPrincipal()) {
            const totalAdmins = await AdminUser.countDocuments({ role: 'admin' });
            const pendingAdmins = await AdminUser.countDocuments({
                role: 'admin',
                status: 'pending'
            });
            const activeAdmins = await AdminUser.countDocuments({
                role: 'admin',
                status: 'approved'
            });

            stats.adminStats = {
                totalAdmins,
                pendingAdmins,
                activeAdmins
            };
        }

        return res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error(`Dashboard stats error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error fetching dashboard statistics'
        });
    }
};

// GET ACTIVE SESSIONS
const getActiveSessions = async (req, res) => {
    try {
        const sessions = req.user.activeSessions
            .filter(session => session.isActive)
            .map(session => ({
                sessionId: session.sessionId,
                deviceInfo: session.deviceInfo,
                loginTime: session.loginTime,
                lastActivity: session.lastActivity,
                isCurrent: session.sessionId === req.sessionId
            }));

        return res.status(200).json({
            success: true,
            data: sessions
        });
    } catch (error) {
        logger.error(`Get active sessions error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error fetching active sessions'
        });
    }
};

// UPDATE NOTIFICATION PREFERENCES
const updateNotificationPreferences = async (req, res) => {
    try {
        const { emailNotifications } = req.body;

        req.user.emailNotifications = {
            ...req.user.emailNotifications,
            ...emailNotifications
        };

        await req.user.save();

        return res.status(200).json({
            success: true,
            message: 'Notification preferences updated',
            data: {
                emailNotifications: req.user.emailNotifications
            }
        });
    } catch (error) {
        logger.error(`Update notifications error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error updating notification preferences'
        });
    }
};

// CHANGE PASSWORD
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        // Verify current password
        const passwordMatch = await req.user.matchPassword(currentPassword);
        if (!passwordMatch) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Update password
        req.user.password = newPassword;

        // Deactivate all other sessions for security
        req.user.activeSessions.forEach(session => {
            if (session.sessionId !== req.sessionId) {
                session.isActive = false;
            }
        });

        await req.user.save();

        logger.info(`Password changed: ${req.user.email}`);

        return res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        logger.error(`Change password error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error changing password'
        });
    }
};

// PRINCIPAL ADMIN: Get pending registrations
const getPendingRegistrations = async (req, res) => {
    try {
        const pendingAdmins = await AdminUser.find({ status: 'pending' })
            .select('name email createdAt')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: {
                pendingRegistrations: pendingAdmins,
                count: pendingAdmins.length
            }
        });
    } catch (error) {
        logger.error(`Get pending registrations error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error fetching pending registrations'
        });
    }
};

// PRINCIPAL ADMIN: Approve admin registration
const approveAdmin = async (req, res) => {
    try {
        const { adminId } = req.params;
        const principalAdmin = req.user;

        const adminToApprove = await AdminUser.findById(adminId);
        if (!adminToApprove) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        if (adminToApprove.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Admin is already ${adminToApprove.status}`
            });
        }

        adminToApprove.status = 'approved';
        adminToApprove.approvedBy = principalAdmin._id;
        adminToApprove.approvedAt = new Date();
        await adminToApprove.save();

        // Send approval notification
        try {
            await sendApprovalNotification({
                email: adminToApprove.email,
                name: adminToApprove.name,
                approvedBy: principalAdmin.name
            });
        } catch (emailError) {
            logger.error(`Approval notification failed: ${emailError.message}`);
        }

        logger.info(`Admin approved: ${adminToApprove.email} by ${principalAdmin.email}`);

        return res.status(200).json({
            success: true,
            message: 'Admin approved successfully',
            data: {
                _id: adminToApprove._id,
                name: adminToApprove.name,
                email: adminToApprove.email,
                status: adminToApprove.status,
                approvedBy: principalAdmin.name,
                approvedAt: adminToApprove.approvedAt
            }
        });
    } catch (error) {
        logger.error(`Approve admin error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error approving admin'
        });
    }
};

// PRINCIPAL ADMIN: Reject admin registration
const rejectAdmin = async (req, res) => {
    try {
        const { adminId } = req.params;
        const { reason } = req.body;
        const principalAdmin = req.user;

        const adminToReject = await AdminUser.findById(adminId);
        if (!adminToReject) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        if (adminToReject.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Admin is already ${adminToReject.status}`
            });
        }

        adminToReject.status = 'rejected';
        await adminToReject.save();

        // Send rejection notification
        try {
            await sendRejectionNotification({
                email: adminToReject.email,
                name: adminToReject.name,
                reason: reason || 'No specific reason provided',
                rejectedBy: principalAdmin.name
            });
        } catch (emailError) {
            logger.error(`Rejection notification failed: ${emailError.message}`);
        }

        logger.info(`Admin rejected: ${adminToReject.email} by ${principalAdmin.email}`);

        return res.status(200).json({
            success: true,
            message: 'Admin rejected successfully'
        });
    } catch (error) {
        logger.error(`Reject admin error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error rejecting admin'
        });
    }
};

// PRINCIPAL ADMIN: Get all admins
const getAllAdmins = async (req, res) => {
    try {
        const admins = await AdminUser.find({ role: { $ne: 'principal' } })
            .select('name email role status lastLogin createdAt approvedBy approvedAt')
            .populate('approvedBy', 'name email')
            .sort({ createdAt: -1 });

        const activeAdmins = admins.filter(admin => admin.status === 'approved');
        const pendingAdmins = admins.filter(admin => admin.status === 'pending');

        return res.status(200).json({
            success: true,
            data: {
                admins,
                stats: {
                    total: admins.length,
                    active: activeAdmins.length,
                    pending: pendingAdmins.length
                }
            }
        });
    } catch (error) {
        logger.error(`Get all admins error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error fetching admins'
        });
    }
};

// PRINCIPAL ADMIN: Suspend/Activate admin
const toggleAdminStatus = async (req, res) => {
    try {
        const { adminId } = req.params;
        const principalAdmin = req.user;

        const admin = await AdminUser.findById(adminId);
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        if (admin.role === 'principal') {
            return res.status(403).json({
                success: false,
                message: 'Cannot modify principal admin status'
            });
        }

        // Toggle between approved and suspended
        admin.status = admin.status === 'approved' ? 'suspended' : 'approved';

        // If suspending, deactivate all sessions
        if (admin.status === 'suspended') {
            admin.activeSessions.forEach(session => {
                session.isActive = false;
            });
        }

        await admin.save();

        logger.info(`Admin status toggled: ${admin.email} -> ${admin.status} by ${principalAdmin.email}`);

        return res.status(200).json({
            success: true,
            message: `Admin ${admin.status === 'approved' ? 'activated' : 'suspended'} successfully`,
            data: {
                _id: admin._id,
                email: admin.email,
                status: admin.status
            }
        });
    } catch (error) {
        logger.error(`Toggle admin status error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error updating admin status'
        });
    }
};

// Password Reset Request
const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        const admin = await AdminUser.findOne({
            email: email.toLowerCase().trim(),
            status: 'approved'
        });

        // Always return success to prevent email enumeration
        if (!admin) {
            return res.status(200).json({
                success: true,
                message: 'If an account exists, a reset code has been sent'
            });
        }

        // Generate 6-digit code
        const resetCode = crypto.randomInt(100000, 999999).toString();
        admin.resetPasswordToken = resetCode;
        admin.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        await admin.save();

        try {
            await sendPasswordResetEmail({
                email: admin.email,
                name: admin.name,
                code: resetCode
            });
        } catch (emailError) {
            logger.error(`Password reset email failed: ${emailError.message}`);
        }

        return res.status(200).json({
            success: true,
            message: 'Password reset code sent to your email'
        });
    } catch (error) {
        logger.error(`Password reset request error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error requesting password reset'
        });
    }
};

// Verify Reset Code
const verifyResetCode = async (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({
                success: false,
                message: 'Email and code are required'
            });
        }

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

        return res.status(200).json({
            success: true,
            message: 'Code verified successfully',
            data: {
                email: admin.email,
                tempToken: code
            }
        });
    } catch (error) {
        logger.error(`Verify reset code error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error verifying reset code'
        });
    }
};

// Reset Password with Code
const resetPassword = async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;

        if (!email || !code || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email, code and new password are required'
            });
        }

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

        // Update password
        admin.password = newPassword;
        admin.resetPasswordToken = undefined;
        admin.resetPasswordExpires = undefined;

        // Deactivate all sessions for security
        admin.activeSessions.forEach(session => {
            session.isActive = false;
        });

        await admin.save();

        logger.info(`Password reset successful: ${admin.email}`);

        return res.status(200).json({
            success: true,
            message: 'Password reset successfully. Please login again.'
        });
    } catch (error) {
        logger.error(`Password reset error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Error resetting password'
        });
    }
};

module.exports = {
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
};