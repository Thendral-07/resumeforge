/**
 * Test new features: version comparison, keyword optimization, ATS pass tracking
 */

const { validateCompareVersions, validateOptimizeKeywords, validateATSPass, ATS_SYSTEMS } = require('./src/utils/validator');
const { computeDiff, generateDiffSummary } = require('./src/utils/diff');
const { analyzeKeywords } = require('./src/utils/keywordOptimizer');

async function testVersionComparison() {
  console.log('\n=== Test: Version Comparison ===\n');

  const v1 = {
    name: 'John Doe',
    summary: 'Senior software engineer with 8+ years experience.',
    experience: [
      { title: 'Senior Engineer', company: 'TechCorp', dates: '2020-Present', bullets: ['Led migration to microservices'] }
    ],
    skills: ['JavaScript', 'Node.js', 'React']
  };

  const v2 = {
    name: 'John Doe',
    summary: 'Senior software engineer with 10+ years experience building scalable systems.',
    experience: [
      { title: 'Senior Engineer', company: 'TechCorp', dates: '2020-Present', bullets: ['Led migration to microservices', 'Reduced latency by 40%'] },
      { title: 'Junior Engineer', company: 'StartupInc', dates: '2018-2020', bullets: ['Built REST APIs'] }
    ],
    skills: ['JavaScript', 'TypeScript', 'Node.js', 'React', 'AWS']
  };

  const diff = computeDiff(v1, v2);
  const summary = generateDiffSummary(diff);

  console.log('Diff Summary:', summary);
  console.log('Added:', diff.added.map(d => d.path));
  console.log('Removed:', diff.removed.map(d => d.path));
  console.log('Modified:', diff.modified.map(d => d.path));
  console.log('Unchanged count:', diff.unchanged.length);

  // Test validation
  const validInput = { userId: 'user123', versionId1: 'abc123', versionId2: 'def456' };
  const validation = validateCompareVersions(validInput);
  console.log('Validation (valid):', validation.success ? 'PASS' : 'FAIL');

  const invalidInput = { userId: 'user123', versionId1: 'abc123' };
  const invalidValidation = validateCompareVersions(invalidInput);
  console.log('Validation (missing versionId2):', !invalidValidation.success ? 'PASS' : 'FAIL');
}

async function testKeywordOptimization() {
  console.log('\n=== Test: Keyword Optimization ===\n');

  const resumeData = {
    name: 'Jane Smith',
    summary: 'Full-stack developer with 5 years experience.',
    experience: [
      { title: 'Software Engineer', company: 'Google', dates: '2019-Present', bullets: ['Built scalable microservices', 'Worked with React and Node.js'] }
    ],
    education: [
      { degree: 'BS Computer Science', institution: 'MIT', dates: '2015-2019' }
    ],
    skills: ['JavaScript', 'React', 'Node.js', 'Python']
  };

  const jobDescription = `
    We are looking for a Senior Full Stack Engineer with strong experience in React, TypeScript, Node.js, and AWS.
    The ideal candidate has experience with microservices architecture, Docker, Kubernetes, and CI/CD pipelines.
    You will be responsible for building scalable web applications, mentoring junior engineers, and leading technical projects.
    Required: 5+ years experience, strong communication skills, problem-solving ability.
    Preferred: GraphQL, PostgreSQL, Redis, Terraform.
  `;

  const analysis = analyzeKeywords(resumeData, jobDescription);

  console.log('Match Score:', analysis.score + '%');
  console.log('Matched Keywords:', analysis.matched);
  console.log('Missing Keywords:', analysis.missing);
  console.log('Suggestions:', analysis.suggestions.map(s => `${s.keyword} (${s.category})`));
  console.log('Summary:', analysis.summary);

  // Test validation - need full ATS-safe resume data
  const validResumeData = {
    userId: 'user123',
    templateStyle: 'ats-safe',
    name: 'Jane Smith',
    contact: {
      email: 'jane@example.com',
      phone: '+1-555-123-4567',
      location: 'San Francisco, CA',
      linkedin: 'https://linkedin.com/in/janesmith'
    },
    summary: 'Full-stack developer with 5 years experience.',
    experience: [
      { title: 'Software Engineer', company: 'Google', dates: '2019-Present', bullets: ['Built scalable microservices', 'Worked with React and Node.js'] }
    ],
    education: [
      { degree: 'BS Computer Science', institution: 'MIT', dates: '2015-2019' }
    ],
    skills: ['JavaScript', 'React', 'Node.js', 'Python']
  };

  const validInput = {
    ...validResumeData,
    jobDescription: 'Looking for React developer with AWS and TypeScript experience. 5 years required.'
  };
  const validation = validateOptimizeKeywords(validInput);
  console.log('Validation (valid):', validation.success ? 'PASS' : 'FAIL');

  const invalidInput = { userId: 'user123', resumeData, jobDescription: 'short' };
  const invalidValidation = validateOptimizeKeywords(invalidInput);
  console.log('Validation (short job desc):', !invalidValidation.success ? 'PASS' : 'FAIL');
}

async function testATSPassTracking() {
  console.log('\n=== Test: ATS Pass Tracking Validation ===\n');

  // Test validation
  const validInput = { userId: 'user123', atsSystem: 'workday', passed: true, notes: 'Passed on first try' };
  const validation = validateATSPass(validInput);
  console.log('Validation (valid):', validation.success ? 'PASS' : 'FAIL');

  const invalidSystem = { userId: 'user123', atsSystem: 'invalid-system', passed: true };
  const invalidValidation = validateATSPass(invalidSystem);
  console.log('Validation (invalid system):', !invalidValidation.success ? 'PASS' : 'FAIL');

  const missingPassed = { userId: 'user123', atsSystem: 'greenhouse' };
  const missingValidation = validateATSPass(missingPassed);
  console.log('Validation (missing passed):', !missingValidation.success ? 'PASS' : 'FAIL');

  console.log('ATS Systems:', ATS_SYSTEMS);
}

async function runAllTests() {
  console.log('=== ResumeForge New Features Test Suite ===');

  try {
    await testVersionComparison();
    await testKeywordOptimization();
    await testATSPassTracking();

    console.log('\n=== All Tests Complete ===');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

runAllTests();