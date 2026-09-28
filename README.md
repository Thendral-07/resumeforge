# ResumeForge

ATS-optimized resume PDF generator and version manager API with feedback collection. Built for Muse connectors.

## Features

- **Two resume templates**: ATS-safe (default) and Classic
- **PDF generation** via Puppeteer
- **Version storage** in MongoDB
- **Feedback collection** with ratings and ATS pass/fail tracking
- **Usage statistics** dashboard
- **API key authentication** for production safety
- **Resume version comparison** - Side-by-side diff of saved versions
- **ATS keyword optimizer** - Analyze resume against job descriptions for keyword gaps
- **ATS pass tracking** - Track which ATS systems your resume passes (Workday, Greenhouse, Lever, etc.)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:
- `PORT` - Server port (default: 3000)
- `API_KEY` - Secret API key for authentication
- `MONGODB_URI` - MongoDB connection string (default: mongodb://localhost:27017/resumeforge)

### 3. Start MongoDB

Make sure MongoDB is running locally, or use a cloud instance (MongoDB Atlas).

### 4. Start the Server

```bash
# Development with auto-reload
npm run dev

# Production
npm start
```

Server will be available at `http://localhost:3000`

## API Endpoints

### Quick Reference

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| GET | `/api/health` | Health check (no auth) | 200/min |
| POST | `/api/generate-resume` | Generate PDF resume | 10/min |
| POST | `/api/save-version` | Save resume version | 30/min |
| GET | `/api/versions/:userId` | List saved versions | 100/min |
| GET | `/api/versions/:userId/compare` | Compare two versions | 30/min |
| POST | `/api/optimize-keywords` | ATS keyword analysis | 10/hour |
| POST | `/api/ats-pass` | Track ATS pass/fail | 20/hour |
| POST | `/api/feedback` | Submit feedback | 20/hour |
| GET | `/api/stats` | Statistics dashboard | 30/min |

---

### Health Check (No Auth Required)

```bash
curl http://localhost:3000/api/health
```

Response:
```json
{"status":"ok"}
```

---

### Generate Resume (ATS-Safe Template - Default)

```bash
curl -X POST http://localhost:3000/api/generate-resume \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "userId": "user123",
    "templateStyle": "ats-safe",
    "name": "John Doe",
    "contact": {
      "email": "john@example.com",
      "phone": "+1-555-123-4567",
      "location": "San Francisco, CA",
      "linkedin": "https://linkedin.com/in/johndoe"
    },
    "summary": "Senior software engineer with 8+ years of experience building scalable web applications.",
    "experience": [
      {
        "title": "Senior Software Engineer",
        "company": "TechCorp Inc.",
        "dates": "2020 - Present",
        "bullets": [
          "Led migration of legacy monolith to microservices architecture",
          "Reduced API latency by 40% through caching optimization",
          "Mentored 5 junior engineers on best practices"
        ]
      }
    ],
    "education": [
      {
        "degree": "B.S. Computer Science",
        "institution": "Stanford University",
        "dates": "2012 - 2016"
      }
    ],
    "skills": ["JavaScript", "TypeScript", "Node.js", "React", "PostgreSQL", "AWS", "Docker"]
  }' \
  --output resume.pdf
```

---

### Generate Resume (Classic Template)

```bash
curl -X POST http://localhost:3000/api/generate-resume \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "userId": "user123",
    "templateStyle": "classic",
    "name": "John Doe",
    "contact": {
      "email": "john@example.com",
      "phone": "+1-555-123-4567",
      "github": "https://github.com/johndoe",
      "linkedin": "https://linkedin.com/in/johndoe"
    },
    "degree": "B.S. Computer Science",
    "institution": "Stanford University",
    "education": [
      {
        "degree": "B.S. Computer Science",
        "institution": "Stanford University",
        "dates": "2012 - 2016",
        "cgpa": "3.85/4.0"
      }
    ],
    "projects": [
      {
        "title": "E-Commerce Platform",
        "description": "Full-stack e-commerce solution with real-time inventory",
        "bullets": [
          "Built with React, Node.js, and PostgreSQL",
          "Implemented Stripe payment integration",
          "Achieved 99.9% uptime in production"
        ],
        "tech": "React, Node.js, PostgreSQL, Stripe, AWS"
      }
    ],
    "experience": [
      {
        "title": "Senior Software Engineer",
        "company": "TechCorp Inc.",
        "dates": "2020 - Present",
        "bullets": [
          "Led migration of legacy monolith to microservices architecture",
          "Reduced API latency by 40% through caching optimization",
          "Mentored 5 junior engineers on best practices"
        ]
      }
    ],
    "skillCategories": [
      {
        "label": "Languages",
        "items": "JavaScript, TypeScript, Python, Go"
      },
      {
        "label": "Frameworks",
        "items": "React, Node.js, Express, Next.js"
      },
      {
        "label": "Databases",
        "items": "PostgreSQL, MongoDB, Redis"
      },
      {
        "label": "Cloud & Tools",
        "items": "AWS, Docker, Kubernetes, CI/CD"
      }
    ],
    "positions": [
      {
        "title": "Tech Lead - Open Source Project",
        "dates": "2019 - Present",
        "bullets": [
          "Maintain popular open-source library with 10k+ stars",
          "Coordinate contributions from 50+ developers"
        ]
      }
    ]
  }' \
  --output resume-classic.pdf
```

---

### Save Resume Version

```bash
curl -X POST http://localhost:3000/api/save-version \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "userId": "user123",
    "title": "Senior Engineer Resume - v1",
    "templateStyle": "ats-safe",
    "resumeData": {
      "name": "John Doe",
      "contact": {
        "email": "john@example.com",
        "phone": "+1-555-123-4567",
        "location": "San Francisco, CA",
        "linkedin": "https://linkedin.com/in/johndoe"
      },
      "summary": "Senior software engineer with 8+ years of experience...",
      "experience": [...],
      "education": [...],
      "skills": [...]
    }
  }'
```

---

### Get Saved Versions

```bash
curl -X GET http://localhost:3000/api/versions/user123 \
  -H "x-api-key: YOUR_API_KEY"
```

Response:
```json
{
  "versions": [
    {
      "id": "507f1f77bcf86cd799439011",
      "title": "Senior Engineer Resume - v1",
      "templateStyle": "ats-safe",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### Submit Feedback

```bash
curl -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "userId": "user123",
    "rating": 5,
    "comment": "The ATS-safe template worked perfectly! Got past 3 ATS systems.",
    "didPassATS": true
  }'
