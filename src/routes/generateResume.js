const express = require('express');
const { generatePdf } = require('../utils/pdfGenerator');
const { validateResume, validateFeedback, validateSaveVersion, validateCompareVersions, validateOptimizeKeywords, validateATSPass, ATS_SYSTEMS } = require('../utils/validator');
const { computeDiff, generateDiffSummary } = require('../utils/diff');
const { analyzeKeywords } = require('../utils/keywordOptimizer');
const ResumeVersion = require('../../models/ResumeVersion');
const UsageLog = require('../../models/UsageLog');
const Feedback = require('../../models/Feedback');

const router = express.Router();

/**
 * POST /api/generate-resume
 * Generate ATS-optimized PDF from resume JSON
 * Supports templateStyle: 'ats-safe' (default) | 'classic'
 */
router.post('/generate-resume', async (req, res) => {
  const userId = req.body.userId;

  try {
    // Validate input
    const validation = validateResume(req.body);
    if (!validation.success) {
      // Log failure
      if (userId) {
        await UsageLog.create({
          userId,
          success: false,
          errorMessage: `Validation error: ${validation.errors.map(e => e.message).join(', ')}`
        });
      }
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
        requestId: req.requestId
      });
    }

    // Get template style (default to 'ats-safe')
    const templateStyle = req.body.templateStyle || 'ats-safe';

    // Generate PDF
    const pdfBuffer = await generatePdf(validation.data, templateStyle);

    // Log success
    if (userId) {
      await UsageLog.create({
        userId,
        success: true,
        errorMessage: null
      });
    }

    // Set headers for PDF download
    const filename = templateStyle === 'classic' ? 'resume-classic.pdf' : 'resume.pdf';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
      'X-Content-Type-Options': 'nosniff'
    });

    res.send(pdfBuffer);
  } catch (error) {
    console.error(`[${req.requestId}] Generate resume error:`, error);

    // Log failure
    if (userId) {
      await UsageLog.create({
        userId,
        success: false,
        errorMessage: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to generate resume',
      message: error.message,
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/save-version
 * Save a resume version to MongoDB
 */
router.post('/save-version', async (req, res) => {
  try {
    const validation = validateSaveVersion(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
        requestId: req.requestId
      });
    }

    const { userId, title, templateStyle, resumeData } = validation.data;

    const version = await ResumeVersion.create({
      userId,
      title,
      templateStyle: templateStyle || 'ats-safe',
      resumeData
    });

    res.status(201).json({
      status: 'saved',
      version: {
        id: version._id,
        userId: version.userId,
        title: version.title,
        templateStyle: version.templateStyle,
        createdAt: version.createdAt
      },
      requestId: req.requestId
    });
  } catch (error) {
    console.error(`[${req.requestId}] Save version error:`, error);
    res.status(500).json({
      error: 'Failed to save version',
      message: error.message,
      requestId: req.requestId
    });
  }
});

/**
 * GET /api/versions/:userId
 * Retrieve all saved versions for a user
 */
router.get('/versions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
        requestId: req.requestId
      });
    }

    // Strict validation of userId format
    if (!/^[a-zA-Z0-9_\-]+$/.test(userId)) {
      return res.status(400).json({
        error: 'Invalid userId format',
        requestId: req.requestId
      });
    }

    const versions = await ResumeVersion.find({ userId })
      .select('title templateStyle createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      versions: versions.map(v => ({
        id: v._id,
        title: v.title,
        templateStyle: v.templateStyle,
        createdAt: v.createdAt
      })),
      requestId: req.requestId
    });
  } catch (error) {
    console.error(`[${req.requestId}] Get versions error:`, error);
    res.status(500).json({
      error: 'Failed to retrieve versions',
      message: error.message,
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/feedback
 * Submit user feedback
 */
router.post('/feedback', async (req, res) => {
  try {
    const validation = validateFeedback(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
        requestId: req.requestId
      });
    }

    const { userId, rating, comment, didPassATS } = validation.data;

    await Feedback.create({
      userId,
      rating,
      comment: comment || '',
      didPassATS: didPassATS ?? null
    });

    res.json({
      status: 'received',
      message: 'Thanks for your feedback!',
      requestId: req.requestId
    });
  } catch (error) {
    console.error(`[${req.requestId}] Feedback error:`, error);
    res.status(500).json({
      error: 'Failed to save feedback',
      message: error.message,
      requestId: req.requestId
    });
  }
});

/**
 * GET /api/versions/:userId/compare
 * Compare two resume versions side-by-side
 */
router.get('/versions/:userId/compare', async (req, res) => {
  try {
    // Validate query parameters (versionId1, versionId2 in query)
    const validation = validateCompareVersions({
      userId: req.params.userId,
      versionId1: req.query.versionId1,
      versionId2: req.query.versionId2
    });

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
        requestId: req.requestId
      });
    }

    const { userId, versionId1, versionId2 } = validation.data;

    // Fetch both versions
    const [v1, v2] = await Promise.all([
      ResumeVersion.findById(versionId1).lean(),
      ResumeVersion.findById(versionId2).lean()
    ]);

    if (!v1 || !v2) {
      return res.status(404).json({
        error: 'Version not found',
        message: 'One or both versions not found',
        requestId: req.requestId
      });
    }

    // Verify ownership
    if (v1.userId !== userId || v2.userId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to these versions',
        requestId: req.requestId
      });
    }

    // Compute diff
    const diff = computeDiff(v1.resumeData, v2.resumeData);
    const summary = generateDiffSummary(diff);

    res.json({
      version1: {
        id: v1._id,
        title: v1.title,
        templateStyle: v1.templateStyle,
        createdAt: v1.createdAt
      },
      version2: {
        id: v2._id,
        title: v2.title,
        templateStyle: v2.templateStyle,
        createdAt: v2.createdAt
      },
      diff,
      summary,
      requestId: req.requestId
    });
  } catch (error) {
    console.error(`[${req.requestId}] Version compare error:`, error);
    res.status(500).json({
      error: 'Failed to compare versions',
      message: error.message,
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/optimize-keywords
 * Analyze resume against job description for ATS keyword optimization
 */
router.post('/optimize-keywords', async (req, res) => {
  try {
    const validation = validateOptimizeKeywords(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
        requestId: req.requestId
      });
    }

    const { userId, resumeData, jobDescription, targetRole } = validation.data;

    // Perform keyword analysis - pass the full resumeData object
    const analysis = analyzeKeywords(resumeData, jobDescription);

    // Add target role context if provided
    if (targetRole) {
      analysis.targetRole = targetRole;
    }

    // Log usage
    if (userId) {
      await UsageLog.create({
        userId,
        success: true,
        errorMessage: null
      });
    }

    res.json({
      analysis,
      requestId: req.requestId
    });
  } catch (error) {
    console.error(`[${req.requestId}] Keyword optimization error:`, error);

    // Log failure
    if (req.body.userId) {
      await UsageLog.create({
        userId: req.body.userId,
        success: false,
        errorMessage: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to optimize keywords',
      message: error.message,
      requestId: req.requestId
    });
  }
});

/**
 * POST /api/ats-pass
 * Track which ATS systems a resume has passed through
 */
router.post('/ats-pass', async (req, res) => {
  try {
    const validation = validateATSPass(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
        requestId: req.requestId
      });
    }

    const { userId, atsSystem, passed, notes } = validation.data;

    // Update or create feedback document with ATS pass info
    const feedback = await Feedback.findOneAndUpdate(
      { userId },
      {
        $addToSet: { atsSystems: atsSystem },
        $push: {
          atsPassDetails: {
            system: atsSystem,
            passed,
            notes: notes || ''
          }
        }
      },
      { upsert: true, new: true, lean: true }
    );

    res.json({
      status: 'recorded',
      message: `ATS pass ${passed ? 'recorded' : 'failed'} for ${atsSystem}`,
      feedback: {
        userId: feedback.userId,
        atsSystems: feedback.atsSystems,
        atsPassDetails: feedback.atsPassDetails
      },
      requestId: req.requestId
    });
  } catch (error) {
    console.error(`[${req.requestId}] ATS pass tracking error:`, error);
    res.status(500).json({
      error: 'Failed to record ATS pass',
      message: error.message,
      requestId: req.requestId
    });
  }
});

