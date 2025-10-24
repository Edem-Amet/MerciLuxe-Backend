// controllers/AdminController.js
const AdminUser = require('../models/AdminModel');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
    sendNewRegistrationAlert,
    sendApprovalNotification,
    sendRejectionNotification,
    sendPasswordResetEmail,
    sendLoginNotification,
    sendSecurityAlert
} = require('../utils/sendEmail');
const { parseUserAgent, getLocationFromIP, detectSuspiciousActivity } = require('../utils/DeviceUtils');
const logger = require('../utils/logger');
const SecurityService = require('../Services/SecurityService');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// ===== HELPER FUNCTIONS =====
const generateToken = (payload) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const extractDeviceInfo = (req) => {
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || '';

    return {
        userAgent,
        ip,
        location: getLocationFromIP(ip),
        ...parseUserAgent(userAgent)
    };
};

const validatePasswordStrength = (password) => {
    const errors = [];

    if (password.length < 8) errors.push('Password must be at least 8 characters');
    if (!/[A-Z]/.test(password)) errors.push('Password must contain uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('Password must contain lowercase letter');
    if (!/[0-9]/.test(password)) errors.push('Password must contain number');
    if (!/[!@#$%^&*]/.test(password)) errors.push('Password must contain special character');

    return { isValid: errors.length === 0, errors };
};

// ===== REGISTRATION =====
const registerAdmin = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Validate password strength
        const passwordCheck = validatePasswordStrength(password);
        if (!passwordCheck.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Password does not meet requirements',
                errors: passwordCheck.errors
            });
        }

        // Check if email already exists
        const existingAdmin = await AdminUser.findOne({
            email: email.toLowerCase().trim(),
            isDeleted: false
        });

        if (existingAdmin) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Create admin with pending status
        const adminUser = new AdminUser({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password,
            role: 'admin',
            status: 'pending'
        });

        await adminUser.save();

        // Notify principal admins
        try {
            const principalAdmins = await AdminUser.find({
                role: 'principal',
                status: 'approved',
                isDeleted: false,
                'emailNotifications.newRegistration': true
            });

            const notifications = principalAdmins.map(principal =>
                sendNewRegistrationAlert({
                    email: principal.email,
                    principalName: principal.name,
                    newAdminName: adminUser.name,
                    newAdminEmail: adminUser.email,
                    registrationDate: adminUser.createdAt
                })
            );

            await Promise.allSettled(notifications);
        } catch (emailError) {
            logger.error(`Registration alert failed: ${emailError.message}`);
        }

        logger.info(`New admin registration: ${adminUser.email}`);

        return res.status(201).json({
            success: true,
            message: 'Registration submitted. Awaiting principal admin approval.',
            data: {
                _id: adminUser._id,
                name: adminUser.name,
                email: adminUser.email,
                status: adminUser.status
            }
        });
    } catch (error) {
        logger.error(`Registration error: ${error.message}`, error);
        return res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.'
        });
    }
};

