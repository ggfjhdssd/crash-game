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
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// Compression and parsing
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Environment check
console.log('🚀 Starting Crash Game Server...');
console.log('📊 Environment:', process.env.NODE_ENV || 'development');
console.log('🤖 Bot Token:', process.env.BOT_TOKEN ? '✅ Set' : '❌ Missing');
console.log('🗄️ MongoDB URI:', process.env.MONGODB_URI ? '✅ Set' : '❌ Missing');
console.log('👑 Admin IDs:', process.env.ADMIN_IDS ? '✅ Set' : '❌ Missing');

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

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        time: new Date().toISOString(),
        uptime: process.uptime(),
        connections: io.engine.clientsCount
    });
});

// API Routes
app.use('/api/admin', require('./routes/admin'));
app.use('/api/auth', require('./routes/auth'));

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Socket.io game logic
require('./socket')(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Frontend: http://localhost:${PORT}`);
    console.log(`🕒 Server time: ${new Date().toLocaleString('en-MM', { timeZone: 'Asia/Yangon' })}`);
});

// Graceful shutdown
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
