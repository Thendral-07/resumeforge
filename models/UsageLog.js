const mongoose = require('mongoose');

const usageLogSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: v => /^[a-zA-Z0-9_\-]+$/.test(v),
      message: 'Invalid userId format'
    }
  },
  timestamp: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  success: {
    type: Boolean,
    required: true
  },
  errorMessage: {
    type: String,
    default: null,
    maxlength: 500 // Limit error message length
  },
  requestId: {
    type: String,
    maxlength: 64
  }
}, {
  timestamps: false, // We use custom timestamp
  versionKey: false
});

// Index for time-based queries
usageLogSchema.index({ timestamp: -1 });
usageLogSchema.index({ userId: 1, timestamp: -1 });

// TTL index - auto-delete logs after 90 days
usageLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('UsageLog', usageLogSchema);