// services/SecurityService.js
const AdminUser = require('../models/AdminModel');
const { sendSecurityAlert } = require('../utils/sendEmail');
const { detectSuspiciousActivity, isHighRiskIP, getLocationFromIP } = require('../utils/DeviceUtils');
const logger = require('../utils/logger');

class SecurityService {
    /**
     * Analyze login attempt for security threats
     * Returns array of threat descriptions
     */
    static async analyzeLoginAttempt(admin, deviceInfo) {
        const threats = [];

        try {
            // 1. Check for suspicious activity patterns
            const suspiciousFlags = detectSuspiciousActivity(admin, deviceInfo);
            if (suspiciousFlags.length > 0) {
                threats.push(...suspiciousFlags);
                logger.warn(`Suspicious activity detected for ${admin.email}: ${suspiciousFlags.join(', ')}`);
            }

            // 2. Check for high-risk IP
            if (isHighRiskIP(deviceInfo.ip)) {
                threats.push(`Login from high-risk location: ${deviceInfo.location || 'Unknown'}`);
                logger.warn(`High-risk IP detected: ${deviceInfo.ip} for user ${admin.email}`);
            }

            // 3. Check for brute force patterns - multiple failed attempts from same IP
            const recentFailedFromIP = admin.loginHistory
                .slice(-20) // Check last 20 login attempts
                .filter(login =>
                    !login.success &&
                    login.ip === deviceInfo.ip &&
                    login.loginTime > new Date(Date.now() - 60 * 60 * 1000) // Last hour
                );

            if (recentFailedFromIP.length >= 3) {
                threats.push(`${recentFailedFromIP.length} failed login attempts from this IP in the last hour`);
                logger.warn(`Brute force pattern detected for ${admin.email} from IP ${deviceInfo.ip}`);
            }

            // 4. Check for concurrent sessions from different locations
            const activeSessions = admin.activeSessions.filter(s => s.isActive);
            const uniqueLocations = new Set(
                activeSessions
                    .map(s => s.deviceInfo?.location)
                    .filter(loc => loc && loc !== 'Unknown' && loc !== 'Local')
            );

            if (uniqueLocations.size >= 3) {
                threats.push(`Concurrent active sessions from ${uniqueLocations.size} different locations`);
                logger.warn(`Multiple location access detected for ${admin.email}`);
            }

            // 5. Check for unusual device/browser
            const recentDevices = admin.loginHistory
                .slice(-10)
                .filter(login => login.success && login.browser)
                .map(login => `${login.browser}-${login.os}`);

            const currentDevice = `${deviceInfo.browser}-${deviceInfo.os}`;
            if (recentDevices.length >= 3 && !recentDevices.includes(currentDevice)) {
                threats.push('Login from new or unusual device');
                logger.info(`New device detected for ${admin.email}: ${currentDevice}`);
            }

            // 6. Check for rapid location changes (impossible travel)
            const recentLogins = admin.loginHistory
                .slice(-5)
                .filter(login =>
                    login.success &&
                    login.location &&
                    login.location !== 'Unknown' &&
                    login.loginTime > new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
                );

            if (recentLogins.length >= 2) {
                const lastLogin = recentLogins[0];
                const timeDiff = (new Date() - lastLogin.loginTime) / (1000 * 60); // minutes

                if (lastLogin.location !== deviceInfo.location && timeDiff < 60) {
                    threats.push('Rapid location change detected (possible account compromise)');
                    logger.warn(`Impossible travel detected for ${admin.email}: ${lastLogin.location} to ${deviceInfo.location} in ${timeDiff} minutes`);
                }
            }

            // 7. Send security alert if threats detected
            if (threats.length > 0 && admin.emailNotifications?.suspiciousActivity) {
                await this.sendSecurityAlertEmail(admin, threats, deviceInfo);
            }

            return threats;
        } catch (error) {
            logger.error(`Security analysis error for ${admin.email}: ${error.message}`, error);
            return [];
        }
    }

