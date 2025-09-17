// services/SecurityService.js
const AdminUser = require('../models/AdminModel');
const { sendSuspiciousActivityEmail } = require('../utils/SendEmail');
const { detectSuspiciousActivity, isHighRiskIP } = require('../utils/DeviceUtils');
const logger = require('../utils/Logger');

class SecurityService {
    /**
     * Monitor and analyze login attempts for security threats
     */
    static async analyzeLoginAttempt(admin, deviceInfo) {
        const threats = [];

        try {
            // Check for suspicious activity patterns
            const suspiciousFlags = detectSuspiciousActivity(admin, deviceInfo);
            if (suspiciousFlags.length > 0) {
                threats.push(...suspiciousFlags);
            }

            // Check for high-risk IP
            if (isHighRiskIP(deviceInfo.ip)) {
                threats.push(`Login from high-risk location: ${deviceInfo.location}`);
            }

            // Check for brute force patterns
            const recentFailedAttempts = admin.loginHistory
                .slice(0, 10)
                .filter(login => !login.success && login.ip === deviceInfo.ip);

            if (recentFailedAttempts.length >= 3) {
                threats.push('Multiple recent failed attempts from same IP');
            }

            // Check for concurrent sessions from different locations
            const activeSessions = admin.activeSessions.filter(s => s.isActive);
            const differentLocations = new Set(
                activeSessions.map(s => s.deviceInfo.location).filter(Boolean)
            );

            if (differentLocations.size > 2) {
                threats.push('Concurrent sessions from multiple locations');
            }

            // Send notification if threats detected
            if (threats.length > 0 && admin.emailNotifications.suspiciousActivity) {
                await this.sendSecurityAlert(admin, threats);
            }

            return threats;
        } catch (error) {
            logger.error(`Security analysis error: ${error.message}`);
            return [];
        }
    }

    /**
     * Send security alert email
     */
    static async sendSecurityAlert(admin, threats) {
        try {
            await sendSuspiciousActivityEmail({
                email: admin.email,
                name: admin.name,
                activityDetails: threats
            });

            logger.warn(`Security alert sent to ${admin.email}: ${threats.join(', ')}`);
        } catch (error) {
            logger.error(`Failed to send security alert: ${error.message}`);
        }
    }

    /**
     * Clean up inactive sessions across all users (scheduled task)
     */
    static async cleanupInactiveSessions() {
        try {
            const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours

            const result = await AdminUser.updateMany(
                { 'activeSessions.lastActivity': { $lt: cutoffTime } },
                { $set: { 'activeSessions.$.isActive': false } }
            );

            logger.info(`Cleaned up inactive sessions: ${result.modifiedCount} users affected`);
            return result.modifiedCount;
        } catch (error) {
            logger.error(`Session cleanup error: ${error.message}`);
            return 0;
        }
    }

    /**
     * Monitor for account lockouts and potential attacks
     */
    static async monitorAccountSecurity() {
        try {
            const now = new Date();

            // Find accounts with recent lockouts
            const lockedAccounts = await AdminUser.find({
                lockoutUntil: { $gt: now },
                failedLoginAttempts: { $gte: 5 }
            }).select('email failedLoginAttempts lockoutUntil loginHistory');

            if (lockedAccounts.length > 0) {
                logger.warn(`Security Monitor: ${lockedAccounts.length} accounts currently locked`);

                // Check for coordinated attacks (multiple accounts from same IP)
                const attackIPs = new Map();

                lockedAccounts.forEach(account => {
                    const recentAttempts = account.loginHistory
                        .slice(0, 10)
                        .filter(login => !login.success);

                    recentAttempts.forEach(attempt => {
                        if (!attackIPs.has(attempt.ip)) {
                            attackIPs.set(attempt.ip, []);
                        }
                        attackIPs.get(attempt.ip).push(account.email);
                    });
                });

                // Log potential coordinated attacks
                attackIPs.forEach((emails, ip) => {
                    if (emails.length >= 3) {
                        logger.error(`Potential coordinated attack from IP ${ip} targeting ${emails.length} accounts`);
                    }
                });
            }

            return lockedAccounts.length;
        } catch (error) {
            logger.error(`Security monitoring error: ${error.message}`);
            return 0;
        }
    }

    /**
     * Validate password strength beyond basic requirements
     */
    static validatePasswordStrength(password) {
        const issues = [];

        // Check for common patterns
        const commonPatterns = [
            /(.)\1{3,}/, // Same character repeated 4+ times
            /123456/, // Sequential numbers
            /abcdef/, // Sequential letters
            /qwerty/i, // Keyboard patterns
            /password/i, // Contains "password"
            /admin/i // Contains "admin"
        ];

        commonPatterns.forEach(pattern => {
            if (pattern.test(password)) {
                issues.push('Contains common patterns or sequences');
            }
        });

        // Check entropy (basic)
        const uniqueChars = new Set(password).size;
        if (uniqueChars < password.length * 0.6) {
            issues.push('Low character diversity');
        }

        return {
            isStrong: issues.length === 0,
            issues
        };
    }

    /**
     * Generate security report for admin
     */
    static async generateSecurityReport(adminId) {
        try {
            const admin = await AdminUser.findById(adminId);
            if (!admin) {
                throw new Error('Admin not found');
            }

            const now = new Date();
            const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

            // Analyze login patterns
            const recentLogins = admin.loginHistory.filter(
                login => login.loginTime > last30Days
            );

            const uniqueIPs = new Set(recentLogins.map(login => login.ip)).size;
            const uniqueLocations = new Set(
                recentLogins.map(login => login.location).filter(Boolean)
            ).size;

            const failedLogins = recentLogins.filter(login => !login.success).length;
            const successfulLogins = recentLogins.filter(login => login.success).length;

            return {
                accountInfo: {
                    email: admin.email,
                    lastLogin: admin.lastLogin,
                    lastPasswordReset: admin.lastPasswordReset,
                    isVerified: admin.isVerified,
                    twoFactorEnabled: admin.twoFactorEnabled
                },
                sessionInfo: {
                    activeSessions: admin.activeSessions.filter(s => s.isActive).length,
                    totalSessions: admin.activeSessions.length
                },
                loginAnalytics: {
                    totalLogins: recentLogins.length,
                    successfulLogins,
                    failedLogins,
                    uniqueIPs,
                    uniqueLocations,
                    failureRate: recentLogins.length > 0 ? (failedLogins / recentLogins.length * 100).toFixed(2) : 0
                },
                securityFlags: {
                    hasRecentFailures: failedLogins > 0,
                    multipleLocations: uniqueLocations > 2,
                    multipleIPs: uniqueIPs > 3,
                    isLocked: admin.isLocked
                }
            };
        } catch (error) {
            logger.error(`Security report generation error: ${error.message}`);
            throw error;
        }
    }
}

module.exports = SecurityService;