// ===== LOGIN =====
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

        // Find admin with password field
        const admin = await AdminUser.findOne({
            email: email.toLowerCase().trim(),
            isDeleted: false
        }).select('+password');

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if account is locked
        if (admin.isLocked) {
            const unlockTime = Math.ceil((admin.lockoutUntil - Date.now()) / 60000);
            return res.status(423).json({
                success: false,
                message: `Account locked. Try again in ${unlockTime} minutes.`,
                code: 'ACCOUNT_LOCKED'
            });
        }

        // Verify password
        const passwordMatch = await admin.matchPassword(password);
        if (!passwordMatch) {
            await admin.handleFailedLogin(deviceInfo);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check approval status
        if (admin.status !== 'approved') {
            return res.status(403).json({
                success: false,
                message: `Account ${admin.status}. Contact principal admin.`,
                code: 'ACCOUNT_NOT_APPROVED'
            });
        }

        // Security checks
        const threats = await SecurityService.analyzeLoginAttempt(admin, deviceInfo);
        if (threats.length > 0) {
            logger.warn(`Security threats detected for ${admin.email}:`, threats);
        }

        // Reset failed attempts and clean old sessions
        admin.resetFailedLogins();
        admin.cleanExpiredSessions();

        // Create new session
        const sessionId = admin.addSession(deviceInfo);
        admin.logSuccessfulLogin(deviceInfo);

        // Generate token
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
        if (admin.emailNotifications?.newLogin) {
            sendLoginNotification({
                email: admin.email,
                name: admin.name,
                deviceInfo,
                loginTime: new Date()
            }).catch(err => logger.error(`Login notification failed: ${err.message}`));
        }

        // Set secure cookie
        res.cookie('adminToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/'
        });

        logger.info(`Successful login: ${admin.email} from ${deviceInfo.ip}`);

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
                isPrincipal: admin.isPrincipal(),
                activeSessions: admin.activeSessions.filter(s => s.isActive).length,
                lastLogin: admin.lastLogin,
                securityAlerts: threats.length > 0 ? threats : undefined
            }
        });
    } catch (error) {
        logger.error(`Login error: ${error.message}`, error);
        return res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
};

// ===== LOGOUT =====
const logoutAdmin = async (req, res) => {
    try {
        if (req.user && req.sessionId) {
            req.user.removeSession(req.sessionId);
            req.user.lastLogout = new Date();
            await req.user.save();
        }

        res.clearCookie('adminToken', { path: '/' });

        logger.info(`Logout: ${req.user?.email || 'Unknown'}`);

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

// ===== LOGOUT ALL DEVICES =====
const logoutAllDevices = async (req, res) => {
    try {
        req.user.removeAllSessions();
        req.user.lastLogout = new Date();
        await req.user.save();

        res.clearCookie('adminToken', { path: '/' });

        logger.info(`Logout all devices: ${req.user.email}`);

        return res.status(200).json({
            success: true,
            message: 'Logged out from all devices'
        });
    } catch (error) {
        logger.error(`Logout all error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to logout from all devices'
        });
    }
};

// ===== GET PROFILE =====
const getProfile = async (req, res) => {
    try {
        const admin = await AdminUser.findById(req.user._id)
            .select('-password -__v')
            .populate('approvedBy', 'name email');

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                _id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
                status: admin.status,
                isPrincipal: admin.isPrincipal(),
                activeSessions: admin.activeSessions.filter(s => s.isActive).length,
                lastLogin: admin.lastLogin,
                lastPasswordChange: admin.lastPasswordChange,
                createdAt: admin.createdAt,
                emailNotifications: admin.emailNotifications,
                approvedBy: admin.approvedBy,
                approvedAt: admin.approvedAt
            }
        });
    } catch (error) {
        logger.error(`Get profile error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch profile'
        });
    }
};

// ===== DASHBOARD STATS =====
const getDashboardStats = async (req, res) => {
    try {
        const stats = {
            timestamp: new Date()
        };

        // Principal admins get full stats
        if (req.user.isPrincipal()) {
            const [totalAdmins, pendingAdmins, activeAdmins, suspendedAdmins] = await Promise.all([
                AdminUser.countDocuments({ role: 'admin', isDeleted: false }),
                AdminUser.countDocuments({ role: 'admin', status: 'pending', isDeleted: false }),
                AdminUser.countDocuments({ role: 'admin', status: 'approved', isDeleted: false }),
                AdminUser.countDocuments({ role: 'admin', status: 'suspended', isDeleted: false })
            ]);

            // Recent registrations
            const recentRegistrations = await AdminUser.find({
                role: 'admin',
                isDeleted: false
            })
                .select('name email status createdAt')
                .sort({ createdAt: -1 })
                .limit(5);

            stats.adminStats = {
                total: totalAdmins,
                pending: pendingAdmins,
                active: activeAdmins,
                suspended: suspendedAdmins
            };

            stats.recentActivity = recentRegistrations;
        }

        // All admins see their own stats
        stats.personalStats = {
            activeSessions: req.user.activeSessions.filter(s => s.isActive).length,
            lastLogin: req.user.lastLogin,
            accountAge: Math.floor((Date.now() - req.user.createdAt) / (1000 * 60 * 60 * 24))
        };

        return res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error(`Dashboard stats error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics'
        });
    }
};

// ===== GET ACTIVE SESSIONS =====
const getActiveSessions = async (req, res) => {
    try {
        const sessions = req.user.activeSessions
            .filter(session => session.isActive)
            .map(session => ({
                sessionId: session.sessionId,
                deviceInfo: {
                    browser: session.deviceInfo?.browser,
                    os: session.deviceInfo?.os,
                    deviceType: session.deviceInfo?.deviceType,
                    location: session.deviceInfo?.location
                },
                loginTime: session.loginTime,
                lastActivity: session.lastActivity,
                isCurrent: session.sessionId === req.sessionId
            }))
            .sort((a, b) => b.loginTime - a.loginTime);

        return res.status(200).json({
            success: true,
            data: {
                sessions,
                count: sessions.length
            }
        });
    } catch (error) {
        logger.error(`Get sessions error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch active sessions'
        });
    }
};

