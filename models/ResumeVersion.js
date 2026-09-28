const mongoose = require('mongoose');

const resumeVersionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: v => /^[a-zA-Z0-9_\-]+$/.test(v),
      message: 'Invalid userId format'
    }
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    validate: {
      validator: v => v.length > 0,
      message: 'Title cannot be empty'
    }
  },
  templateStyle: {
    type: String,
    enum: ['ats-safe', 'classic'],
    default: 'ats-safe'
  },
  resumeData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  }
}, {
  timestamps: true,
  versionKey: false // Disable __v field
});

// Compound index for userId + createdAt for efficient version retrieval
resumeVersionSchema.index({ userId: 1, createdAt: -1 });

// TTL index - auto-delete old versions after 1 year (optional, can be configured)
// resumeVersionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

module.exports = mongoose.model('ResumeVersion', resumeVersionSchema);