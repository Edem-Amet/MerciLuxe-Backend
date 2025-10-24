// models/AdminModel.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const adminSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters'],
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        index: true,
        validate: {
            validator: function (email) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            },
            message: 'Please enter a valid email address'
        }
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters'],
        select: false
    },
    role: {
        type: String,
        enum: ['principal', 'admin'],
        default: 'admin',
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'suspended'],
        default: 'pending',
        index: true
    },

    // Approval tracking
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser',
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },

    // Session management
    activeSessions: [{
        sessionId: {
            type: String,
            required: true,
            index: true
        },
        deviceInfo: {
            ip: String,
            userAgent: String,
            browser: String,
            os: String,
            deviceType: String,
            location: String
        },
        loginTime: {
            type: Date,
            default: Date.now
        },
        lastActivity: {
            type: Date,
            default: Date.now
        },
        isActive: {
            type: Boolean,
            default: true
        },
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }
    }],

    // Security features
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockoutUntil: Date,
    lastLogin: Date,
    lastLogout: Date,
    lastPasswordChange: {
        type: Date,
        default: Date.now
    },
    passwordHistory: [{
        password: String,
        changedAt: {
            type: Date,
            default: Date.now
        }
    }],

    // Password reset
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    resetPasswordAttempts: {
        type: Number,
        default: 0
    },

    // Two-factor authentication (optional, ready for future use)
    twoFactorEnabled: {
        type: Boolean,
        default: false
    },
    twoFactorSecret: String,
    backupCodes: [String],

    // Email notifications preferences
    emailNotifications: {
        newLogin: { type: Boolean, default: true },
        newRegistration: { type: Boolean, default: true },
        securityAlerts: { type: Boolean, default: true },
        suspiciousActivity: { type: Boolean, default: true }
    },

    // Audit trail
    loginHistory: [{
        ip: String,
        userAgent: String,
        location: String,
        success: Boolean,
        loginTime: {
            type: Date,
            default: Date.now
        },
        failureReason: String
    }],

    // Account metadata
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: String,
    verificationExpires: Date,

    // Soft delete
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: Date,
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
adminSchema.index({ email: 1, status: 1 });
adminSchema.index({ role: 1, status: 1 });
adminSchema.index({ createdAt: -1 });
adminSchema.index({ 'activeSessions.sessionId': 1, 'activeSessions.isActive': 1 });
adminSchema.index({ isDeleted: 1 });

// Virtual for checking if account is locked
adminSchema.virtual('isLocked').get(function () {
    return !!(this.lockoutUntil && this.lockoutUntil > Date.now());
});

// Hash password before saving
adminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        // Store in password history
        if (this.password && !this.isNew) {
            this.passwordHistory.push({
                password: this.password,
                changedAt: new Date()
            });

            // Keep only last 5 passwords
            if (this.passwordHistory.length > 5) {
                this.passwordHistory = this.passwordHistory.slice(-5);
            }
        }

        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        this.lastPasswordChange = new Date();
        next();
    } catch (error) {
        next(error);
    }
});

// Limit login history to last 50 entries
adminSchema.pre('save', function (next) {
    if (this.loginHistory && this.loginHistory.length > 50) {
        this.loginHistory = this.loginHistory.slice(-50);
    }
    next();
});

// Compare password
adminSchema.methods.matchPassword = async function (enteredPassword) {
    try {
        return await bcrypt.compare(enteredPassword, this.password);
    } catch (error) {
        return false;
    }
};

// Check if password was used before
adminSchema.methods.isPasswordReused = async function (newPassword) {
    for (const oldPass of this.passwordHistory) {
        const isMatch = await bcrypt.compare(newPassword, oldPass.password);
        if (isMatch) return true;
    }
    return false;
};

// Generate secure session ID
adminSchema.methods.generateSessionId = function () {
    return crypto.randomBytes(32).toString('hex');
};

// Add new session
adminSchema.methods.addSession = function (deviceInfo) {
    const sessionId = this.generateSessionId();

    // Remove expired sessions
    this.cleanExpiredSessions();

    // Limit to 5 active sessions
    const activeSessions = this.activeSessions.filter(s => s.isActive);
    if (activeSessions.length >= 5) {
        // Deactivate oldest session
        const oldestSession = activeSessions.reduce((oldest, session) =>
            session.loginTime < oldest.loginTime ? session : oldest
        );
        oldestSession.isActive = false;
    }

    this.activeSessions.push({
        sessionId,
        deviceInfo,
        loginTime: new Date(),
        lastActivity: new Date(),
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    return sessionId;
};

// Update session activity
adminSchema.methods.updateSessionActivity = function (sessionId) {
    const session = this.activeSessions.find(s => s.sessionId === sessionId && s.isActive);
    if (session) {
        session.lastActivity = new Date();
    }
};

// Remove session
adminSchema.methods.removeSession = function (sessionId) {
    const session = this.activeSessions.find(s => s.sessionId === sessionId);
    if (session) {
        session.isActive = false;
    }
};

// Remove all sessions
adminSchema.methods.removeAllSessions = function () {
    this.activeSessions.forEach(session => {
        session.isActive = false;
    });
};

// Remove all other sessions
adminSchema.methods.removeAllOtherSessions = function (currentSessionId) {
    this.activeSessions.forEach(session => {
        if (session.sessionId !== currentSessionId) {
            session.isActive = false;
        }
    });
};

// Handle failed login
adminSchema.methods.handleFailedLogin = async function (deviceInfo = {}) {
    this.failedLoginAttempts += 1;

    // Log failed attempt
    this.loginHistory.push({
        ip: deviceInfo.ip,
        userAgent: deviceInfo.userAgent,
        location: deviceInfo.location,
        success: false,
        loginTime: new Date(),
        failureReason: 'Invalid credentials'
    });

    // Progressive lockout
    if (this.failedLoginAttempts >= 5) {
        this.lockoutUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    } else if (this.failedLoginAttempts >= 3) {
        this.lockoutUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    }

    return this.save();
};

// Reset failed login attempts
adminSchema.methods.resetFailedLogins = function () {
    this.failedLoginAttempts = 0;
    this.lockoutUntil = undefined;
};

// Clean expired sessions
adminSchema.methods.cleanExpiredSessions = function () {
    const now = new Date();
    this.activeSessions.forEach(session => {
        if (session.expiresAt < now ||
            (session.lastActivity && session.lastActivity < new Date(now - 24 * 60 * 60 * 1000))) {
            session.isActive = false;
        }
    });
};

// Log successful login
adminSchema.methods.logSuccessfulLogin = function (deviceInfo) {
    this.loginHistory.push({
        ip: deviceInfo.ip,
        userAgent: deviceInfo.userAgent,
        location: deviceInfo.location,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        success: true,
        loginTime: new Date()
    });
};

// Check if user is principal admin
adminSchema.methods.isPrincipal = function () {
    return this.role === 'principal';
};

// Check if user can access admin features
adminSchema.methods.canAccessAdmin = function () {
    return this.status === 'approved' && !this.isDeleted &&
        (this.role === 'principal' || this.role === 'admin');
};

// Soft delete
adminSchema.methods.softDelete = function (deletedBy) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = deletedBy;
    this.status = 'suspended';
    this.removeAllSessions();
    return this.save();
};

module.exports = mongoose.model('AdminUser', adminSchema);