// ===== TERMINATE SESSION =====
const terminateSession = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const session = req.user.activeSessions.find(s => s.sessionId === sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        req.user.removeSession(sessionId);
        await req.user.save();

        logger.info(`Session terminated: ${req.user.email} - ${sessionId}`);

        return res.status(200).json({
            success: true,
            message: 'Session terminated successfully'
        });
    } catch (error) {
        logger.error(`Terminate session error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to terminate session'
        });
    }
};

// ===== UPDATE NOTIFICATION PREFERENCES =====
const updateNotificationPreferences = async (req, res) => {
    try {
        const { emailNotifications } = req.body;

        if (!emailNotifications || typeof emailNotifications !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Invalid notification preferences'
            });
        }

        req.user.emailNotifications = {
            ...req.user.emailNotifications,
            ...emailNotifications
        };

        await req.user.save();

        logger.info(`Notification preferences updated: ${req.user.email}`);

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
            message: 'Failed to update preferences'
        });
    }
};

// ===== CHANGE PASSWORD =====
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current and new password are required'
            });
        }

        // Validate new password strength
        const passwordCheck = validatePasswordStrength(newPassword);
        if (!passwordCheck.isValid) {
            return res.status(400).json({
                success: false,
                message: 'New password does not meet requirements',
                errors: passwordCheck.errors
            });
        }

        // Get user with password
        const admin = await AdminUser.findById(req.user._id).select('+password');

        // Verify current password
        const isMatch = await admin.matchPassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Check if password was used before
        const isReused = await admin.isPasswordReused(newPassword);
        if (isReused) {
            return res.status(400).json({
                success: false,
                message: 'Cannot reuse previous passwords'
            });
        }

        // Update password
        admin.password = newPassword;

        // Logout other sessions for security
        admin.removeAllOtherSessions(req.sessionId);

        await admin.save();

        logger.info(`Password changed: ${admin.email}`);

        return res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        logger.error(`Change password error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to change password'
        });
    }
};

// ===== PASSWORD RESET REQUEST =====
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
            status: 'approved',
            isDeleted: false
        });

        // Always return success to prevent email enumeration
        if (!admin) {
            return res.status(200).json({
                success: true,
                message: 'If account exists, reset code has been sent'
            });
        }

        // Check rate limiting for password resets
        if (admin.resetPasswordAttempts >= 3) {
            return res.status(429).json({
                success: false,
                message: 'Too many reset attempts. Please try again later.'
            });
        }

        // Generate 6-digit code
        const resetCode = crypto.randomInt(100000, 999999).toString();
        admin.resetPasswordToken = resetCode;
        admin.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        admin.resetPasswordAttempts = (admin.resetPasswordAttempts || 0) + 1;
        await admin.save();

        // Send email
        try {
            await sendPasswordResetEmail({
                email: admin.email,
                name: admin.name,
                code: resetCode
            });
        } catch (emailError) {
            logger.error(`Password reset email failed: ${emailError.message}`);
        }

        logger.info(`Password reset requested: ${admin.email}`);

        return res.status(200).json({
            success: true,
            message: 'Reset code sent to your email'
        });
    } catch (error) {
        logger.error(`Password reset request error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to process reset request'
        });
    }
};

// ===== VERIFY RESET CODE =====
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
            resetPasswordExpires: { $gt: new Date() },
            isDeleted: false
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
                verified: true
            }
        });
    } catch (error) {
        logger.error(`Verify reset code error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to verify code'
        });
    }
};