    /**
     * Send security alert email to admin
     */
    static async sendSecurityAlertEmail(admin, threats, deviceInfo) {
        try {
            await sendSecurityAlert({
                email: admin.email,
                name: admin.name,
                threats: threats,
                deviceInfo: deviceInfo,
                timestamp: new Date()
            });

            logger.info(`Security alert email sent to ${admin.email}`);
        } catch (error) {
            logger.error(`Failed to send security alert to ${admin.email}: ${error.message}`);
        }
    }

    /**
     * Clean up inactive sessions across all users
     * Should be run as a scheduled task (e.g., cron job)
     */
    static async cleanupInactiveSessions() {
        try {
            const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
            const now = new Date();

            // Find all users with sessions
            const users = await AdminUser.find({
                'activeSessions.0': { $exists: true }
            });

            let totalSessionsCleaned = 0;
            let usersAffected = 0;

            for (const user of users) {
                let userSessionsCleaned = 0;

                user.activeSessions.forEach(session => {
                    // Mark session as inactive if:
                    // 1. Last activity is older than 24 hours
                    // 2. Session has expired based on expiresAt
                    if (session.isActive && (
                        session.lastActivity < cutoffTime ||
                        (session.expiresAt && session.expiresAt < now)
                    )) {
                        session.isActive = false;
                        userSessionsCleaned++;
                    }
                });

                if (userSessionsCleaned > 0) {
                    await user.save();
                    totalSessionsCleaned += userSessionsCleaned;
                    usersAffected++;
                }
            }

            logger.info(`Session cleanup completed: ${totalSessionsCleaned} sessions deactivated across ${usersAffected} users`);
            return { totalSessionsCleaned, usersAffected };
        } catch (error) {
            logger.error(`Session cleanup error: ${error.message}`, error);
            return { totalSessionsCleaned: 0, usersAffected: 0 };
        }
    }

    /**
     * Monitor for account lockouts and potential coordinated attacks
     */
    static async monitorAccountSecurity() {
        try {
            const now = new Date();

            // Find accounts currently locked
            const lockedAccounts = await AdminUser.find({
                lockoutUntil: { $gt: now },
                failedLoginAttempts: { $gte: 3 },
                isDeleted: false
            }).select('email failedLoginAttempts lockoutUntil loginHistory');

            if (lockedAccounts.length > 0) {
                logger.warn(`Security Monitor: ${lockedAccounts.length} accounts currently locked`);

                // Analyze for coordinated attacks
                const attackIPs = new Map();
                const attackTimeframe = new Date(now - 60 * 60 * 1000); // Last hour

                lockedAccounts.forEach(account => {
                    const recentFailures = account.loginHistory
                        .filter(login =>
                            !login.success &&
                            login.loginTime > attackTimeframe
                        );

                    recentFailures.forEach(attempt => {
                        if (attempt.ip) {
                            if (!attackIPs.has(attempt.ip)) {
                                attackIPs.set(attempt.ip, new Set());
                            }
                            attackIPs.get(attempt.ip).add(account.email);
                        }
                    });
                });

                // Log potential coordinated attacks (same IP targeting multiple accounts)
                attackIPs.forEach((emails, ip) => {
                    if (emails.size >= 3) {
                        logger.error(`⚠️ POTENTIAL COORDINATED ATTACK from IP ${ip} targeting ${emails.size} accounts: ${Array.from(emails).join(', ')}`);
                    }
                });
            }

            return {
                lockedAccountsCount: lockedAccounts.length,
                potentialAttacks: Array.from(
                    [...new Map([...attackIPs].filter(([ip, emails]) => emails.size >= 3))].map(([ip, emails]) => ({
                        ip,
                        targetedAccounts: Array.from(emails),
                        count: emails.size
                    }))
                )
            };
        } catch (error) {
            logger.error(`Security monitoring error: ${error.message}`, error);
            return { lockedAccountsCount: 0, potentialAttacks: [] };
        }
    }

