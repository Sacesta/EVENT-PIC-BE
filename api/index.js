const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
require('dotenv').config();

const config = require('../config/environment');
const authRoutes = require('../routes/auth');
const userRoutes = require('../routes/users');
const eventRoutes = require('../routes/events');
const serviceRoutes = require('../routes/services');
const supplierRoutes = require('../routes/suppliers');
const orderRoutes = require('../routes/orders');
const ticketRoutes = require('../routes/tickets');
const adminRoutes = require('../routes/admin');
const chatRoutes = require('../routes/chats');
const supplierRegistrationRoutes = require('../routes/supplierRegistration');
const producerRegistrationRoutes = require('../routes/producerRegistration');

const { errorHandler } = require('../middleware/errorHandler');
const { connectDB } = require('../config/database');
const socketService = require('../services/socketService');

const app = express();
const server = http.createServer(app);
const PORT = config.PORT;

// Trust Vercel's proxy for rate limiting
app.set('trust proxy', 1);

// Connect to MongoDB with retry logic
const connectWithRetry = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB, retrying in 5 seconds...', error.message);
    setTimeout(connectWithRetry, 5000);
  }
};

connectWithRetry();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// CORS configuration - explicit for Vercel
app.use(cors({
  origin: ['https://pic-fe.vercel.app', 'http://localhost:3000', 'http://localhost:5173','http://localhost:8081','http://localhost:8080'],
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Root route for Vercel compatibility
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Pic Backend is running on Vercel',
    environment: config.NODE_ENV,
    frontendUrl: config.FRONTEND_URL,
    backendUrl: config.BACKEND_URL,
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  res.status(200).json({ 
    status: 'OK', 
    message: 'Pic Backend is running',
    environment: config.NODE_ENV,
    database: {
      status: mongoStatus,
      readyState: mongoose.connection.readyState
    },
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/supplier-registration', supplierRegistrationRoutes);
app.use('/api/producer-registration', producerRegistrationRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

// Error handling middleware
app.use(errorHandler);

// Initialize WebSocket service
if (!process.env.VERCEL) {
  // Local development with full WebSocket support
  socketService.initialize(server);
  server.listen(PORT, () => {
    console.log(`🚀 Pic Backend server running on port ${PORT}`);
    console.log(`📊 Environment: ${config.NODE_ENV}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`🌐 Frontend URL: ${config.FRONTEND_URL}`);
    console.log(`🔌 WebSocket server initialized`);
  });
} else {
  // Vercel deployment - WebSockets will work but with limitations
  console.log('🚀 Running on Vercel');
  console.log('⚠️  WebSocket connections may not persist across function invocations');
  console.log('💡 Consider using external WebSocket service for production');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Export for Vercel (default export must be the app)
module.exports = app;

// Also export server for local development
module.exports.server = server; 