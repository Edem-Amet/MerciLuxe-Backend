// utils/DeviceUtils.js

// Simple user agent parsing
const parseUserAgent = (userAgent) => {
    if (!userAgent) {
        return {
            browser: 'Unknown',
            os: 'Unknown',
            deviceType: 'Unknown'
        };
    }

    const ua = userAgent.toLowerCase();

    // Detect browser
    let browser = 'Unknown';
    if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('edg')) browser = 'Edge';
    else if (ua.includes('opera') || ua.includes('opr')) browser = 'Opera';

    // Detect OS
    let os = 'Unknown';
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac')) os = 'MacOS';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

    // Detect device type
    let deviceType = 'Desktop';
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
        deviceType = 'Mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
        deviceType = 'Tablet';
    }

    return {
        browser,
        os,
        deviceType
    };
};

// Simple location detection (you can enhance this with a proper IP geolocation service)
const getLocationFromIP = (ip) => {
    // This is a placeholder - in production, you would use a service like:
    // - ipapi.co
    // - ipgeolocation.io
    // - MaxMind GeoIP

    if (!ip || ip === '127.0.0.1' || ip === '::1') {
        return 'Local';
    }

    // For development, return a generic location
    return 'Unknown Location';
};

// Check for suspicious activity patterns
const detectSuspiciousActivity = (admin, deviceInfo) => {
    const threats = [];

    try {
        // Check for too many recent failed logins
        if (admin.failedLoginAttempts >= 3) {
            threats.push('Multiple recent failed login attempts');
        }

        // Check for login from multiple locations in short time
        const recentSessions = admin.activeSessions
            ?.filter(s => s.isActive && s.loginTime > new Date(Date.now() - 2 * 60 * 60 * 1000)) // Last 2 hours
            || [];

        const locations = new Set(recentSessions.map(s => s.deviceInfo?.location).filter(Boolean));
        if (locations.size > 2) {
            threats.push('Login from multiple locations in short time');
        }

        // Check for unusual login times (this is basic - you can enhance)
        const hour = new Date().getHours();
        if (hour < 6 || hour > 23) {
            threats.push('Login at unusual hours');
        }

    } catch (error) {
        console.error('Error detecting suspicious activity:', error);
    }

    return threats;
};

// Simple high-risk IP check (placeholder)
const isHighRiskIP = (ip) => {
    // This is a placeholder - in production, you would check against:
    // - Known proxy/VPN IP ranges
    // - Threat intelligence feeds
    // - Geolocation restrictions

    if (!ip) return false;

    // For now, just flag obvious local/private IPs as safe
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return false;
    }

    return false; // Default to safe for development
};

module.exports = {
    parseUserAgent,
    getLocationFromIP,
    detectSuspiciousActivity,
    isHighRiskIP
};