    /**
     * Validate password strength beyond basic requirements
     */
    static validatePasswordStrength(password) {
        const issues = [];

        // Check for common weak patterns
        const weakPatterns = [
            { pattern: /(.)\1{3,}/, message: 'Contains repeated characters (e.g., aaaa)' },
            { pattern: /123456/, message: 'Contains sequential numbers (123456)' },
            { pattern: /654321/, message: 'Contains reverse sequential numbers' },
            { pattern: /abcdef/i, message: 'Contains sequential letters' },
            { pattern: /qwerty/i, message: 'Contains keyboard patterns (qwerty)' },
            { pattern: /password/i, message: 'Contains the word "password"' },
            { pattern: /admin/i, message: 'Contains the word "admin"' },
            { pattern: /12345678/, message: 'Contains sequential pattern' }
        ];

        weakPatterns.forEach(({ pattern, message }) => {
            if (pattern.test(password)) {
                issues.push(message);
            }
        });

        // Check character diversity (entropy)
        const uniqueChars = new Set(password).size;
        const diversityRatio = uniqueChars / password.length;

        if (diversityRatio < 0.5) {
            issues.push('Password has low character diversity');
        }

        // Check for mixed case
        const hasLower = /[a-z]/.test(password);
        const hasUpper = /[A-Z]/.test(password);
        if (!hasLower || !hasUpper) {
            issues.push('Password should contain both uppercase and lowercase letters');
        }

        return {
            isStrong: issues.length === 0,
            score: Math.max(0, 100 - (issues.length * 20)),
            issues
        };
    }

    /**
     * Generate comprehensive security report for admin
     */
    static async generateSecurityReport(adminId) {
        try {
            const admin = await AdminUser.findById(adminId);

            if (!admin) {
                throw new Error('Admin not found');
            }

            const now = new Date();
            const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            // Analyze login patterns
            const recentLogins = admin.loginHistory.filter(
                login => login.loginTime > last30Days
            );

            const last7DaysLogins = admin.loginHistory.filter(
                login => login.loginTime > last7Days
            );

            // Count unique IPs and locations
            const uniqueIPs = new Set(recentLogins.map(login => login.ip).filter(Boolean));
            const uniqueLocations = new Set(
                recentLogins.map(login => login.location).filter(loc => loc && loc !== 'Unknown')
            );

            // Separate successful and failed logins
            const successfulLogins = recentLogins.filter(login => login.success);
            const failedLogins = recentLogins.filter(login => !login.success);

            // Get active sessions info
            const activeSessions = admin.activeSessions.filter(s => s.isActive);
            const sessionLocations = new Set(
                activeSessions.map(s => s.deviceInfo?.location).filter(Boolean)
            );

            // Check for security flags
            const securityFlags = {
                hasRecentFailures: failedLogins.length > 0,
                hasMultipleLocations: uniqueLocations.size > 2,
                hasMultipleIPs: uniqueIPs.size > 3,
                isCurrentlyLocked: admin.isLocked,
                hasPasswordExpired: admin.lastPasswordChange &&
                    (now - admin.lastPasswordChange) > (90 * 24 * 60 * 60 * 1000), // 90 days
                twoFactorEnabled: admin.twoFactorEnabled || false
            };

            // Calculate risk score (0-100, higher is riskier)
            let riskScore = 0;
            if (securityFlags.hasRecentFailures) riskScore += 20;
            if (securityFlags.hasMultipleLocations) riskScore += 15;
            if (securityFlags.hasMultipleIPs) riskScore += 15;
            if (securityFlags.isCurrentlyLocked) riskScore += 30;
            if (securityFlags.hasPasswordExpired) riskScore += 10;
            if (!securityFlags.twoFactorEnabled) riskScore += 10;

            return {
                accountInfo: {
                    email: admin.email,
                    name: admin.name,
                    role: admin.role,
                    status: admin.status,
                    lastLogin: admin.lastLogin,
                    lastPasswordChange: admin.lastPasswordChange,
                    accountAge: Math.floor((now - admin.createdAt) / (1000 * 60 * 60 * 24)),
                    isVerified: admin.isVerified,
                    twoFactorEnabled: admin.twoFactorEnabled || false
                },
                sessionInfo: {
                    activeSessions: activeSessions.length,
                    totalSessions: admin.activeSessions.length,
                    activeLocations: Array.from(sessionLocations),
                    oldestSession: activeSessions.length > 0
                        ? activeSessions.reduce((oldest, session) =>
                            session.loginTime < oldest.loginTime ? session : oldest
                        ).loginTime
                        : null
                },
                loginAnalytics: {
                    last30Days: {
                        totalLogins: recentLogins.length,
                        successfulLogins: successfulLogins.length,
                        failedLogins: failedLogins.length,
                        uniqueIPs: uniqueIPs.size,
                        uniqueLocations: uniqueLocations.size,
                        failureRate: recentLogins.length > 0
                            ? ((failedLogins.length / recentLogins.length) * 100).toFixed(2)
                            : 0
                    },
                    last7Days: {
                        totalLogins: last7DaysLogins.length,
                        successfulLogins: last7DaysLogins.filter(l => l.success).length,
                        failedLogins: last7DaysLogins.filter(l => !l.success).length
                    },
                    mostUsedBrowser: this._getMostFrequent(
                        successfulLogins.map(l => l.browser).filter(Boolean)
                    ),
                    mostUsedOS: this._getMostFrequent(
                        successfulLogins.map(l => l.os).filter(Boolean)
                    ),
                    mostFrequentIP: this._getMostFrequent(
                        successfulLogins.map(l => l.ip).filter(Boolean)
                    )
                },
                securityFlags,
                riskAssessment: {
                    riskScore,
                    riskLevel: riskScore >= 50 ? 'HIGH' : riskScore >= 25 ? 'MEDIUM' : 'LOW',
                    recommendations: this._generateRecommendations(securityFlags, admin)
                },
                recentActivity: {
                    last5Logins: admin.loginHistory
                        .slice(0, 5)
                        .map(login => ({
                            time: login.loginTime,
                            success: login.success,
                            ip: login.ip,
                            location: login.location,
                            browser: login.browser,
                            os: login.os
                        })),
                    recentFailures: failedLogins.slice(0, 10).map(login => ({
                        time: login.loginTime,
                        ip: login.ip,
                        location: login.location,
                        reason: login.failureReason
                    }))
                }
            };
        } catch (error) {
            logger.error(`Security report generation error: ${error.message}`, error);
            throw error;
        }
    }

