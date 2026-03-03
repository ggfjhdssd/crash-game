require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

// Socket.io setup with production config
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? ['https://t.me', 'https://telegram.org'] 
            : '*',
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Store io instance
app.locals.io = io;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Compression and parsing
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =============================================
// FIXED: Static files path - now looking in the correct directory
// =============================================
app.use(express.static(path.join(__dirname, 'frontend')));

// Environment check
console.log('🚀 Starting Crash Game Server...');
console.log('📊 Environment:', process.env.NODE_ENV || 'development');
console.log('🤖 Bot Token:', process.env.BOT_TOKEN ? '✅ Set' : '❌ Missing');
console.log('🗄️ MongoDB URI:', process.env.MONGODB_URI ? '✅ Set' : '❌ Missing');
console.log('👑 Admin IDs:', process.env.ADMIN_IDS ? '✅ Set' : '❌ Missing');
console.log('📁 Frontend path:', path.join(__dirname, 'frontend'));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});

// =============================================
// HEALTH CHECK - Use this to verify server is running
// =============================================
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        time: new Date().toISOString(),
        uptime: process.uptime(),
        connections: io.engine.clientsCount,
        frontendPath: path.join(__dirname, 'frontend')
    });
});

// =============================================
// API ROUTES
// =============================================
app.use('/api/admin', require('./routes/admin'));
app.use('/api/auth', require('./routes/auth'));

// =============================================
// SPA FALLBACK - Serve index.html for any non-API routes (for client-side routing)
// =============================================
app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.url.startsWith('/api/') || req.url === '/health') {
        return next();
    }
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// =============================================
// 404 HANDLER - For API routes only
// =============================================
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// =============================================
// ERROR HANDLER
// =============================================
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// =============================================
// SOCKET.IO GAME LOGIC
// =============================================
require('./socket')(io);

// =============================================
// START SERVER
// =============================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Frontend URL: https://crash-game-b1ox.onrender.com`);
    console.log(`🕒 Server time: ${new Date().toLocaleString('en-MM', { timeZone: 'Asia/Yangon' })}`);
    console.log(`📁 Serving static files from: ${path.join(__dirname, 'frontend')}`);
});

// =============================================
// GRACEFUL SHUTDOWN
// =============================================
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, closing server...');
    server.close(() => {
        console.log('Server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});