// ===== RESET PASSWORD =====
const resetPassword = async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;

        if (!email || !code || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email, code and new password are required'
            });
        }

        // Validate password strength
        const passwordCheck = validatePasswordStrength(newPassword);
        if (!passwordCheck.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Password does not meet requirements',
                errors: passwordCheck.errors
            });
        }

        const admin = await AdminUser.findOne({
            email: email.toLowerCase().trim(),
            resetPasswordToken: code,
            resetPasswordExpires: { $gt: new Date() },
            isDeleted: false
        }).select('+password');

        if (!admin) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset code'
            });
        }

        // Check if password was used before
        const isReused = await admin.isPasswordReused(newPassword);
        if (isReused) {
            return res.status(400).json({
                success: false,
                message: 'Cannot reuse previous passwords'
            });
        }

        // Update password
        admin.password = newPassword;
        admin.resetPasswordToken = undefined;
        admin.resetPasswordExpires = undefined;
        admin.resetPasswordAttempts = 0;

        // Logout all sessions for security
        admin.removeAllSessions();

        await admin.save();

        logger.info(`Password reset successful: ${admin.email}`);

        return res.status(200).json({
            success: true,
            message: 'Password reset successfully. Please login.'
        });
    } catch (error) {
        logger.error(`Password reset error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to reset password'
        });
    }
};

// ===== PRINCIPAL: GET PENDING REGISTRATIONS =====
const getPendingRegistrations = async (req, res) => {
    try {
        const pendingAdmins = await AdminUser.find({
            status: 'pending',
            isDeleted: false
        })
            .select('name email createdAt')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: {
                registrations: pendingAdmins,
                count: pendingAdmins.length
            }
        });
    } catch (error) {
        logger.error(`Get pending registrations error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch pending registrations'
        });
    }
};

// ===== PRINCIPAL: APPROVE ADMIN =====
const approveAdmin = async (req, res) => {
    try {
        const { adminId } = req.params;

        const adminToApprove = await AdminUser.findOne({
            _id: adminId,
            isDeleted: false
        });

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
        adminToApprove.approvedBy = req.user._id;
        adminToApprove.approvedAt = new Date();
        await adminToApprove.save();

        // Send approval notification
        try {
            await sendApprovalNotification({
                email: adminToApprove.email,
                name: adminToApprove.name,
                approvedBy: req.user.name
            });
        } catch (emailError) {
            logger.error(`Approval notification failed: ${emailError.message}`);
        }

        logger.info(`Admin approved: ${adminToApprove.email} by ${req.user.email}`);

        return res.status(200).json({
            success: true,
            message: 'Admin approved successfully',
            data: {
                _id: adminToApprove._id,
                name: adminToApprove.name,
                email: adminToApprove.email,
                status: adminToApprove.status
            }
        });
    } catch (error) {
        logger.error(`Approve admin error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to approve admin'
        });
    }
};

// ===== PRINCIPAL: REJECT ADMIN =====
const rejectAdmin = async (req, res) => {
    try {
        const { adminId } = req.params;
        const { reason } = req.body;

        const adminToReject = await AdminUser.findOne({
            _id: adminId,
            isDeleted: false
        });

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
                rejectedBy: req.user.name
            });
        } catch (emailError) {
            logger.error(`Rejection notification failed: ${emailError.message}`);
        }

        logger.info(`Admin rejected: ${adminToReject.email} by ${req.user.email}`);

        return res.status(200).json({
            success: true,
            message: 'Admin rejected successfully'
        });
    } catch (error) {
        logger.error(`Reject admin error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to reject admin'
        });
    }
};