    /**
     * Helper: Get most frequent item from array
     */
    static _getMostFrequent(arr) {
        if (!arr || arr.length === 0) return 'Unknown';

        const frequency = {};
        let maxCount = 0;
        let mostFrequent = arr[0];

        arr.forEach(item => {
            frequency[item] = (frequency[item] || 0) + 1;
            if (frequency[item] > maxCount) {
                maxCount = frequency[item];
                mostFrequent = item;
            }
        });

        return mostFrequent;
    }

    /**
     * Helper: Generate security recommendations
     */
    static _generateRecommendations(flags, admin) {
        const recommendations = [];

        if (flags.hasRecentFailures) {
            recommendations.push({
                priority: 'HIGH',
                title: 'Recent Failed Login Attempts',
                description: 'Review recent failed login attempts and ensure they are legitimate.',
                action: 'Check login history and change password if suspicious activity is detected'
            });
        }

        if (flags.hasMultipleLocations) {
            recommendations.push({
                priority: 'MEDIUM',
                title: 'Multiple Login Locations',
                description: 'Your account has been accessed from multiple locations.',
                action: 'Review active sessions and terminate any unrecognized sessions'
            });
        }

        if (!flags.twoFactorEnabled) {
            recommendations.push({
                priority: 'MEDIUM',
                title: 'Enable Two-Factor Authentication',
                description: 'Two-factor authentication adds an extra layer of security.',
                action: 'Enable 2FA in your security settings'
            });
        }

        if (flags.hasPasswordExpired) {
            recommendations.push({
                priority: 'HIGH',
                title: 'Password Change Recommended',
                description: 'Your password has not been changed in over 90 days.',
                action: 'Change your password to maintain account security'
            });
        }

        if (flags.isCurrentlyLocked) {
            recommendations.push({
                priority: 'CRITICAL',
                title: 'Account Currently Locked',
                description: 'Your account is locked due to multiple failed login attempts.',
                action: 'Wait for the lockout period to expire or contact support'
            });
        }

        const activeSessions = admin.activeSessions.filter(s => s.isActive).length;
        if (activeSessions > 3) {
            recommendations.push({
                priority: 'LOW',
                title: 'Multiple Active Sessions',
                description: `You have ${activeSessions} active sessions.`,
                action: 'Review and terminate unused sessions for better security'
            });
        }

        // If no issues, add positive feedback
        if (recommendations.length === 0) {
            recommendations.push({
                priority: 'INFO',
                title: 'Account Security Looks Good',
                description: 'No immediate security concerns detected.',
                action: 'Continue following security best practices'
            });
        }

        return recommendations;
    }

