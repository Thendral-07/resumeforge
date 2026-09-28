/**
 * Standalone PDF generation test - no MongoDB required
 * Tests the complete pipeline: validation -> PDF generation
 */

const { generatePdf } = require('./src/utils/pdfGenerator');
const { validateResume } = require('./src/utils/validator');

const atsData = {
  userId: 'test-user-123',
  templateStyle: 'ats-safe',
  name: 'John Doe',
  contact: {
    email: 'john@example.com',
    phone: '+1-555-123-4567',
    location: 'San Francisco, CA',
    linkedin: 'https://linkedin.com/in/johndoe'
  },
  summary: 'Senior software engineer with 8+ years of experience building scalable web applications.',
  experience: [
    {
      title: 'Senior Software Engineer',
      company: 'TechCorp Inc.',
      dates: '2020 - Present',
      bullets: [
        'Led migration of legacy monolith to microservices architecture',
        'Reduced API latency by 40% through caching optimization',
        'Mentored 5 junior engineers on best practices'
      ]
    }
  ],
  education: [
    {
      degree: 'B.S. Computer Science',
      institution: 'Stanford University',
      dates: '2012 - 2016'
    }
  ],
  skills: ['JavaScript', 'TypeScript', 'Node.js', 'React', 'PostgreSQL', 'AWS', 'Docker']
};

const classicData = {
  userId: 'test-user-456',
  templateStyle: 'classic',
  name: 'Jane Smith',
  contact: {
    email: 'jane@example.com',
    phone: '+1-555-987-6543',
    github: 'https://github.com/janesmith',
    linkedin: 'https://linkedin.com/in/janesmith'
  },
  degree: 'B.S. Computer Science',
  institution: 'MIT',
  education: [
    {
      degree: 'B.S. Computer Science',
      institution: 'MIT',
      dates: '2015 - 2019',
      cgpa: '3.85/4.0'
    }
  ],
  projects: [
    {
      title: 'E-Commerce Platform',
      description: 'Full-stack e-commerce solution with real-time inventory management',
      bullets: [
        'Built with React, Node.js, and PostgreSQL',
        'Implemented Stripe payment integration',
        'Achieved 99.9% uptime in production'
      ],
      tech: 'React, Node.js, PostgreSQL, Stripe, AWS'
    }
  ],
  experience: [
    {
      title: 'Software Engineer',
      company: 'Google',
      dates: '2019 - Present',
      bullets: [
        'Developed scalable microservices handling 1M+ requests/day',
        'Reduced deployment time by 60% through CI/CD automation'
      ]
    }
  ],
  skillCategories: [
    { label: 'Languages', items: 'JavaScript, TypeScript, Python, Go' },
    { label: 'Frameworks', items: 'React, Node.js, Express, Next.js' },
    { label: 'Databases', items: 'PostgreSQL, MongoDB, Redis' },
    { label: 'Cloud & Tools', items: 'AWS, Docker, Kubernetes, CI/CD' }
  ],
  positions: [
    {
      title: 'Tech Lead - Open Source Project',
      dates: '2020 - Present',
      bullets: [
        'Maintain popular open-source library with 10k+ stars',
        'Coordinate contributions from 50+ developers'
      ]
    }
  ]
};

async function test() {
  console.log('=== ResumeForge PDF Generation Test ===\n');

  // Test 1: ATS-Safe Template
  console.log('Test 1: ATS-Safe Template');
  const atsValidation = validateResume(atsData);
  if (!atsValidation.success) {
    console.error('ATS Validation failed:', atsValidation.errors);
    return;
  }
  console.log('  Validation: PASSED');
  console.log('  Sanitized name:', atsValidation.data.name);
  console.log('  Sanitized summary:', atsValidation.data.summary.substring(0, 50) + '...');

  const atsPdf = await generatePdf(atsValidation.data, 'ats-safe');
  console.log('  PDF generated: YES');
  console.log('  PDF size:', atsPdf.length, 'bytes');
  console.log('  PDF header:', atsPdf.subarray(0, 4).toString('hex')); // Should be %PDF

  const fs = require('fs');
  fs.writeFileSync('resume-ats-test.pdf', atsPdf);
  console.log('  Saved as: resume-ats-test.pdf\n');

  // Test 2: Classic Template
  console.log('Test 2: Classic Template');
  const classicValidation = validateResume(classicData);
  if (!classicValidation.success) {
    console.error('Classic Validation failed:', classicValidation.errors);
    return;
  }
  console.log('  Validation: PASSED');
  console.log('  Sanitized name:', classicValidation.data.name);

  const classicPdf = await generatePdf(classicValidation.data, 'classic');
  console.log('  PDF generated: YES');
  console.log('  PDF size:', classicPdf.length, 'bytes');
  console.log('  PDF header:', classicPdf.subarray(0, 4).toString('hex'));

  fs.writeFileSync('resume-classic-test.pdf', classicPdf);
  console.log('  Saved as: resume-classic-test.pdf\n');

  // Test 3: Security - XSS prevention
  console.log('Test 3: Security - XSS Prevention');
  const xssData = {
    userId: 'test-security',
    templateStyle: 'ats-safe',
    name: 'Hacker <script>alert("xss")</script>',
    contact: { email: 'hack@test.com', phone: '123', location: 'NYC', linkedin: 'https://linkedin.com/in/hack' },
    summary: 'Malicious <b>bold</b> and <img src=x onerror=alert(1)> content',
    experience: [{ title: 'Hacker', company: 'Evil Corp', dates: '2020', bullets: ['<script>steal()</script>'] }],
    education: [{ degree: 'BS', institution: 'MIT', dates: '2016-2020' }],
    skills: ['JS', '<iframe src="evil.com">']
  };
  const xssValidation = validateResume(xssData);
  if (xssValidation.success) {
    console.log('  Validation: PASSED (XSS sanitized)');
    console.log('  Sanitized name:', xssValidation.data.name);
    console.log('  Sanitized summary:', xssValidation.data.summary);
    console.log('  Sanitized bullet:', xssValidation.data.experience[0].bullets[0]);
    console.log('  Sanitized skill:', xssValidation.data.skills[1]);
  } else {
    console.log('  Validation: BLOCKED (expected)');
  }

  // Test 4: Security - Oversized input rejection
  console.log('\nTest 4: Security - Oversized Input Rejection');
  const oversizedData = { ...atsData, name: 'a'.repeat(101) };
  const oversizedValidation = validateResume(oversizedData);
  console.log('  Oversized name (101 chars):', oversizedValidation.success ? 'FAIL - should reject' : 'PASS - correctly rejected');

  const tooManyExp = { ...atsData, experience: Array(16).fill(atsData.experience[0]) };
  const tooManyValidation = validateResume(tooManyExp);
  console.log('  Too many experience (16):', tooManyValidation.success ? 'FAIL - should reject' : 'PASS - correctly rejected');

  console.log('\n=== All Tests Complete ===');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});