// ===== PRINCIPAL: GET ALL ADMINS =====
const getAllAdmins = async (req, res) => {
    try {
        const { status, search, page = 1, limit = 20 } = req.query;

        const query = {
            role: { $ne: 'principal' },
            isDeleted: false
        };

        if (status) query.status = status;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [admins, total] = await Promise.all([
            AdminUser.find(query)
                .select('name email role status lastLogin createdAt approvedBy approvedAt')
                .populate('approvedBy', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            AdminUser.countDocuments(query)
        ]);

        return res.status(200).json({
            success: true,
            data: {
                admins,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / parseInt(limit)),
                    limit: parseInt(limit)
                }
            }
        });
    } catch (error) {
        logger.error(`Get all admins error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch admins'
        });
    }
};

// ===== PRINCIPAL: TOGGLE ADMIN STATUS =====
const toggleAdminStatus = async (req, res) => {
    try {
        const { adminId } = req.params;

        const admin = await AdminUser.findOne({
            _id: adminId,
            isDeleted: false
        });

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
        const newStatus = admin.status === 'approved' ? 'suspended' : 'approved';
        admin.status = newStatus;

        // If suspending, logout all sessions
        if (newStatus === 'suspended') {
            admin.removeAllSessions();
        }

        await admin.save();

        logger.info(`Admin status toggled: ${admin.email} -> ${newStatus} by ${req.user.email}`);

        return res.status(200).json({
            success: true,
            message: `Admin ${newStatus === 'approved' ? 'activated' : 'suspended'} successfully`,
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
            message: 'Failed to update admin status'
        });
    }
};

// ===== PRINCIPAL: DELETE ADMIN =====
const deleteAdmin = async (req, res) => {
    try {
        const { adminId } = req.params;

        const admin = await AdminUser.findOne({
            _id: adminId,
            isDeleted: false
        });

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        if (admin.role === 'principal') {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete principal admin'
            });
        }

        await admin.softDelete(req.user._id);

        logger.info(`Admin deleted: ${admin.email} by ${req.user.email}`);

        return res.status(200).json({
            success: true,
            message: 'Admin deleted successfully'
        });
    } catch (error) {
        logger.error(`Delete admin error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete admin'
        });
    }
};

// ===== PRINCIPAL: GET ADMIN DETAILS =====
const getAdminDetails = async (req, res) => {
    try {
        const { adminId } = req.params;

        const admin = await AdminUser.findOne({
            _id: adminId,
            isDeleted: false
        })
            .select('-password -__v')
            .populate('approvedBy', 'name email');

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        // Get security report
        const securityReport = await SecurityService.generateSecurityReport(adminId);

        return res.status(200).json({
            success: true,
            data: {
                admin,
                securityReport
            }
        });
    } catch (error) {
        logger.error(`Get admin details error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch admin details'
        });
    }
};

// ===== GET SECURITY REPORT =====
const getSecurityReport = async (req, res) => {
    try {
        const report = await SecurityService.generateSecurityReport(req.user._id);

        return res.status(200).json({
            success: true,
            data: report
        });
    } catch (error) {
        logger.error(`Get security report error: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate security report'
        });
    }
};

module.exports = {
    // Authentication
    registerAdmin,
    loginAdmin,
    logoutAdmin,
    logoutAllDevices,

    // Profile & Settings
    getProfile,
    getDashboardStats,
    getActiveSessions,
    terminateSession,
    updateNotificationPreferences,
    changePassword,

    // Password Reset
    requestPasswordReset,
    verifyResetCode,
    resetPassword,

    // Principal Admin Functions
    getPendingRegistrations,
    approveAdmin,
    rejectAdmin,
    getAllAdmins,
    toggleAdminStatus,
    deleteAdmin,
    getAdminDetails,

    // Security
    getSecurityReport
};