    /**
     * Check if admin needs forced password reset
     */
    static async checkPasswordExpiry(admin) {
        const now = new Date();
        const passwordAge = now - admin.lastPasswordChange;
        const maxPasswordAge = 90 * 24 * 60 * 60 * 1000; // 90 days

        return {
            isExpired: passwordAge > maxPasswordAge,
            daysOld: Math.floor(passwordAge / (24 * 60 * 60 * 1000)),
            daysUntilExpiry: Math.max(0, Math.floor((maxPasswordAge - passwordAge) / (24 * 60 * 60 * 1000)))
        };
    }

    /**
     * Detect and prevent session hijacking
     */
    static async detectSessionAnomaly(admin, sessionId, currentDeviceInfo) {
        try {
            const session = admin.activeSessions.find(s => s.sessionId === sessionId);

            if (!session) {
                return { isAnomalous: true, reason: 'Session not found' };
            }

            const anomalies = [];

            // Check if device info has changed significantly
            if (session.deviceInfo) {
                if (session.deviceInfo.browser !== currentDeviceInfo.browser) {
                    anomalies.push('Browser changed during session');
                }
                if (session.deviceInfo.os !== currentDeviceInfo.os) {
                    anomalies.push('Operating system changed during session');
                }

                // IP change is suspicious but can be legitimate (mobile networks)
                if (session.deviceInfo.ip !== currentDeviceInfo.ip) {
                    const ipPrefix1 = session.deviceInfo.ip?.split('.').slice(0, 2).join('.');
                    const ipPrefix2 = currentDeviceInfo.ip?.split('.').slice(0, 2).join('.');

                    // If even the network prefix changed, it's more suspicious
                    if (ipPrefix1 !== ipPrefix2) {
                        anomalies.push('Significant IP address change detected');
                    }
                }
            }

            // Check for rapid location changes
            if (session.deviceInfo?.location &&
                currentDeviceInfo.location &&
                session.deviceInfo.location !== currentDeviceInfo.location) {

                const timeSinceLastActivity = (new Date() - session.lastActivity) / (1000 * 60); // minutes

                if (timeSinceLastActivity < 30) {
                    anomalies.push('Location changed too quickly (possible session hijacking)');
                }
            }

            return {
                isAnomalous: anomalies.length > 0,
                anomalies,
                shouldTerminate: anomalies.some(a =>
                    a.includes('Browser changed') ||
                    a.includes('Operating system changed')
                )
            };
        } catch (error) {
            logger.error(`Session anomaly detection error: ${error.message}`);
            return { isAnomalous: false, anomalies: [] };
        }
    }

