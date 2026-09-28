/**
 * ATS Keyword Optimizer
 * Analyzes resume against job descriptions to suggest ATS-friendly keywords
 */

const nlp = require('compromise');

/**
 * Common tech keywords for better extraction
 */
const TECH_KEYWORDS = [
  // Languages
  'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin',
  // Frontend
  'react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt', 'html', 'css', 'sass', 'tailwind', 'webpack', 'vite',
  // Backend
  'node.js', 'express', 'nestjs', 'django', 'flask', 'spring', 'rails', 'laravel', 'asp.net',
  // Databases
  'postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'dynamodb', 'cassandra', 'sqlite',
  // Cloud/DevOps
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'github actions', 'gitlab ci',
  // Tools
  'git', 'jira', 'confluence', 'figma', 'postman', 'datadog', 'new relic', 'sentry',
  // Methodologies
  'agile', 'scrum', 'kanban', 'tdd', 'bdd', 'ci/cd', 'microservices', 'serverless'
];

const SOFT_SKILLS = [
  'leadership', 'communication', 'teamwork', 'problem solving', 'critical thinking',
  'adaptability', 'time management', 'mentoring', 'collaboration', 'project management'
];

/**
 * Extract structured keywords from text using NLP
 * @param {string} text - Input text (job description or resume)
 * @returns {object} Extracted keywords by category
 */
function extractKeywords(text) {
  const doc = nlp(text.toLowerCase());

  // Extract nouns (skills, technologies)
  const nouns = doc.nouns().out('array');

  // Extract verbs (actions)
  const verbs = doc.verbs().out('array');

  // Match known tech terms
  const foundTech = TECH_KEYWORDS.filter(tech =>
    text.toLowerCase().includes(tech.toLowerCase())
  );

  // Match soft skills
  const foundSoftSkills = SOFT_SKILLS.filter(skill =>
    text.toLowerCase().includes(skill.toLowerCase())
  );

  // Extract multi-word phrases (bigrams/trigrams)
  const phrases = extractPhrases(doc);

  return {
    skills: [...new Set([...nouns, ...foundTech])].slice(0, 50),
    verbs: [...new Set(verbs)].slice(0, 30),
    technologies: foundTech,
    softSkills: foundSoftSkills,
    phrases: phrases.slice(0, 20)
  };
}

/**
 * Extract meaningful phrases (2-3 words) from document
 */
function extractPhrases(doc) {
  const phrases = [];

  // Get noun phrases
  const nounPhrases = doc.match('#Noun+').out('array');
  phrases.push(...nounPhrases);

  // Get verb + noun combinations
  const verbNoun = doc.match('#Verb #Noun+').out('array');
  phrases.push(...verbNoun);

  // Get adjective + noun
  const adjNoun = doc.match('#Adjective #Noun+').out('array');
  phrases.push(...adjNoun);

  return [...new Set(phrases)]
    .filter(p => p.length > 3 && p.split(' ').length <= 3)
    .slice(0, 30);
}

/**
 * Flatten resume data into searchable text
 * @param {object} resumeData - Resume object
 * @returns {string} Combined text from all resume sections
 */
function flattenResume(resumeData) {
  const parts = [];

  if (resumeData.summary) parts.push(resumeData.summary);

  if (resumeData.experience) {
    resumeData.experience.forEach(job => {
      if (job.title) parts.push(job.title);
      if (job.company) parts.push(job.company);
      if (job.bullets) parts.push(...job.bullets);
    });
  }

  if (resumeData.education) {
    resumeData.education.forEach(edu => {
      if (edu.degree) parts.push(edu.degree);
      if (edu.institution) parts.push(edu.institution);
    });
  }

  if (resumeData.skills) parts.push(...resumeData.skills);

  if (resumeData.projects) {
    resumeData.projects.forEach(proj => {
      if (proj.title) parts.push(proj.title);
      if (proj.description) parts.push(proj.description);
      if (proj.bullets) parts.push(...proj.bullets);
      if (proj.tech) parts.push(proj.tech);
    });
  }

  if (resumeData.skillCategories) {
    resumeData.skillCategories.forEach(cat => {
      if (cat.label) parts.push(cat.label);
      if (cat.items) parts.push(cat.items);
    });
  }

  if (resumeData.positions) {
    resumeData.positions.forEach(pos => {
      if (pos.title) parts.push(pos.title);
      if (pos.bullets) parts.push(...pos.bullets);
    });
  }

  return parts.join(' ');
}

/**
 * Calculate match score between resume and job keywords
 */
