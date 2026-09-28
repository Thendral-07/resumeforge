/**
 * Test new API endpoints (requires MongoDB to be running)
 * This test shows the expected API request/response structure
 */

const { computeDiff, generateDiffSummary } = require('./src/utils/diff');
const { analyzeKeywords } = require('./src/utils/keywordOptimizer');
const { validateCompareVersions, validateOptimizeKeywords, validateATSPass, ATS_SYSTEMS } = require('./src/utils/validator');

console.log('=== ResumeForge New Features API Test ===\n');

// Test 1: Version Comparison Diff Logic
console.log('1. VERSION COMPARISON DIFF LOGIC');
console.log('-----------------------------------');

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

console.log('Version 1:', JSON.stringify(v1, null, 2).substring(0, 200) + '...');
console.log('Version 2:', JSON.stringify(v2, null, 2).substring(0, 200) + '...');
console.log('\nDiff Result:');
console.log('  Summary:', summary);
console.log('  Added:', diff.added.length, 'items');
console.log('  Removed:', diff.removed.length, 'items');
console.log('  Modified:', diff.modified.length, 'items');
console.log('  Unchanged:', diff.unchanged.length, 'items');
console.log('\nModified paths:', diff.modified.map(m => m.path));
console.log('Sample modified detail:', JSON.stringify(diff.modified[0], null, 2));

// Test 2: Keyword Optimization
console.log('\n\n2. KEYWORD OPTIMIZATION ANALYSIS');
console.log('--------------------------------');

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

console.log('Resume Skills:', resumeData.skills);
console.log('Job Description length:', jobDescription.length, 'chars');
console.log('\nAnalysis Result:');
console.log('  Match Score:', analysis.score + '%');
console.log('  Total Job Keywords:', analysis.summary.totalJobKeywords);
console.log('  Matched:', analysis.summary.matchedCount);
console.log('  Missing:', analysis.summary.missingCount);
console.log('\nTop 10 Matched:', analysis.matched.slice(0, 10));
console.log('\nTop 10 Missing:', analysis.missing.slice(0, 10));
console.log('\nTop 5 Suggestions:');
analysis.suggestions.slice(0, 5).forEach((s, i) => {
  console.log(`  ${i+1}. ${s.keyword} (${s.category}) - ${s.suggestion}`);
});

// Test 3: ATS Pass Tracking Validation
console.log('\n\n3. ATS PASS TRACKING VALIDATION');
console.log('-------------------------------');

const testCases = [
  { input: { userId: 'user123', atsSystem: 'workday', passed: true, notes: 'Passed!' }, expected: true, desc: 'Valid workday pass' },
  { input: { userId: 'user123', atsSystem: 'greenhouse', passed: false }, expected: true, desc: 'Valid greenhouse fail' },
  { input: { userId: 'user123', atsSystem: 'invalid', passed: true }, expected: false, desc: 'Invalid ATS system' },
  { input: { userId: 'user123', atsSystem: 'lever' }, expected: false, desc: 'Missing passed field' },
  { input: { atsSystem: 'workday', passed: true }, expected: false, desc: 'Missing userId' },
];

testCases.forEach(({ input, expected, desc }) => {
  const result = validateATSPass(input);
  const status = result.success === expected ? '✓ PASS' : '✗ FAIL';
  console.log(`  ${status} - ${desc}: ${result.success ? 'valid' : 'invalid'}`);
  if (!result.success && result.errors) {
    console.log('    Errors:', result.errors.map(e => `${e.field}: ${e.message}`).join(', '));
  }
});

console.log('\nAvailable ATS Systems:', ATS_SYSTEMS.join(', '));

// Test 4: Validation Schemas
console.log('\n\n4. VALIDATION SCHEMAS');
console.log('---------------------');

const compareTest = validateCompareVersions({ userId: 'user123', versionId1: 'abc', versionId2: 'def' });
console.log('  Compare versions (valid):', compareTest.success ? '✓ PASS' : '✗ FAIL');

const compareTest2 = validateCompareVersions({ userId: 'user123', versionId1: 'abc' });
console.log('  Compare versions (missing v2):', !compareTest2.success ? '✓ PASS' : '✗ FAIL');

const optTest = validateOptimizeKeywords({
  userId: 'user123',
  templateStyle: 'ats-safe',
  name: 'Test',
  contact: { email: 'test@test.com', phone: '123', location: 'NYC', linkedin: 'https://linkedin.com/in/test' },
  summary: 'Test summary',
  experience: [{ title: 'Dev', company: 'Co', dates: '2020', bullets: ['Did stuff'] }],
  education: [{ degree: 'BS', institution: 'Uni', dates: '2016-2020' }],
  skills: ['JS'],
  jobDescription: 'Looking for React developer with 5 years experience.'
});
console.log('  Optimize keywords (valid):', optTest.success ? '✓ PASS' : '✗ FAIL');
if (!optTest.success) console.log('   Errors:', optTest.errors);

const optTest2 = validateOptimizeKeywords({
  userId: 'user123',
  templateStyle: 'ats-safe',
  name: 'Test',
  contact: { email: 'test@test.com', phone: '123', location: 'NYC', linkedin: 'https://linkedin.com/in/test' },
  summary: 'Test summary',
  experience: [{ title: 'Dev', company: 'Co', dates: '2020', bullets: ['Did stuff'] }],
  education: [{ degree: 'BS', institution: 'Uni', dates: '2016-2020' }],
  skills: ['JS'],
  jobDescription: 'short'
});
console.log('  Optimize keywords (short job desc):', !optTest2.success ? '✓ PASS' : '✗ FAIL');

console.log('\n=== All API Logic Tests Complete ===');
console.log('\nNote: To test full API endpoints, MongoDB must be running.');
console.log('Run: mongod (or use MongoDB Atlas)');
console.log('Then start server: npm start');
console.log('\nExample API calls:');
console.log('  GET  /api/versions/user123/compare?versionId1=abc&versionId2=def');
console.log('  POST /api/optimize-keywords');
console.log('  POST /api/ats-pass');
console.log('  GET  /api/stats (now includes ATS stats)');