```

Response:
```json
{
  "status": "received",
  "message": "Thanks for your feedback!"
}
```

---

### Compare Resume Versions

Compare two saved resume versions side-by-side with highlighted differences.

```bash
curl -X GET "http://localhost:3000/api/versions/user123/compare?versionId1=abc123&versionId2=def456" \
  -H "x-api-key: YOUR_API_KEY"
```

Response:
```json
{
  "version1": {
    "id": "abc123",
    "title": "Senior Engineer Resume - v1",
    "templateStyle": "ats-safe",
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "version2": {
    "id": "def456",
    "title": "Senior Engineer Resume - v2",
    "templateStyle": "ats-safe",
    "createdAt": "2024-01-20T14:45:00.000Z"
  },
  "diff": {
    "added": [],
    "removed": [],
    "modified": [
      { "path": "summary", "oldValue": "...", "newValue": "..." },
      { "path": "experience.0.bullets", "oldValue": [...], "newValue": [...] }
    ],
    "unchanged": [...]
  },
  "summary": {
    "counts": { "added": 0, "removed": 0, "modified": 2, "unchanged": 15 },
    "summary": "2 modified",
    "hasChanges": true
  },
  "requestId": "abc123..."
}
```

---

### Optimize Keywords for ATS

Analyze your resume against a job description to find missing ATS-friendly keywords.

```bash
curl -X POST http://localhost:3000/api/optimize-keywords \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "userId": "user123",
    "templateStyle": "ats-safe",
    "name": "John Doe",
    "contact": {
      "email": "john@example.com",
      "phone": "+1-555-123-4567",
      "location": "San Francisco, CA",
      "linkedin": "https://linkedin.com/in/johndoe"
    },
    "summary": "Senior software engineer with 8+ years experience...",
    "experience": [...],
    "education": [...],
    "skills": ["JavaScript", "React", "Node.js"],
    "jobDescription": "We are looking for a Senior Full Stack Engineer with React, TypeScript, Node.js, AWS, Docker, Kubernetes experience...",
    "targetRole": "Senior Full Stack Engineer"
  }'
