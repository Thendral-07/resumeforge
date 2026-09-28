/**
 * Advanced Rate Limiting with Redis backend
 * Supports multiple strategies: sliding window, token bucket, fixed window
 */

const crypto = require('crypto');

/**
 * In-memory fallback store (when Redis unavailable)
 */
class MemoryStore {
  constructor() {
    this.store = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  async increment(key, windowMs) {
    const now = Date.now();
    const record = this.store.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count++;
    }

    this.store.set(key, record);
    return {
      totalHits: record.count,
      resetTime: record.resetTime,
      isFirstInWindow: record.count === 1
    };
  }

  async decrement(key) {
    const record = this.store.get(key);
    if (record && record.count > 0) {
      record.count--;
    }
  }

  async resetKey(key) {
    this.store.delete(key);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key);
      }
    }
  }

  shutdown() {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

/**
 * Redis store wrapper (if Redis available)
 */
class RedisStore {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  async increment(key, windowMs) {
    const now = Date.now();
    const pipeline = this.redis.pipeline();

    pipeline.incr(key);
    pipeline.pexpire(key, windowMs);
    pipeline.pttl(key);

    const results = await pipeline.exec();
    const totalHits = results[0][1];
    const ttl = results[2][1];
    const resetTime = now + (ttl > 0 ? ttl : windowMs);

    return {
      totalHits,
      resetTime,
      isFirstInWindow: totalHits === 1
    };
  }

  async decrement(key) {
    await this.redis.decr(key);
  }

  async resetKey(key) {
    await this.redis.del(key);
  }

  shutdown() {
    // Redis connection managed externally
  }
}

/**
 * Token bucket algorithm for smooth rate limiting
 */
class TokenBucket {
  constructor(capacity, refillRatePerSec) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRatePerSec;
    this.lastRefill = Date.now();
  }

  consume(tokens = 1) {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return { allowed: true, remaining: this.tokens };
    }
    return { allowed: false, remaining: this.tokens, retryAfter: Math.ceil((tokens - this.tokens) / this.refillRate * 1000) };
  }

  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

/**
 * Advanced rate limiter with multiple strategies
 */
class AdvancedRateLimiter {
  constructor(options = {}) {
    this.store = options.store || new MemoryStore();
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
    this.max = options.max || 100; // max requests per window
    this.message = options.message || 'Too many requests, please try again later.';
    this.statusCode = options.statusCode || 429;
    this.standardHeaders = options.standardHeaders !== false;
    this.legacyHeaders = options.legacyHeaders === true;
    this.keyGenerator = options.keyGenerator || ((req) => req.ip);
    this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
    this.skipFailedRequests = options.skipFailedRequests || false;
    this.handler = options.handler;

    // Token bucket for burst handling
    this.tokenBucket = new TokenBucket(
      options.burstCapacity || this.max,
      (this.max / (this.windowMs / 1000)) || 1
    );

    // Per-endpoint limits
    this.endpointLimits = options.endpointLimits || {};
  }

  /**
   * Generate rate limit key with prefix
   */
  getKey(req, prefix = 'rl') {
    const identifier = this.keyGenerator(req);
    const endpoint = req.path.replace(/[^a-zA-Z0-9]/g, '_');
    return `${prefix}:${identifier}:${endpoint}`;
  }

  /**
   * Get limit for specific endpoint
   */
  getEndpointLimit(req) {
    const endpoint = req.path;
    for (const [pattern, limit] of Object.entries(this.endpointLimits)) {
      const regex = new RegExp(pattern);
      if (regex.test(endpoint)) {
        return limit;
      }
    }
    return { max: this.max, windowMs: this.windowMs };
  }

