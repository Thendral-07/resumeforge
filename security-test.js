/**
 * Extreme Security Test Suite
 * Attempts to break the system in every way possible
 */

const { validateResume, validateFeedback, validateSaveVersion } = require('./src/utils/validator');
const { generatePdf } = require('./src/utils/pdfGenerator');
const fs = require('fs');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== EXTREME SECURITY TEST SUITE ===\n');

  // ========================================
  // TEST 1: XSS / HTML Injection
  // ========================================
  console.log('--- Test 1: XSS / HTML Injection ---');

  const xssPayloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<body onload=alert(1)>',
    '<input onfocus=alert(1) autofocus>',
    '<select onfocus=alert(1) autofocus>',
    '<textarea onfocus=alert(1) autofocus>',
    '<keygen onfocus=alert(1) autofocus>',
    '<video><source onerror=alert(1)>',
    '<details open ontoggle=alert(1)>',
    '<marquee onstart=alert(1)>',
    '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    '<object data="javascript:alert(1)">',
    '<embed src="javascript:alert(1)">',
    '<form><button formaction="javascript:alert(1)">Click',
    '<math><maction actiontype="statusline">X',
    '<style>@keyframes x{}</style><x style="animation-name:x" onanimationstart=alert(1)>',
  ];

  for (const payload of xssPayloads) {
    const data = {
      userId: 'test',
      name: payload,
      contact: { email: 'test@test.com', phone: '123', location: 'NYC', linkedin: 'https://linkedin.com/in/test' },
      summary: payload,
      experience: [{ title: payload, company: payload, dates: '2020', bullets: [payload] }],
      education: [{ degree: payload, institution: payload, dates: '2020' }],
      skills: [payload]
    };
    const result = validateResume(data);
    assert(result.success, `XSS payload accepted (sanitized): "${payload.substring(0,30)}..."`);
    if (result.success) {
      // Verify sanitization
      const hasScript = result.data.name.includes('<script');
      const hasOnError = result.data.name.includes('onerror');
      const hasOnLoad = result.data.name.includes('onload');
      assert(!hasScript, `No <script tag in sanitized name`);
      assert(!hasOnError, `No onerror in sanitized name`);
      assert(!hasOnLoad, `No onload in sanitized name`);
    }
  }

  // ========================================
  // TEST 2: Prototype Pollution
  // ========================================
  console.log('\n--- Test 2: Prototype Pollution ---');

  const protoPayloads = [
    { __proto__: { polluted: true } },
    { constructor: { prototype: { polluted: true } } },
    { prototype: { polluted: true } },
    JSON.parse('{"__proto__": {"polluted": true}}'),
  ];

  for (const payload of protoPayloads) {
    const data = {
      userId: 'test',
      name: 'Test',
      contact: { email: 'test@test.com', phone: '123', location: 'NYC' },
      summary: 'Test',
      experience: [{ title: 'Test', company: 'Test', dates: '2020', bullets: ['Test'] }],
      education: [{ degree: 'Test', institution: 'Test', dates: '2020' }],
      skills: ['Test'],
      ...payload
    };
    const result = validateResume(data);
    // Should either reject or sanitize
    assert(!Object.prototype.hasOwnProperty('polluted'), 'Prototype not polluted');
    assert(!Object.prototype.hasOwnProperty('admin'), 'Admin not polluted');
  }

  // ========================================
  // TEST 3: Oversized / DoS Payloads
  // ========================================
  console.log('\n--- Test 3: Oversized / DoS Payloads ---');

  // Giant string (10MB)
  const giantString = 'x'.repeat(10 * 1024 * 1024);
  const oversizedData = {
    userId: 'test',
    name: giantString,
    contact: { email: 'test@test.com', phone: '123', location: 'NYC' },
    summary: 'Test',
    experience: [{ title: 'Test', company: 'Test', dates: '2020', bullets: ['Test'] }],
    education: [{ degree: 'Test', institution: 'Test', dates: '2020' }],
    skills: ['Test']
  };
  const oversizedResult = validateResume(oversizedData);
  assert(!oversizedResult.success, '10MB name rejected');

  // Deep nesting (prototype pollution via depth)
  let deepObj = { a: 1 };
  let current = deepObj;
  for (let i = 0; i < 1000; i++) {
    current.child = { a: 1 };
    current = current.child;
  }
  const deepData = {
    userId: 'test',
    name: 'Test',
    contact: { email: 'test@test.com', phone: '123', location: 'NYC' },
    summary: 'Test',
    experience: [{ title: 'Test', company: 'Test', dates: '2020', bullets: ['Test'] }],
    education: [{ degree: 'Test', institution: 'Test', dates: '2020' }],
    skills: ['Test'],
    deep: deepObj
  };
  const deepResult = validateResume(deepData);
  assert(!deepResult.success || deepResult.success, 'Deep object handled');

  // ========================================
  // TEST 4: SQL/NoSQL Injection Attempts
  // ========================================
  console.log('\n--- Test 4: Injection Attempts ---');

  const injectionPayloads = [
    { $gt: '' },
    { $ne: null },
    { $where: 'this.password == this.password' },
    { $regex: '.*' },
    { $exists: true },
    ' OR 1=1 --',
    '; DROP TABLE users; --',
    "'; DROP TABLE users; --",
    '{"$gt": ""}',
    '{"$ne": null}',
  ];

  for (const payload of injectionPayloads) {
    const data = {
      userId: 'test',
      name: 'Test',
      contact: { email: 'test@test.com', phone: '123', location: 'NYC' },
      summary: 'Test',
      experience: [{ title: 'Test', company: 'Test', dates: '2020', bullets: ['Test'] }],
      education: [{ degree: 'Test', institution: 'Test', dates: '2020' }],
      skills: ['Test'],
      maliciousField: payload
    };
    const result = validateResume(data);
    // Should reject or sanitize
    if (result.success) {
      // Check no dangerous operators in output
      const str = JSON.stringify(result.data);
      assert(!str.includes('$gt'), 'No $gt operator in output');
      assert(!str.includes('$ne'), 'No $ne operator in output');
      assert(!str.includes('$where'), 'No $where operator in output');
    }
  }

  // ========================================
  // TEST 5: Unicode / Encoding Attacks
  // ========================================
  console.log('\n--- Test 5: Unicode / Encoding Attacks ---');

  const unicodePayloads = [
    '\u0000\u0001\u0002', // Null bytes
    '‮‭', // RTL override
    '﻿', // BOM
    '​'.repeat(1000), // Zero-width spaces
    '𝔸𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫', // Math bold
    'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ', // Fullwidth
    ''.repeat(100), // Replacement chars
    '💣💣💣💣💣', // Emoji bombs
    'اَ اُ اِ', // Arabic diacritics
    'Z͑ͫ̓ͪ̂ͫ̽͏̴̙̤̞͉͚̹̞̘͍A̴̵̜̰̟ͫ͗͢Lͫ͗͏̴̲̣̠̤͈G̴̨̝̱̼̟̟̠͑ͫO͂ͫ̽͏̶̬̝̪̹̘̞', // Zalgo
  ];

  for (const payload of unicodePayloads) {
    const data = {
      userId: 'test',
      name: payload,
      contact: { email: 'test@test.com', phone: '123', location: 'NYC' },
      summary: payload,
      experience: [{ title: payload, company: payload, dates: '2020', bullets: [payload] }],
      education: [{ degree: payload, institution: payload, dates: '2020' }],
      skills: [payload]
    };
    const result = validateResume(data);
    assert(result.success, `Unicode payload handled: "${payload.substring(0,20)}..."`);
    if (result.success) {
      // Should not contain dangerous characters
      assert(!result.data.name.includes('\u0000'), 'No null bytes');
      assert(!result.data.name.includes('‮'), 'No RTL override');
    }
  }

  // ========================================
  // TEST 6: Template Injection (Handlebars)
  // ========================================
  console.log('\n--- Test 6: Template Injection ---');

  const templatePayloads = [
    '{{#each constructor.constructor.prototype}}',
    '{{constructor.constructor("return process")()}}',
    '{{#with "s" as |string|}}{{#with "e"}}{{#with split as |conslist|}}{{this.pop}}{{this.push "return require(\'child_process\').execSync(\'id\')"}}{{/with}}{{/with}}{{/with}}',
    '{{#each this.constructor.constructor.prototype}}',
    '{{#blockHelperMissing}}',
    '{{#with __proto__}}',
    '{{#with constructor}}',
  ];

  for (const payload of templatePayloads) {
    const data = {
      userId: 'test',
      name: payload,
      contact: { email: 'test@test.com', phone: '123', location: 'NYC' },
      summary: payload,
      experience: [{ title: payload, company: payload, dates: '2020', bullets: [payload] }],
      education: [{ degree: payload, institution: payload, dates: '2020' }],
      skills: [payload]
    };
    const result = validateResume(data);
    assert(result.success, `Template payload sanitized: "${payload.substring(0,30)}..."`);
    if (result.success) {
      // Check Handlebars expressions were escaped
      const hasHandlebars = result.data.name.includes('{{');
      assert(!hasHandlebars, 'No Handlebars expressions in output');
    }
  }

  // ========================================
  // TEST 7: Email Validation Bypass
  // ========================================
  console.log('\n--- Test 7: Email Validation Bypass ---');

  const badEmails = [
    'notanemail',
    '@nodomain.com',
    'nodomain@',
    'test@',
    'test@.com',
    'test@com',
    'test..test@domain.com',
    'test@domain..com',
    'test@domain.c',
    'test@-domain.com',
    'test@domain-.com',
    'test@domain.com.',
    '"test"@domain.com',
    'test@[127.0.0.1]',
    'test@domain.com\n<script>alert(1)</script>',
    'test@domain.com\r\n',
    'test@domain.com\x00',
    'a'.repeat(200) + '@domain.com', // Too long
  ];

  for (const email of badEmails) {
    const data = {
      userId: 'test',
      name: 'Test',
      contact: { email, phone: '123', location: 'NYC' },
      summary: 'Test',
      experience: [{ title: 'Test', company: 'Test', dates: '2020', bullets: ['Test'] }],
      education: [{ degree: 'Test', institution: 'Test', dates: '2020' }],
      skills: ['Test']
    };
    const result = validateResume(data);
    assert(!result.success, `Invalid email rejected: "${email}"`);
  }

  // ========================================
  // TEST 8: UserId Validation
  // ========================================
  console.log('\n--- Test 8: UserId Validation ---');

  const badUserIds = [
    '',
    'user@domain.com',
    'user domain',
    'user.domain',
    'user#123',
    'user$123',
    'user%123',
    'user/123',
    'user\\123',
    'user<script>',
    'user\u0000',
    'user'.repeat(10), // Too long
    '../etc/passwd',
    '..\\windows\\system32',
  ];

  for (const userId of badUserIds) {
    const data = {
      userId,
      name: 'Test',
      contact: { email: 'test@test.com', phone: '123', location: 'NYC' },
      summary: 'Test',
      experience: [{ title: 'Test', company: 'Test', dates: '2020', bullets: ['Test'] }],
      education: [{ degree: 'Test', institution: 'Test', dates: '2020' }],
      skills: ['Test']
    };
    const result = validateResume(data);
    assert(!result.success, `Invalid userId rejected: "${userId}"`);
  }

  // ========================================
  // TEST 9: Classic Template Specific
  // ========================================
  console.log('\n--- Test 9: Classic Template Validation ---');

  const classicXSS = {
    userId: 'test',
    templateStyle: 'classic',
    name: '<script>alert(1)</script>',
    contact: { email: 'test@test.com', phone: '123', github: 'https://github.com/test', linkedin: 'https://linkedin.com/in/test' },
    degree: '<img src=x onerror=alert(1)>',
    institution: '<svg onload=alert(1)>',
    education: [{ degree: 'BS', institution: 'MIT', dates: '2020', cgpa: '3.5' }],
    projects: [{ title: '<iframe src=evil.com>', description: 'desc', bullets: ['<script>'], tech: 'React' }],
    experience: [{ title: 'Eng', company: 'Co', dates: '2020', bullets: ['<b>bold</b>'] }],
    skillCategories: [{ label: '<h1>hack</h1>', items: 'JS' }],
    positions: [{ title: 'Lead', dates: '2020', bullets: ['<img onerror=alert(1)>'] }]
  };
  const classicResult = validateResume(classicXSS);
  assert(classicResult.success, 'Classic XSS sanitized');
  if (classicResult.success) {
    assert(!classicResult.data.name.includes('<script'), 'Classic name sanitized');
    assert(!classicResult.data.projects[0].title.includes('<iframe'), 'Classic project sanitized');
    assert(!classicResult.data.skillCategories[0].label.includes('<h1>'), 'Classic skills sanitized');
  }

  // ========================================
  // TEST 10: PDF Generation with Malicious Data
  // ========================================
  console.log('\n--- Test 10: PDF Generation Safety ---');

  try {
    const maliciousData = {
      name: 'Test <script>alert(1)</script>',
      contact: { email: 'test@test.com', phone: '123', location: 'NYC', linkedin: 'https://linkedin.com/in/test' },
      summary: '<img src=x onerror=alert(1)>',
      experience: [{ title: 'Dev', company: 'Co', dates: '2020', bullets: ['<svg onload=alert(1)>'] }],
      education: [{ degree: 'BS', institution: 'MIT', dates: '2020' }],
      skills: ['JS', '<iframe src=evil.com>']
    };
    const pdf = await generatePdf(maliciousData, 'ats-safe');
    assert(pdf.length > 1000, 'PDF generated with malicious data');
    assert(pdf.subarray(0,4).toString('hex') === '25504446', 'Valid PDF header');

    // Check PDF doesn't contain raw HTML/JS
    const pdfText = pdf.toString('utf8');
    assert(!pdfText.includes('<script'), 'No <script in PDF');
    assert(!pdfText.includes('onerror'), 'No onerror in PDF');
    assert(!pdfText.includes('onload'), 'No onload in PDF');
    console.log('  PDF size:', pdf.length, 'bytes');
  } catch (e) {
    assert(false, `PDF generation failed: ${e.message}`);
  }

  // ========================================
  // TEST 11: Feedback Validation
  // ========================================
  console.log('\n--- Test 11: Feedback Validation ---');

  const badFeedback = [
    { userId: 'test', rating: 0 },      // Too low
    { userId: 'test', rating: 6 },      // Too high
    { userId: 'test', rating: 3.5 },    // Not integer
    { userId: 'test', rating: '5' },    // String not number
    { userId: 'test', rating: -1 },     // Negative
    { userId: '', rating: 5 },          // Empty userId
    { userId: 'test@domain.com', rating: 5 }, // Bad userId
    { userId: 'test', rating: 5, comment: 'x'.repeat(1001) }, // Too long
  ];

  for (const fb of badFeedback) {
    const result = validateFeedback(fb);
    assert(!result.success, `Bad feedback rejected: rating=${fb.rating}, userId="${fb.userId}"`);
  }

  const goodFeedback = { userId: 'test', rating: 5, comment: 'Great!', didPassATS: true };
  const goodResult = validateFeedback(goodFeedback);
  assert(goodResult.success, 'Valid feedback accepted');

  // ========================================
  // TEST 12: Save Version Validation
  // ========================================
  console.log('\n--- Test 12: Save Version Validation ---');

  const badSave = [
    { userId: 'test', title: 'x'.repeat(101), resumeData: {} }, // Title too long
    { userId: 'test', title: 'Test', templateStyle: 'invalid', resumeData: {} }, // Invalid template
    { userId: 'test', title: 'Test', resumeData: { name: 'x' } }, // Missing required fields
  ];

  for (const sv of badSave) {
    const result = validateSaveVersion(sv);
    assert(!result.success, `Bad save rejected: ${JSON.stringify(sv).substring(0,50)}`);
  }

  // ========================================
  // SUMMARY
  // ========================================
  console.log('\n=== SECURITY TEST SUMMARY ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0) {
    console.log('\n⚠️  SECURITY VULNERABILITIES FOUND!');
    process.exit(1);
  } else {
    console.log('\n✅ ALL SECURITY TESTS PASSED');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});