/**
 * Advanced Security Middleware Suite
 * - Request ID generation for tracing
 * - Request size validation
 * - Security headers (CSP, Permissions Policy, etc.)
 * - Anomaly detection
 * - Request sanitization
 */

const crypto = require('crypto');

/**
 * Generate cryptographically secure request ID
 */
function generateRequestId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Request ID middleware - adds unique ID to every request for tracing
 */
function requestIdMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || generateRequestId();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

/**
 * Request size validation - prevents oversized payloads
 */
function requestSizeLimit(maxSizeBytes = 100 * 1024) {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > maxSizeBytes) {
      return res.status(413).json({
        error: 'Payload too large',
        message: `Request body exceeds ${maxSizeBytes} bytes limit`,
        requestId: req.requestId
      });
    }
    next();
  };
}

/**
 * Strict Content Security Policy configuration
 */
const cspDirectives = {
  defaultSrc: ["'none'"],
  scriptSrc: ["'none'"], // No scripts allowed (Puppeteer runs with JS disabled)
  styleSrc: ["'self'", "'unsafe-inline'"], // Only inline styles for templates
  imgSrc: ["'none'"], // No images in ATS-safe template
  fontSrc: ["'none'"],
  objectSrc: ["'none'"],
  mediaSrc: ["'none'"],
  frameSrc: ["'none'"],
  connectSrc: ["'none'"], // No network connections from client
  baseUri: ["'none'"],
  formAction: ["'none'"],
  frameAncestors: ["'none'"],
  blockAllMixedContent: true,
  upgradeInsecureRequests: true
};

/**
 * Permissions Policy (formerly Feature Policy) - disable all browser features
 */
const permissionsPolicy = {
  accelerometer: [],
  camera: [],
  geolocation: [],
  gyroscope: [],
  magnetometer: [],
  microphone: [],
  payment: [],
  usb: [],
  'xr-spatial-tracking': [],
  'document-domain': [],
  'encrypted-media': [],
  'fullscreen': [],
  'picture-in-picture': [],
  'publickey-credentials-get': [],
  'screen-wake-lock': [],
  'web-share': []
};

/**
 * Build CSP header string
 */
function buildCspHeader(directives) {
  return Object.entries(directives)
    .map(([key, values]) => {
      const headerKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      if (values === true) return headerKey;
      if (Array.isArray(values)) return `${headerKey} ${values.join(' ')}`;
      return `${headerKey} ${values}`;
    })
    .join('; ');
}

/**
 * Build Permissions Policy header string
 */
function buildPermissionsPolicy(policy) {
  return Object.entries(policy)
    .map(([feature, allowlist]) => `${feature}=(${allowlist.join(' ')})`)
    .join(', ');
}

/**
 * Advanced security headers middleware
 */
function securityHeadersMiddleware(req, res, next) {
  // Remove server identification
  res.removeHeader('X-Powered-By');

  // Strict CSP
  res.setHeader('Content-Security-Policy', buildCspHeader(cspDirectives));

  // Permissions Policy
  res.setHeader('Permissions-Policy', buildPermissionsPolicy(permissionsPolicy));

  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0'); // Modern browsers don't need this, but explicit
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // HSTS (if HTTPS)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Cache control for API responses
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  next();
}

/**
 * Anomaly detection - track suspicious patterns
 */
const anomalyTracker = new Map();
const ANOMALY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS_PER_WINDOW = 50;
const MAX_ERROR_RATE = 0.5;

function anomalyDetectionMiddleware(req, res, next) {
  const identifier = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  // Clean old entries
  for (const [key, data] of anomalyTracker.entries()) {
    if (now - data.windowStart > ANOMALY_WINDOW_MS) {
      anomalyTracker.delete(key);
    }
  }

  const tracker = anomalyTracker.get(identifier) || {
    requests: 0,
    errors: 0,
    windowStart: now,
    suspiciousPatterns: new Set()
  };

  tracker.requests++;

  // Check for suspicious patterns
  const ua = req.headers['user-agent'] || '';
  if (!ua || ua.length < 10) {
    tracker.suspiciousPatterns.add('missing_ua');
  }
  if (ua.includes('python') || ua.includes('curl') || ua.includes('wget') || ua.includes('postman')) {
    tracker.suspiciousPatterns.add('automated_tool');
  }

  // Check request frequency
  if (tracker.requests > MAX_REQUESTS_PER_WINDOW) {
    tracker.suspiciousPatterns.add('high_frequency');
  }

  anomalyTracker.set(identifier, tracker);

  // Attach anomaly info to request
  req.anomalyScore = tracker.suspiciousPatterns.size;
  req.isSuspicious = tracker.suspiciousPatterns.size >= 2;

  // Block highly suspicious requests
  if (req.isSuspicious && tracker.requests > 20) {
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Suspicious activity detected. Please slow down.',
      requestId: req.requestId
    });
  }

  // Track error rate on response
  const originalSend = res.send;
  res.send = function(body) {
    if (res.statusCode >= 400) {
      tracker.errors++;
      const errorRate = tracker.errors / tracker.requests;
      if (errorRate > MAX_ERROR_RATE && tracker.requests > 10) {
        tracker.suspiciousPatterns.add('high_error_rate');
      }
    }
    anomalyTracker.set(identifier, tracker);
    return originalSend.call(this, body);
  };

  next();
}

/**
 * Request body sanitization - additional layer beyond validator
 */
function sanitizeRequestBody(req, res, next) {
  if (!req.body || typeof req.body !== 'object') return next();

  // Remove any prototype pollution attempts
  delete req.body.__proto__;
  delete req.body.constructor;
  delete req.body.prototype;

  // Recursively sanitize object
  function sanitize(obj, depth = 0) {
    if (depth > 10) return; // Prevent deep recursion
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(item => sanitize(item, depth + 1));
    }
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip dangerous keys
      if (key.startsWith('$') || key.startsWith('__') || key === 'constructor') continue;
      sanitized[key] = sanitize(value, depth + 1);
    }
    return sanitized;
  }

  req.body = sanitize(req.body);
  next();
}

/**
 * HTTP Method override protection
 */
function methodOverrideProtection(req, res, next) {
  // Block dangerous method overrides
  const overriddenMethod = req.headers['x-http-method-override'] || req.headers['x-method-override'];
  if (overriddenMethod) {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'HTTP method override is not permitted',
      requestId: req.requestId
    });
  }
  next();
}

module.exports = {
  requestIdMiddleware,
  requestSizeLimit,
  securityHeadersMiddleware,
  anomalyDetectionMiddleware,
  sanitizeRequestBody,
  methodOverrideProtection,
  buildCspHeader,
  buildPermissionsPolicy,
  cspDirectives,
  permissionsPolicy
};