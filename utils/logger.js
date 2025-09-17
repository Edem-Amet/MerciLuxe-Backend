// utils/Logger.js
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Log file paths
const errorLogPath = path.join(logsDir, 'error.log');
const combinedLogPath = path.join(logsDir, 'combined.log');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

// Get timestamp in readable format
const getTimestamp = () => {
    return new Date().toISOString();
};

// Format log message
const formatMessage = (level, message, data = null) => {
    const timestamp = getTimestamp();
    const logData = data ? ` | Data: ${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${logData}`;
};

// Write to file safely
const writeToFile = (filePath, message) => {
    try {
        fs.appendFileSync(filePath, message + '\n', 'utf8');
    } catch (error) {
        console.error('Failed to write to log file:', error.message);
    }
};

// Log levels with colors
const logger = {
    // Info level - general information
    info: (message, data = null) => {
        const formattedMessage = formatMessage('info', message, data);

        // Console output with color
        console.log(`${colors.green}[INFO]${colors.reset} ${colors.dim}${getTimestamp()}${colors.reset} ${message}`);
        if (data) {
            console.log(`${colors.dim}Data:${colors.reset}`, data);
        }

        // Write to file
        writeToFile(combinedLogPath, formattedMessage);
    },

    // Error level - error messages
    error: (message, data = null) => {
        const formattedMessage = formatMessage('error', message, data);

        // Console output with color
        console.error(`${colors.red}[ERROR]${colors.reset} ${colors.dim}${getTimestamp()}${colors.reset} ${message}`);
        if (data) {
            console.error(`${colors.dim}Data:${colors.reset}`, data);
        }

        // Write to both error and combined logs
        writeToFile(errorLogPath, formattedMessage);
        writeToFile(combinedLogPath, formattedMessage);
    },

    // Warning level - warning messages
    warn: (message, data = null) => {
        const formattedMessage = formatMessage('warn', message, data);

        // Console output with color
        console.warn(`${colors.yellow}[WARN]${colors.reset} ${colors.dim}${getTimestamp()}${colors.reset} ${message}`);
        if (data) {
            console.warn(`${colors.dim}Data:${colors.reset}`, data);
        }

        // Write to file
        writeToFile(combinedLogPath, formattedMessage);
    },

    // Debug level - detailed debugging information
    debug: (message, data = null) => {
        // Only log debug messages in development
        if (process.env.NODE_ENV === 'development') {
            const formattedMessage = formatMessage('debug', message, data);

            // Console output with color
            console.log(`${colors.cyan}[DEBUG]${colors.reset} ${colors.dim}${getTimestamp()}${colors.reset} ${message}`);
            if (data) {
                console.log(`${colors.dim}Data:${colors.reset}`, data);
            }

            // Write to file
            writeToFile(combinedLogPath, formattedMessage);
        }
    },

    // Success level - success messages
    success: (message, data = null) => {
        const formattedMessage = formatMessage('success', message, data);

        // Console output with color
        console.log(`${colors.green}${colors.bright}[SUCCESS]${colors.reset} ${colors.dim}${getTimestamp()}${colors.reset} ${message}`);
        if (data) {
            console.log(`${colors.dim}Data:${colors.reset}`, data);
        }

        // Write to file
        writeToFile(combinedLogPath, formattedMessage);
    },

    // HTTP requests logging
    http: (method, url, status, responseTime = null) => {
        const statusColor = status >= 400 ? colors.red : status >= 300 ? colors.yellow : colors.green;
        const timeInfo = responseTime ? ` (${responseTime}ms)` : '';
        const message = `${method} ${url} - ${status}${timeInfo}`;

        // Console output
        console.log(`${colors.blue}[HTTP]${colors.reset} ${colors.dim}${getTimestamp()}${colors.reset} ${method} ${url} - ${statusColor}${status}${colors.reset}${timeInfo}`);

        // Write to file
        writeToFile(combinedLogPath, formatMessage('http', message));
    },

    // Clear old logs (optional cleanup function)
    clearOldLogs: (daysOld = 30) => {
        try {
            const files = fs.readdirSync(logsDir);
            const now = new Date();

            files.forEach(file => {
                const filePath = path.join(logsDir, file);
                const stats = fs.statSync(filePath);
                const daysDiff = (now - stats.mtime) / (1000 * 60 * 60 * 24);

                if (daysDiff > daysOld) {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted old log file: ${file}`);
                }
            });
        } catch (error) {
            console.error('Failed to clear old logs:', error.message);
        }
    }
};

module.exports = logger;