const { z } = require('zod');
const sanitizeHtml = require('sanitize-html');

/**
 * Helper to sanitize string inputs to prevent HTML injection, XSS, and template injection
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;

  // Remove dangerous control characters first
  let sanitized = str
    .replace(/\u0000/g, '')           // Null bytes
    .replace(/[‎‏‪-‮]/g, '') // RTL/LTR override characters
    .replace(/[﻿]/g, '')         // BOM
    .replace(/[​-‏]/g, ''); // Zero-width spaces and format chars

  // Escape Handlebars/Mustache template expressions to prevent SSTI
  sanitized = sanitized
    .replace(/\{\{/g, '&lbrace;&lbrace;')
    .replace(/\}\}/g, '&rbrace;&rbrace;')
    .replace(/\{#/g, '&lbrace;#')
    .replace(/\/}/g, '/&rbrace;')
    .replace(/\{/g, '&lbrace;')
    .replace(/\}/g, '&rbrace;');

  // Then strip all HTML tags and attributes
  sanitized = sanitizeHtml(sanitized, {
    allowedTags: [], // Strip all HTML tags
    allowedAttributes: {}, // Strip all attributes
    disallowedTagsMode: 'recursiveEscape'
  }).trim();

  return sanitized;
}

/**
 * Creates a Zod string schema with pre-processing sanitization and length constraints
 * @param {number} minLength - Minimum length
 * @param {number} maxLength - Maximum length
 * @param {string} minMsg - Minimum length message
 * @param {string} maxMsg - Maximum length message
 * @returns {z.ZodString} Zod string schema
 */
function sanitizedString(minLength = 0, maxLength = Infinity, minMsg = '', maxMsg = '') {
  return z.string().transform(sanitizeString).refine(
    (val) => val.length >= minLength,
    { message: minMsg }
  ).refine(
    (val) => val.length <= maxLength,
    { message: maxMsg }
  );
}

/**
 * Strict email validation regex - RFC 5322 compliant but practical
 */
const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Contact info schema (ATS-safe template)
 */
const contactSchema = z.object({
  email: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.string().regex(emailRegex, 'Invalid email format').max(200, 'Email too long')
  ),
  phone: sanitizedString(1, 30, 'Phone is required', 'Phone number too long'),
  location: sanitizedString(1, 100, 'Location is required', 'Location too long'),
  linkedin: z.string().url('Invalid LinkedIn URL').max(200, 'LinkedIn URL too long').optional().or(z.literal(''))
});

/**
 * Classic template contact fields (github instead of location)
 */
const classicContactSchema = z.object({
  email: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim().toLowerCase() : val),
    z.string().regex(emailRegex, 'Invalid email format').max(200, 'Email too long')
  ),
  phone: sanitizedString(1, 30, 'Phone is required', 'Phone number too long'),
  github: z.string().url('Invalid GitHub URL').max(200, 'GitHub URL too long').optional().or(z.literal('')),
  linkedin: z.string().url('Invalid LinkedIn URL').max(200, 'LinkedIn URL too long').optional().or(z.literal(''))
});

/**
 * Experience item schema (ATS-safe template)
 */
const experienceItemSchema = z.object({
  title: sanitizedString(1, 100, 'Job title is required', 'Title too long'),
  company: sanitizedString(1, 100, 'Company name is required', 'Company too long'),
  dates: sanitizedString(1, 50, 'Dates are required', 'Dates description too long'),
  bullets: z.array(sanitizedString(1, 500, 'Bullet point cannot be empty', 'Bullet point too long'))
    .min(1, 'At least one bullet point is required')
    .max(20, 'Too many bullet points')
});

/**
 * Education item schema (ATS-safe template)
 */
const educationItemSchema = z.object({
  degree: sanitizedString(1, 100, 'Degree is required', 'Degree too long'),
  institution: sanitizedString(1, 100, 'Institution is required', 'Institution too long'),
  dates: sanitizedString(1, 50, 'Dates are required', 'Dates description too long')
});

/**
 * Classic template - Project schema
 */
