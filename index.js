require('dotenv').config({ debug: process.env.DEBUG === 'true' });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const os = require('os');
const path = require('path');
const fs = require('fs');

// === Create Express App ===
const app = express();
const PORT = process.env.PORT || 5000;

// === Enhanced CORS Configuration ===
const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://172.20.10.4:5173',
    'https://merciluxegift.store',
    'https://www.merciluxegift.store',
    'https://merciluxe-frontend.onrender.com',
    'https://api.merciluxegift.store'
];

// Add origins from env if available
if (process.env.ALLOWED_ORIGINS) {
    const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
    envOrigins.forEach(origin => {
        if (!allowedOrigins.includes(origin)) {
            allowedOrigins.push(origin);
        }
    });
}

console.log('✅ Allowed Origins:', allowedOrigins);

// CORS middleware function
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
            return callback(null, true);
        }

        // Check if origin is allowed
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log(`⚠️ CORS blocked origin: ${origin}`);
            // In production, allow all origins temporarily to debug
            callback(null, true); // Change to callback(new Error('Not allowed by CORS')) after testing
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers'
    ],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    optionsSuccessStatus: 200,
    preflightContinue: false
};

// Apply CORS globally
app.use(cors(corsOptions));

// Explicitly handle preflight for all routes
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// === Middleware ===
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.get('origin') || 'none'}`);
    next();
});

// === Health Check ===
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'MerciLuxe API Server',
        status: 'running',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// === Serve static images ===
const imagesDir = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}

app.use('/images', express.static(imagesDir, {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml'
        };

        if (mimeTypes[ext]) {
            res.setHeader('Content-Type', mimeTypes[ext]);
        }
    }
}));

// === Test Route ===
app.get('/test-images', (req, res) => {
    try {
        const files = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir) : [];
        res.json({
            status: 'success',
            data: {
                imagePath: imagesDir,
                fileCount: files.length,
                sampleFiles: files.slice(0, 5).map(file => ({
                    name: file,
                    size: fs.statSync(path.join(imagesDir, file)).size
                }))
            }
        });
    } catch (err) {
        console.error('Image directory error:', err);
        res.status(500).json({
            status: 'error',
            message: 'Failed to read image directory',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// === Load Routes ===
console.log('📦 Loading routes...');

const heroRoutes = require('./routes/HeroRoutes');
const categoryRoutes = require('./routes/CategoryRoutes');
const jewelryRoutes = require('./routes/JewelryRoutes');
const orderRoutes = require('./routes/OrderRoutes');
const havenRoutes = require('./routes/HavenRoutes');
const gentRoutes = require('./routes/GentRoutes');
const cooperateRoutes = require('./routes/CooperateRoutes');
const souvenirRoutes = require('./routes/SouvenirRoutes');
const BeadRoutes = require('./routes/BeadRoutes');
const SpecialRoutes = require('./routes/SpecialRoutes');
const packageRequestRoutes = require('./routes/PackageRequestRoutes');
const AdminRoutes = require('./routes/AdminRoutes');

// === Mount Routes ===
app.use('/api/hero', heroRoutes);
app.use('/api/category', categoryRoutes);
app.use('/api/jewelry', jewelryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/queenshaven', havenRoutes);
app.use('/api/gents', gentRoutes);
app.use('/api/cooperate', cooperateRoutes);
app.use('/api/souvenirs', souvenirRoutes);
app.use('/api/beads', BeadRoutes);
app.use('/api/special', SpecialRoutes);
app.use('/api/packagerequest', packageRequestRoutes);
app.use('/api/admin', AdminRoutes);

console.log('✅ All routes loaded');

// === 404 Handler ===
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Route not found',
        requestedUrl: req.originalUrl,
        method: req.method
    });
});

// === Global Error Handler ===
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err.stack || err.message);
    res.status(err.status || 500).json({
        status: 'error',
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && {
            error: err.message,
            stack: err.stack
        })
    });
});

// === Utility Functions ===
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// === Database Connection & Server Start ===
async function startServer() {
    try {
        console.log('🔄 Connecting to MongoDB...');

        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 50000,
            connectTimeoutMS: 50000
        });

        console.log('✅ Connected to MongoDB');

        try {
            await mongoose.connection.db.collection('orders').dropIndex('paymentReference_1');
            console.log('✅ Dropped old paymentReference index');
        } catch (error) {
            console.log('ℹ️ Old index not found or already dropped');
        }

        const server = app.listen(PORT, '0.0.0.0', () => {
            const localIp = getLocalIp();
            console.log('\n╔════════════════════════════════════════╗');
            console.log('║     🚀 SERVER SUCCESSFULLY STARTED    ║');
            console.log('╚════════════════════════════════════════╝\n');
            console.log(`📍 Local:    http://localhost:${PORT}`);
            console.log(`📍 Network:  http://${localIp}:${PORT}`);
            console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
        });

        server.on('error', (err) => {
            console.error('❌ Server error:', err);
            if (err.code === 'EADDRINUSE') {
                console.error(`Port ${PORT} is already in use`);
            }
            process.exit(1);
        });

        // Set timeouts
        server.timeout = 120000; // 2 minutes
        server.keepAliveTimeout = 65000; // 65 seconds

    } catch (err) {
        console.error('❌ Failed to start server:', err.message);
        console.error('Stack:', err.stack);
        process.exit(1);
    }
}

// === Graceful Shutdown ===
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    try {
        await mongoose.connection.close();
        console.log('📴 MongoDB disconnected');
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during shutdown:', err);
        process.exit(1);
    }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer();