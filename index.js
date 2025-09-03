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

// === Ultimate CORS Configuration ===
const defaultOrigins = [
    'http://localhost:5173',
    'http://172.20.10.4:5173', // Your current mobile IP
    'https://merciluxe-frontend.onrender.com',
    'http://192.168.6.155:5173', // Allow all devices on local network
    'http://10.132.52.233:5173', // Common home network range
    'http://[::1]'   // IPv6 localhost
];

const allowedOrigins = [...new Set([
    ...defaultOrigins,
    ...(process.env.ALLOWED_ORIGINS ?
        process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
        : [])
])];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) return callback(null, true);

        // Check against allowed origins
        const isAllowed = allowedOrigins.some(allowedOrigin => {
            // Support wildcard domains
            if (allowedOrigin.includes('*')) {
                const regex = new RegExp(allowedOrigin.replace('*', '.*'));
                return regex.test(origin);
            }
            return origin === allowedOrigin;
        });

        if (isAllowed) {
            console.log(`✅ Allowed CORS for: ${origin}`);
            return callback(null, true);
        } else {
            console.error(`❌ Blocked CORS for: ${origin}`);
            console.log('Allowed origins:', allowedOrigins);
            return callback(new Error('Not allowed by CORS'), false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));


// === Middleware ===
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// === Health Check ===
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
    });
});

// === Serve static images with better caching ===
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

// === Basic API Routes ===
const heroRoutes = require('./routes/HeroRoutes');
const categoryRoutes = require('./routes/CategoryRoutes');
const jewelryRoutes = require('./routes/JewelryRoutes');
const orderRoutes = require('./routes/OrderRoutes');
const havenRoutes = require('./routes/HavenRoutes');
const gentRoutes = require('./routes/GentRoutes');
const cooperateRoutes = require('./routes/CooperateRoutes');
const souvenirRoutes = require('./routes/SouvenirRoutes');
const BeadRoutes = require('./routes/BeadRoutes');
const SpecialRoutes = require('./routes/SpecialRoutes')
const AdminRoutes = require('./routes/AdminRoutes');

// === Enhanced Test Route ===
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

// === Routes ===
app.use('/api/hero', heroRoutes);
app.use('/api/category', categoryRoutes);
app.use('/api/jewelry', jewelryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/queenshaven', havenRoutes);
app.use('/api/gents', gentRoutes);
app.use('/api/cooperate', cooperateRoutes);
app.use('/api/souvenirs', souvenirRoutes);
app.use('/api/beads', BeadRoutes);
app.use('/api/special', SpecialRoutes)
app.use('/api/admin', AdminRoutes);


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
    res.status(500).json({
        status: 'error',
        message: 'Internal Server Error',
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
            console.log(`🚀 Server running at:`);
            console.log(`- Local: http://localhost:${PORT}`);
            console.log(`- Network: http://${localIp}:${PORT}`);
        });

        // Handle server errors
        server.on('error', (err) => {
            console.error('Server error:', err);
            process.exit(1);
        });

    } catch (err) {
        console.error('❌ Failed to start server:', err.message);
        process.exit(1);
    }
}

// === Graceful Shutdown ===
process.on('SIGINT', async () => {
    try {
        await mongoose.connection.close();
        console.log('📴 MongoDB disconnected due to app termination');
        process.exit(0);
    } catch (err) {
        console.error('Failed to shutdown gracefully:', err);
        process.exit(1);
    }
});

// Start the server
startServer();