const projectSchema = z.object({
  title: sanitizedString(1, 100, 'Project title is required', 'Project title too long'),
  description: sanitizedString(1, 300, 'Project description is required', 'Description too long'),
  bullets: z.array(sanitizedString(1, 500, 'Bullet point cannot be empty', 'Bullet point too long'))
    .min(1, 'At least one bullet point is required')
    .max(15, 'Too many project bullets'),
  tech: sanitizedString(1, 200, 'Technology used is required', 'Tech list too long')
});

/**
 * Classic template - Education schema with CGPA
 */
const classicEducationSchema = z.object({
  degree: sanitizedString(1, 100, 'Degree is required', 'Degree too long'),
  institution: sanitizedString(1, 100, 'Institution is required', 'Institution too long'),
  dates: sanitizedString(1, 50, 'Dates are required', 'Dates description too long'),
  cgpa: sanitizedString(1, 20, 'CGPA is required', 'CGPA too long')
});

/**
 * Classic template - Position of Responsibility schema
 */
const positionSchema = z.object({
  title: sanitizedString(1, 100, 'Position title is required', 'Position title too long'),
  dates: sanitizedString(1, 50, 'Dates are required', 'Dates description too long'),
  bullets: z.array(sanitizedString(1, 500, 'Bullet point cannot be empty', 'Bullet point too long'))
    .min(1, 'At least one bullet point is required')
    .max(10, 'Too many position bullets')
});

/**
 * Classic template - Skill Categories schema
 */
const skillCategorySchema = z.object({
  label: sanitizedString(1, 50, 'Category label is required', 'Label too long'),
  items: sanitizedString(1, 500, 'Skill items are required', 'Skill items too long')
});

/**
 * UserId validation - alphanumeric + underscore + hyphen only, max 50 chars
 */
const userIdSchema = z.string()
  .min(1, 'userId is required')
  .max(50, 'userId too long')
  .regex(/^[a-zA-Z0-9_\-]+$/, 'Invalid characters in userId')
  .transform((val) => val.trim()); // Trim whitespace

/**
 * Main resume schema for ATS-safe template (default)
 */
const atsResumeSchema = z.object({
  userId: userIdSchema,
  name: sanitizedString(1, 100, 'Name is required', 'Name too long'),
  contact: contactSchema,
  summary: sanitizedString(1, 2000, 'Summary is required', 'Summary too long'),
  experience: z.array(experienceItemSchema).min(1, 'At least one experience entry is required').max(15, 'Too many experience entries'),
  education: z.array(educationItemSchema).min(1, 'At least one education entry is required').max(10, 'Too many education entries'),
  skills: z.array(sanitizedString(1, 50, 'Skill cannot be empty', 'Skill name too long'))
    .min(1, 'At least one skill is required')
    .max(100, 'Too many skills')
});

/**
 * Classic resume schema
 */
const classicResumeSchema = z.object({
  userId: userIdSchema,
  name: sanitizedString(1, 100, 'Name is required', 'Name too long'),
  contact: classicContactSchema,
  degree: sanitizedString(1, 100, 'Degree is required', 'Degree too long'),
  institution: sanitizedString(1, 100, 'Institution is required', 'Institution too long'),
  education: z.array(classicEducationSchema).min(1, 'At least one education entry is required').max(10, 'Too many education entries'),
  projects: z.array(projectSchema).min(1, 'At least one project is required').max(10, 'Too many projects'),
  experience: z.array(experienceItemSchema).min(1, 'At least one experience entry is required').max(15, 'Too many experience entries'),
  skillCategories: z.array(skillCategorySchema).min(1, 'At least one skill category is required').max(10, 'Too many skill categories'),
  positions: z.array(positionSchema).min(1, 'At least one position is required').max(10, 'Too many positions')
});

/**
 * Combined schema that accepts either template style
 */
const resumeSchema = z.discriminatedUnion('templateStyle', [
  z.object({
    templateStyle: z.literal('ats-safe').optional(),
    ...atsResumeSchema.shape
  }),
  z.object({
    templateStyle: z.literal('classic'),
    ...classicResumeSchema.shape
  })
]);

/**
 * Feedback schema
 */
const feedbackSchema = z.object({
  userId: userIdSchema,
  rating: z.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating cannot exceed 5'),
  comment: sanitizedString(0, 1000, '', 'Comment cannot exceed 1000 characters').optional(),
  didPassATS: z.boolean().optional()
});

