require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');

// Security middleware
const {
  requestIdMiddleware,
  requestSizeLimit,
  securityHeadersMiddleware,
  anomalyDetectionMiddleware,
  sanitizeRequestBody,
  methodOverrideProtection
} = require('./src/middleware/security');

const { limiters } = require('./src/middleware/rateLimiter');

// Routes
const routes = require('./src/routes/generateResume');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resumeforge';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Trust proxy for accurate IP detection behind load balancers
app.set('trust proxy', 1);

// ============================================
// SECURITY MIDDLEWARE STACK (ORDER MATTERS!)
// ============================================

// 1. Request ID - must be first for tracing
app.use(requestIdMiddleware);

// 2. Request size limit - early rejection of oversized payloads
app.use(requestSizeLimit(100 * 1024)); // 100KB max

// 3. Security headers (CSP, Permissions Policy, HSTS, etc.)
app.use(helmet({
  contentSecurityPolicy: false, // We use custom CSP
  crossOriginEmbedderPolicy: false, // We set manually
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false
}));
app.use(securityHeadersMiddleware);

// 4. Compression (after security headers, before body parsing)
app.use(compression());

// 5. CORS with strict configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : false, // Disable CORS if not configured
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'x-request-id'],
  credentials: false,
  maxAge: 86400 // 24 hours
}));

// 6. Body parsing with strict limits
app.use(express.json({
  limit: '100kb',
  strict: true,
  verify: (req, res, buf) => {
    // Store raw body for potential verification
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({
  extended: true,
  limit: '100kb',
  parameterLimit: 100 // Max 100 parameters
}));

// 7. Request sanitization (prototype pollution, etc.)
app.use(sanitizeRequestBody);

// 8. HTTP method override protection
app.use(methodOverrideProtection);

// 9. Anomaly detection
app.use(anomalyDetectionMiddleware);

// 10. Per-endpoint rate limiting
app.use('/api/generate-resume', limiters.pdfGeneration);
app.use('/api/save-version', limiters.versionSave);
app.use('/api/versions', limiters.versionRead);
// Version compare endpoint needs specific route before the generic versions route
app.use('/api/versions', (req, res, next) => {
  if (req.path.includes('/compare')) {
    return limiters.versionCompare(req, res, next);
  }
  next();
});
app.use('/api/versions', limiters.versionRead);
app.use('/api/feedback', limiters.feedback);
app.use('/api/optimize-keywords', limiters.keywordOptimize);
app.use('/api/ats-pass', limiters.atsPass);
app.use('/api/stats', limiters.stats);
app.use('/api/health', limiters.health);

// ============================================
// AUTHENTICATION
// ============================================

/**
 * Constant-time comparison to prevent timing attacks
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * API Key Authentication Middleware
 */
function apiKeyAuth(req, res, next) {
  // Skip auth for health check
  if (req.path === '/api/health' || req.path === '/health') {
    return next();
  }

  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing x-api-key header',
      requestId: req.requestId
    });
  }

  if (!API_KEY || !safeCompare(apiKey, API_KEY)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key',
      requestId: req.requestId
    });
  }

  next();
}

// Apply auth to all API routes
app.use('/api', apiKeyAuth);

// ============================================
// ROUTES
// ============================================
app.use('/api', routes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`,
    requestId: req.requestId
  });
});

// Global error handler - never leaks stack traces
app.use((err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  console.error(`[${requestId}] Unhandled error:`, err.message);

  // Don't expose internal errors in production
  const isProduction = NODE_ENV === 'production';

  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: isProduction ? 'An unexpected error occurred.' : err.message,
    requestId
  });
});

// ============================================
// SERVER STARTUP
// ============================================

let server;

async function startServer() {
  try {
    // MongoDB connection with secure options
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4 // IPv4
    });
    console.log('Connected to MongoDB');

    // Start HTTP server
    server = app.listen(PORT, () => {
      console.log(`ResumeForge server running on port ${PORT}`);
      console.log(`Environment: ${NODE_ENV}`);
      console.log(`Security: Helmet + CSP + Rate Limiting + Anomaly Detection active`);
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
      } else {
        console.error('Server error:', error);
      }
      process.exit(1);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

async function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      console.log('HTTP server closed');
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  }

  // Close MongoDB connection
  try {
    await mongoose.connection.close(false);
    console.log('MongoDB connection closed');
  } catch (err) {
    console.error('Error closing MongoDB:', err);
  }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  shutdown('unhandledRejection');
});

startServer();

module.exports = app; // For testing