  /**
   * Main middleware function
   */
  middleware() {
    return async (req, res, next) => {
      try {
        const key = this.getKey(req);
        const limit = this.getEndpointLimit(req);

        // Check token bucket first (burst protection)
        const bucketResult = this.tokenBucket.consume(1);
        if (!bucketResult.allowed) {
          return this.sendLimitResponse(res, req, {
            limit: this.tokenBucket.capacity,
            remaining: 0,
            reset: Date.now() + bucketResult.retryAfter,
            retryAfter: Math.ceil(bucketResult.retryAfter / 1000)
          });
        }

        // Check sliding window
        const result = await this.store.increment(key, limit.windowMs);
        const remaining = Math.max(0, limit.max - result.totalHits);
        const reset = result.resetTime;

        // Set headers
        if (this.standardHeaders) {
          res.setHeader('RateLimit-Limit', limit.max);
          res.setHeader('RateLimit-Remaining', remaining);
          res.setHeader('RateLimit-Reset', Math.ceil(reset / 1000));
        }
        if (this.legacyHeaders) {
          res.setHeader('X-RateLimit-Limit', limit.max);
          res.setHeader('X-RateLimit-Remaining', remaining);
          res.setHeader('X-RateLimit-Reset', Math.ceil(reset / 1000));
        }

        // Check if limit exceeded
        if (result.totalHits > limit.max) {
          return this.sendLimitResponse(res, req, {
            limit: limit.max,
            remaining: 0,
            reset,
            retryAfter: Math.ceil((reset - Date.now()) / 1000)
          });
        }

        // Track if we should skip counting this request
        const shouldSkip = (this.skipSuccessfulRequests && res.statusCode < 400) ||
                          (this.skipFailedRequests && res.statusCode >= 400);

        if (shouldSkip) {
          await this.store.decrement(key);
        }

        next();
      } catch (error) {
        // Fail open - don't block requests if rate limiter fails
        console.error('Rate limiter error:', error);
        next();
      }
    };
  }

  /**
   * Send rate limit response
   */
  sendLimitResponse(res, req, details) {
    res.setHeader('Retry-After', details.retryAfter);

    if (this.handler) {
      return this.handler(req, res, next => {});
    }

    return res.status(this.statusCode).json({
      error: 'Rate limit exceeded',
      message: this.message,
      limit: details.limit,
      remaining: details.remaining,
      reset: Math.ceil(details.reset / 1000),
      retryAfter: details.retryAfter,
      requestId: req.requestId
    });
  }

  /**
   * Reset limit for a specific key
   */
  async resetKey(key) {
    return this.store.resetKey(key);
  }

  shutdown() {
    this.store.shutdown();
  }
}

/**
 * Create rate limiter with sensible defaults
 */
function createRateLimiter(options = {}) {
  const limiter = new AdvancedRateLimiter(options);
  return limiter.middleware();
}

/**
 * Pre-configured limiters for different endpoints
 */
const limiters = {
  // Strict limit for PDF generation (resource intensive)
  pdfGeneration: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 PDFs per minute
    message: 'PDF generation rate limit exceeded. Please wait before generating more resumes.',
    endpointLimits: {
      '^/api/generate-resume$': { max: 10, windowMs: 60000 }
    }
  }),

  // Moderate limit for version saving
  versionSave: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 saves per minute
    endpointLimits: {
      '^/api/save-version$': { max: 30, windowMs: 60000 }
    }
  }),

  // Lenient limit for reads
  versionRead: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 reads per minute
    endpointLimits: {
      '^/api/versions/': { max: 100, windowMs: 60000 }
    }
  }),

  // Feedback submission
  feedback: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 feedback per hour
    endpointLimits: {
      '^/api/feedback$': { max: 20, windowMs: 3600000 }
    }
  }),

  // Stats (internal)
  stats: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    endpointLimits: {
      '^/api/stats$': { max: 30, windowMs: 60000 }
    }
  }),

  // Health check (very lenient)
  health: createRateLimiter({
    windowMs: 60 * 1000,
    max: 200,
    endpointLimits: {
      '^/api/health$': { max: 200, windowMs: 60000 }
    }
  }),

  // Version comparison (moderate)
  versionCompare: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 compares per minute
    endpointLimits: {
      '^/api/versions/.*/compare$': { max: 30, windowMs: 60000 }
    }
  }),

  // Keyword optimization (strict - NLP is expensive)
  keywordOptimize: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 optimizations per hour
    endpointLimits: {
      '^/api/optimize-keywords$': { max: 10, windowMs: 3600000 }
    }
  }),

  // ATS pass tracking (moderate)
  atsPass: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 ATS pass records per hour
    endpointLimits: {
      '^/api/ats-pass$': { max: 20, windowMs: 3600000 }
    }
  })
};

module.exports = {
  AdvancedRateLimiter,
  createRateLimiter,
  limiters,
  MemoryStore,
  RedisStore,
  TokenBucket
};