    /**
     * Get system-wide security statistics (for principal admins)
     */
    static async getSystemSecurityStats() {
        try {
            const now = new Date();
            const last24Hours = new Date(now - 24 * 60 * 60 * 1000);
            const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);

            // Get all non-deleted admins
            const allAdmins = await AdminUser.find({ isDeleted: false });

            // Count locked accounts
            const lockedAccounts = allAdmins.filter(admin => admin.isLocked).length;

            // Count accounts with recent failed logins
            const accountsWithRecentFailures = allAdmins.filter(admin => {
                const recentFailures = admin.loginHistory.filter(
                    login => !login.success && login.loginTime > last24Hours
                );
                return recentFailures.length > 0;
            }).length;

            // Count total active sessions
            const totalActiveSessions = allAdmins.reduce((total, admin) => {
                return total + admin.activeSessions.filter(s => s.isActive).length;
            }, 0);

            // Find admins with password expiry issues
            const passwordExpiryThreshold = new Date(now - 90 * 24 * 60 * 60 * 1000);
            const accountsWithOldPasswords = allAdmins.filter(
                admin => admin.lastPasswordChange < passwordExpiryThreshold
            ).length;

            // Count admins without 2FA
            const accountsWithout2FA = allAdmins.filter(
                admin => !admin.twoFactorEnabled
            ).length;

            // Recent login statistics
            let totalLoginsLast7Days = 0;
            let failedLoginsLast7Days = 0;

            allAdmins.forEach(admin => {
                const recentLogins = admin.loginHistory.filter(
                    login => login.loginTime > last7Days
                );
                totalLoginsLast7Days += recentLogins.length;
                failedLoginsLast7Days += recentLogins.filter(l => !l.success).length;
            });

            return {
                timestamp: now,
                accountStats: {
                    totalAccounts: allAdmins.length,
                    activeAccounts: allAdmins.filter(a => a.status === 'approved').length,
                    lockedAccounts,
                    pendingAccounts: allAdmins.filter(a => a.status === 'pending').length,
                    suspendedAccounts: allAdmins.filter(a => a.status === 'suspended').length
                },
                securityMetrics: {
                    accountsWithRecentFailures,
                    accountsWithOldPasswords,
                    accountsWithout2FA,
                    totalActiveSessions
                },
                activityStats: {
                    last7Days: {
                        totalLogins: totalLoginsLast7Days,
                        failedLogins: failedLoginsLast7Days,
                        successRate: totalLoginsLast7Days > 0
                            ? (((totalLoginsLast7Days - failedLoginsLast7Days) / totalLoginsLast7Days) * 100).toFixed(2)
                            : 100
                    }
                }
            };
        } catch (error) {
            logger.error(`System security stats error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Audit log for security events (can be expanded to store in separate collection)
     */
    static async logSecurityEvent(eventType, adminId, details = {}) {
        try {
            const admin = await AdminUser.findById(adminId);

            const logEntry = {
                timestamp: new Date(),
                eventType,
                adminId,
                adminEmail: admin?.email || 'Unknown',
                details,
                severity: this._getEventSeverity(eventType)
            };

            // Log to console/file
            const logMessage = `Security Event [${eventType}] - Admin: ${logEntry.adminEmail} - ${JSON.stringify(details)}`;

            if (logEntry.severity === 'HIGH' || logEntry.severity === 'CRITICAL') {
                logger.error(logMessage);
            } else if (logEntry.severity === 'MEDIUM') {
                logger.warn(logMessage);
            } else {
                logger.info(logMessage);
            }

            // In production, you might want to store these in a separate audit collection
            // await AuditLog.create(logEntry);

            return logEntry;
        } catch (error) {
            logger.error(`Security event logging error: ${error.message}`);
        }
    }

    /**
     * Helper: Determine event severity
     */
    static _getEventSeverity(eventType) {
        const severityMap = {
            'ACCOUNT_LOCKED': 'HIGH',
            'FAILED_LOGIN': 'MEDIUM',
            'SUCCESSFUL_LOGIN': 'LOW',
            'PASSWORD_CHANGED': 'MEDIUM',
            'PASSWORD_RESET': 'MEDIUM',
            'SESSION_TERMINATED': 'LOW',
            'SUSPICIOUS_ACTIVITY': 'HIGH',
            'BRUTE_FORCE_DETECTED': 'CRITICAL',
            'ACCOUNT_COMPROMISED': 'CRITICAL',
            'UNAUTHORIZED_ACCESS': 'HIGH',
            'PRIVILEGE_ESCALATION': 'CRITICAL',
            '2FA_ENABLED': 'LOW',
            '2FA_DISABLED': 'MEDIUM'
        };

        return severityMap[eventType] || 'LOW';
    }
}

module.exports = SecurityService;