function calculateMatchScore(resumeKeywords, jobKeywords) {
  const resumeTerms = new Set([
    ...resumeKeywords.skills,
    ...resumeKeywords.technologies,
    ...resumeKeywords.softSkills,
    ...resumeKeywords.phrases
  ]);

  const jobTerms = new Set([
    ...jobKeywords.skills,
    ...jobKeywords.technologies,
    ...jobKeywords.softSkills,
    ...jobKeywords.phrases
  ]);

  if (jobTerms.size === 0) return 0;

  let matches = 0;
  for (const term of jobTerms) {
    if (resumeTerms.has(term)) matches++;
  }

  return Math.round((matches / jobTerms.size) * 100);
}

/**
 * Find intersection of two arrays
 */
function intersect(arr1, arr2) {
  const set2 = new Set(arr2);
  return [...new Set(arr1)].filter(x => set2.has(x));
}

/**
 * Find difference (in arr1 but not in arr2)
 */
function difference(arr1, arr2) {
  const set2 = new Set(arr2);
  return [...new Set(arr1)].filter(x => !set2.has(x));
}

/**
 * Generate actionable suggestions for missing keywords
 */
function generateSuggestions(missingKeywords, resumeKeywords, jobKeywords) {
  const suggestions = [];

  for (const keyword of missingKeywords) {
    // Categorize the missing keyword
    let category = 'skill';
    if (TECH_KEYWORDS.includes(keyword.toLowerCase())) category = 'technology';
    else if (SOFT_SKILLS.includes(keyword.toLowerCase())) category = 'soft skill';

    // Suggest where to add it
    let whereToAdd = 'skills section';
    if (category === 'technology') whereToAdd = 'skills or projects section';
    else if (category === 'soft skill') whereToAdd = 'summary or experience bullets';

    suggestions.push({
      keyword,
      category,
      priority: calculatePriority(keyword, jobKeywords),
      suggestion: `Add "${keyword}" to your ${whereToAdd}`,
      whereToAdd
    });
  }

  // Sort by priority
  return suggestions.sort((a, b) => b.priority - a.priority);
}

/**
 * Calculate priority of a missing keyword
 */
function calculatePriority(keyword, jobKeywords) {
  // Higher priority for tech keywords, phrases, and frequent terms
  let priority = 1;

  if (TECH_KEYWORDS.includes(keyword.toLowerCase())) priority += 3;
  if (SOFT_SKILLS.includes(keyword.toLowerCase())) priority += 1;
  if (keyword.split(' ').length > 1) priority += 2; // Phrases are more specific

  return priority;
}

/**
 * Main analysis function
 * @param {object} resumeData - Resume data object
 * @param {string} jobDescription - Job description text
 * @returns {object} Analysis results
 */
function analyzeKeywords(resumeData, jobDescription) {
  // Extract keywords from both
  const resumeText = flattenResume(resumeData);
  const resumeKeywords = extractKeywords(resumeText);
  const jobKeywords = extractKeywords(jobDescription);

  // Combine all job terms for comparison
  const allJobTerms = [
    ...jobKeywords.skills,
    ...jobKeywords.technologies,
    ...jobKeywords.softSkills,
    ...jobKeywords.phrases
  ];

  // Combine all resume terms
  const allResumeTerms = [
    ...resumeKeywords.skills,
    ...resumeKeywords.technologies,
    ...resumeKeywords.softSkills,
    ...resumeKeywords.phrases
  ];

  // Find matches and gaps
  const matched = intersect(allResumeTerms, allJobTerms);
  const missing = difference(allJobTerms, allResumeTerms);

  // Generate suggestions
  const suggestions = generateSuggestions(missing, resumeKeywords, jobKeywords);

  // Calculate score
  const score = calculateMatchScore(resumeKeywords, jobKeywords);

  return {
    score,
    matched: matched.slice(0, 30),
    missing: missing.slice(0, 30),
    suggestions: suggestions.slice(0, 15),
    resumeKeywords: {
      skills: resumeKeywords.skills.slice(0, 20),
      technologies: resumeKeywords.technologies,
      softSkills: resumeKeywords.softSkills
    },
    jobKeywords: {
      skills: jobKeywords.skills.slice(0, 20),
      technologies: jobKeywords.technologies,
      softSkills: jobKeywords.softSkills,
      phrases: jobKeywords.phrases
    },
    summary: {
      totalJobKeywords: allJobTerms.length,
      matchedCount: matched.length,
      missingCount: missing.length,
      matchPercentage: score
    }
  };
}

module.exports = {
  extractKeywords,
  flattenResume,
  analyzeKeywords,
  calculateMatchScore,
  TECH_KEYWORDS,
  SOFT_SKILLS
};