```

Response:
```json
{
  "analysis": {
    "score": 65,
    "matched": ["react", "node.js", "javascript", "aws"],
    "missing": ["typescript", "docker", "kubernetes", "ci/cd", "graphql"],
    "suggestions": [
      { "keyword": "typescript", "category": "technology", "priority": 5, "suggestion": "Add \"typescript\" to your skills or projects section", "whereToAdd": "skills or projects section" },
      { "keyword": "docker", "category": "technology", "priority": 5, "suggestion": "Add \"docker\" to your skills or projects section", "whereToAdd": "skills or projects section" }
    ],
    "resumeKeywords": { "skills": [...], "technologies": [...], "softSkills": [...] },
    "jobKeywords": { "skills": [...], "technologies": [...], "softSkills": [...], "phrases": [...] },
    "summary": { "totalJobKeywords": 25, "matchedCount": 4, "missingCount": 8, "matchPercentage": 65 }
  },
  "requestId": "abc123..."
}
```

---

### Track ATS Pass Results

Record which ATS systems your resume has passed through.

```bash
curl -X POST http://localhost:3000/api/ats-pass \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "userId": "user123",
    "atsSystem": "workday",
    "passed": true,
    "notes": "Passed initial screening on first try"
  }'
```

Supported ATS systems: `workday`, `greenhouse`, `lever`, `icims`, `taleo`, `bamboohr`, `jobvite`, `smartrecruiters`, `bullhorn`, `oracle-taleo`, `successfactors`, `cornerstone`, `other`

Response:
```json
{
  "status": "recorded",
  "message": "ATS pass recorded for workday",
  "feedback": {
    "userId": "user123",
    "atsSystems": ["workday", "greenhouse"],
    "atsPassDetails": [
      { "system": "workday", "passed": true, "date": "2024-01-20T15:00:00.000Z", "notes": "Passed initial screening on first try" },
      { "system": "greenhouse", "passed": false, "date": "2024-01-18T10:00:00.000Z", "notes": "" }
    ]
  },
  "requestId": "abc123..."
}
```

---

### View Statistics Dashboard

```bash
curl -X GET http://localhost:3000/api/stats \
  -H "x-api-key: YOUR_API_KEY"
```

Response:
```json
{
  "totalGenerations": 42,
  "successfulGenerations": 40,
  "failedGenerations": 2,
  "averageRating": 4.5,
  "totalFeedbackCount": 15,
  "uniqueUsers": 8
}
```

## Template Comparison

| Feature | ATS-Safe (Default) | Classic |
|---------|-------------------|---------|
| **Best for** | Automated ATS parsing | Human review, academic/technical roles |
| **Layout** | Single column, clean | Traditional academic format |
| **Sections** | Name, Contact, Summary, Experience, Skills, Education | Name, Contact, Education, Projects, Experience, Skills, Positions |
| **Contact fields** | email, phone, location, linkedin | email, phone, github, linkedin |
| **Education** | degree, institution, dates | degree, institution, dates, **cgpa** |
| **Projects** | Not supported | **Supported** with tech stack |
| **Skills** | Simple array | **Categorized** (label + items) |
| **Positions** | Not supported | **Supported** (leadership roles) |

## Project Structure

```
ResumeForge/
├── src/
│   ├── routes/
│   │   └── generateResume.js    # All API routes
│   ├── templates/
│   │   ├── resume.html          # ATS-safe template
│   │   └── classic.hbs          # Classic Handlebars template
│   ├── utils/
│   │   ├── pdfGenerator.js      # Puppeteer PDF generation
│   │   ├── validator.js         # Zod validation schemas
│   │   ├── diff.js              # Version comparison diff logic
│   │   └── keywordOptimizer.js  # ATS keyword analysis
│   └── models/
│       ├── ResumeVersion.js     # Saved versions
│       ├── UsageLog.js          # Generation logs
│       └── Feedback.js          # User feedback (with ATS tracking)
├── server.js                    # Express app entry point
├── .env.example                 # Environment template
├── package.json
└── README.md
```

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error type",
  "message": "Human-readable description",
  "details": [
    { "field": "contact.email", "message": "Invalid email format" }
  ]
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Validation error
- `401` - Missing API key
- `403` - Invalid API key
- `500` - Server error

## Development

### Run Tests

```bash
# (Add test script when tests are implemented)
```

### Linting

```bash
# (Add lint script when configured)
```

## License

ISC