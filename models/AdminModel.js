// models/AdminModel.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const adminSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        validate: {
            validator: function (email) {
                return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email);
            },
            message: 'Please enter a valid email'
        }
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters']
    },
    role: {
        type: String,
        enum: ['principal', 'admin'],
        default: 'admin'
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'suspended'],
        default: 'pending'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser',
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },

    // Session Management
    activeSessions: [{
        sessionId: {
            type: String,
            required: true
        },
        deviceInfo: {
            ip: String,
            userAgent: String,
            browser: String,
            os: String,
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
        }
    }],

    // Security
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lockoutUntil: Date,
    lastLogin: Date,
    lastLogout: Date,

    // Password Reset
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    // Notifications
    emailNotifications: {
        newLogin: { type: Boolean, default: true },
        newRegistration: { type: Boolean, default: true },
        securityAlerts: { type: Boolean, default: true }
    }
}, {
    timestamps: true
});

// Virtual for checking if account is locked
adminSchema.virtual('isLocked').get(function () {
    return !!(this.lockoutUntil && this.lockoutUntil > Date.now());
});

// Hash password before saving
adminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password
adminSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Generate session ID
adminSchema.methods.generateSessionId = function () {
    return crypto.randomBytes(32).toString('hex');
};

// Add new session
adminSchema.methods.addSession = function (deviceInfo) {
    const sessionId = this.generateSessionId();

    // Keep only last 5 sessions
    if (this.activeSessions.length >= 5) {
        this.activeSessions = this.activeSessions.slice(-4);
    }

    this.activeSessions.push({
        sessionId,
        deviceInfo,
        loginTime: new Date(),
        lastActivity: new Date(),
        isActive: true
    });

    return sessionId;
};

// Update session activity
adminSchema.methods.updateSessionActivity = function (sessionId) {
    const session = this.activeSessions.find(s => s.sessionId === sessionId);
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

// Remove all other sessions
adminSchema.methods.removeAllOtherSessions = function (currentSessionId) {
    this.activeSessions.forEach(session => {
        if (session.sessionId !== currentSessionId) {
            session.isActive = false;
        }
    });
};

// Handle failed login
adminSchema.methods.handleFailedLogin = function () {
    this.failedLoginAttempts += 1;

    if (this.failedLoginAttempts >= 5) {
        this.lockoutUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
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
    const expiredTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    this.activeSessions.forEach(session => {
        if (session.lastActivity < expiredTime) {
            session.isActive = false;
        }
    });
};

// Check if user is principal admin
adminSchema.methods.isPrincipal = function () {
    return this.role === 'principal';
};

// Check if user can access admin features
adminSchema.methods.canAccessAdmin = function () {
    return this.status === 'approved' && (this.role === 'principal' || this.role === 'admin');
};

// Indexes
adminSchema.index({ email: 1 });
adminSchema.index({ role: 1 });
adminSchema.index({ status: 1 });
adminSchema.index({ 'activeSessions.sessionId': 1 });

module.exports = mongoose.model('AdminUser', adminSchema);