/**
 * Save version schema
 */
const saveVersionSchema = z.object({
  userId: userIdSchema,
  title: sanitizedString(1, 100, 'Title is required', 'Title cannot exceed 100 characters'),
  templateStyle: z.enum(['ats-safe', 'classic']).optional(),
  resumeData: z.union([atsResumeSchema.omit({ userId: true }), classicResumeSchema.omit({ userId: true })])
});

/**
 * ATS Systems enum
 */
const ATS_SYSTEMS = [
  'workday', 'greenhouse', 'lever', 'icims', 'taleo',
  'bamboohr', 'jobvite', 'smartrecruiters', 'bullhorn',
  'oracle-taleo', 'successfactors', 'cornerstone', 'other'
];

/**
 * Compare versions schema
 */
const compareVersionsSchema = z.object({
  userId: userIdSchema,
  versionId1: z.string().min(1, 'First version ID is required'),
  versionId2: z.string().min(1, 'Second version ID is required')
});

/**
 * Optimize keywords schema - accepts nested resumeData object
 */
const optimizeKeywordsSchema = z.object({
  userId: userIdSchema,
  jobDescription: sanitizedString(10, 10000, 'Job description is required', 'Job description too long'),
  targetRole: sanitizedString(1, 100, '', 'Target role too long').optional(),
  resumeData: z.discriminatedUnion('templateStyle', [
    z.object({
      templateStyle: z.literal('ats-safe').optional(),
      ...atsResumeSchema.omit({ userId: true }).shape
    }),
    z.object({
      templateStyle: z.literal('classic'),
      ...classicResumeSchema.omit({ userId: true }).shape
    })
  ])
});

/**
 * ATS Pass tracking schema
 */
const atsPassSchema = z.object({
  userId: userIdSchema,
  atsSystem: z.enum(ATS_SYSTEMS),
  passed: z.boolean(),
  notes: sanitizedString(0, 500, '', 'Notes cannot exceed 500 characters').optional()
});

/**
 * Validate resume data for generation
 * @param {object} data - Request body
 * @returns {object} { success: boolean, data?: object, errors?: array }
 */
function validateResume(data) {
  const result = resumeSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));
    return { success: false, errors };
  }

  return { success: true, data: result.data };
}

/**
 * Validate feedback data
 * @param {object} data - Request body
 * @returns {object} { success: boolean, data?: object, errors?: array }
 */
function validateFeedback(data) {
  const result = feedbackSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));
    return { success: false, errors };
  }

  return { success: true, data: result.data };
}

/**
 * Validate save version data
 * @param {object} data - Request body
 * @returns {object} { success: boolean, data?: object, errors?: array }
 */
function validateSaveVersion(data) {
  const result = saveVersionSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));
    return { success: false, errors };
  }

  return { success: true, data: result.data };
}

/**
 * Validate compare versions request
 * @param {object} data - Request body/query
 * @returns {object} { success: boolean, data?: object, errors?: array }
 */
function validateCompareVersions(data) {
  const result = compareVersionsSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));
    return { success: false, errors };
  }

  return { success: true, data: result.data };
}

/**
 * Validate optimize keywords request
 * @param {object} data - Request body
 * @returns {object} { success: boolean, data?: object, errors?: array }
 */
function validateOptimizeKeywords(data) {
  const result = optimizeKeywordsSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));
    return { success: false, errors };
  }

  return { success: true, data: result.data };
}

/**
 * Validate ATS pass tracking request
 * @param {object} data - Request body
 * @returns {object} { success: boolean, data?: object, errors?: array }
 */
function validateATSPass(data) {
  const result = atsPassSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));
    return { success: false, errors };
  }

  return { success: true, data: result.data };
}

module.exports = {
  validateResume,
  validateFeedback,
  validateSaveVersion,
  validateCompareVersions,
  validateOptimizeKeywords,
  validateATSPass,
  resumeSchema,
  feedbackSchema,
  saveVersionSchema,
  compareVersionsSchema,
  optimizeKeywordsSchema,
  atsPassSchema,
  atsResumeSchema,
  classicResumeSchema,
  ATS_SYSTEMS
};