/**
 * GET /api/stats
 * Simple aggregated statistics dashboard
 */
router.get('/stats', async (req, res) => {
  try {
    // Aggregate usage logs
    const usageStats = await UsageLog.aggregate([
      {
        $group: {
          _id: '$success',
          count: { $sum: 1 }
        }
      }
    ]);

    let totalGenerations = 0;
    let successfulGenerations = 0;
    let failedGenerations = 0;

    usageStats.forEach(stat => {
      totalGenerations += stat.count;
      if (stat._id === true) {
        successfulGenerations = stat.count;
      } else {
        failedGenerations = stat.count;
      }
    });

    // Aggregate feedback
    const feedbackStats = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalFeedbackCount: { $sum: 1 }
        }
      }
    ]);

    let averageRating = 0;
    let totalFeedbackCount = 0;

    if (feedbackStats.length > 0) {
      averageRating = Math.round(feedbackStats[0].averageRating * 100) / 100;
      totalFeedbackCount = feedbackStats[0].totalFeedbackCount;
    }

    // Count unique users
    const uniqueUsers = await UsageLog.distinct('userId').then(users => users.length);

    // ATS Pass Statistics
    const atsPassStats = await Feedback.aggregate([
      { $unwind: '$atsPassDetails' },
      {
        $group: {
          _id: { system: '$atsPassDetails.system', passed: '$atsPassDetails.passed' },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.system',
          passed: { $sum: { $cond: ['$_id.passed', '$count', 0] } },
          failed: { $sum: { $cond: ['$_id.passed', 0, '$count'] } },
          total: { $sum: '$count' }
        }
      },
      {
        $project: {
          _id: 0,
          system: '$_id',
          passed: 1,
          failed: 1,
          total: 1,
          passRate: { $cond: [{ $gt: ['$total', 0] }, { $round: [{ $multiply: [{ $divide: ['$passed', '$total'] }, 100] }, 2] }, 0] }
        }
      },
      { $sort: { total: -1 } }
    ]);

    // Overall ATS stats
    const overallATS = await Feedback.aggregate([
      { $unwind: '$atsPassDetails' },
      {
        $group: {
          _id: null,
          totalAttempts: { $sum: 1 },
          totalPassed: { $sum: { $cond: ['$atsPassDetails.passed', 1, 0] } },
          uniqueSystems: { $addToSet: '$atsPassDetails.system' },
          uniqueUsersWithATS: { $addToSet: '$userId' }
        }
      }
    ]);

    let atsSummary = { totalAttempts: 0, totalPassed: 0, overallPassRate: 0, uniqueSystems: 0, uniqueUsersWithATS: 0 };
    if (overallATS.length > 0) {
      const o = overallATS[0];
      atsSummary = {
        totalAttempts: o.totalAttempts,
        totalPassed: o.totalPassed,
        overallPassRate: Math.round((o.totalPassed / o.totalAttempts) * 10000) / 100,
        uniqueSystems: o.uniqueSystems.length,
        uniqueUsersWithATS: o.uniqueUsersWithATS.length
      };
    }

    res.json({
      totalGenerations,
      successfulGenerations,
      failedGenerations,
      averageRating,
      totalFeedbackCount,
      uniqueUsers,
      ats: {
        summary: atsSummary,
        bySystem: atsPassStats
      },
      requestId: req.requestId
    });
  } catch (error) {
    console.error(`[${req.requestId}] Stats error:`, error);
    res.status(500).json({
      error: 'Failed to retrieve stats',
      message: error.message,
      requestId: req.requestId
    });
  }
});

/**
 * GET /api/health
 * Health check endpoint (no auth required)
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', requestId: req.requestId });
});

module.exports = router;