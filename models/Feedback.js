const mongoose = require('mongoose');

const ATS_SYSTEMS = [
  'workday', 'greenhouse', 'lever', 'icims', 'taleo',
  'bamboohr', 'jobvite', 'smartrecruiters', 'bullhorn',
  'oracle-taleo', 'successfactors', 'cornerstone', 'other'
];

const atsPassDetailSchema = new mongoose.Schema({
  system: {
    type: String,
    enum: ATS_SYSTEMS,
    required: true
  },
  passed: {
    type: Boolean,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    maxlength: 500
  }
}, { _id: false });

const feedbackSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: v => /^[a-zA-Z0-9_\-]+$/.test(v),
      message: 'Invalid userId format'
    }
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    validate: {
      validator: Number.isInteger,
      message: 'Rating must be an integer'
    }
  },
  comment: {
    type: String,
    default: '',
    maxlength: 1000,
    validate: {
      validator: v => v.length <= 1000,
      message: 'Comment cannot exceed 1000 characters'
    }
  },
  didPassATS: {
    type: Boolean,
    default: null
  },
  // ATS System tracking
  atsSystems: [{
    type: String,
    enum: ATS_SYSTEMS,
    index: true
  }],
  atsPassDetails: [atsPassDetailSchema],
  requestId: {
    type: String,
    maxlength: 64
  }
}, {
  timestamps: true,
  versionKey: false
});

// Index for time-based queries and user feedback retrieval
feedbackSchema.index({ createdAt: -1 });
feedbackSchema.index({ userId: 1, createdAt: -1 });

// TTL index - auto-delete feedback after 1 year
feedbackSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

module.exports = mongoose.model('Feedback', feedbackSchema);