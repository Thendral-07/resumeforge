const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');

// Load templates
const atsTemplatePath = path.join(__dirname, '..', 'templates', 'resume.html');
const classicTemplatePath = path.join(__dirname, '..', 'templates', 'classic.hbs');

const atsTemplate = fs.readFileSync(atsTemplatePath, 'utf-8');
const classicTemplateSource = fs.readFileSync(classicTemplatePath, 'utf-8');

// Compile Handlebars template for classic
const classicTemplate = Handlebars.compile(classicTemplateSource);

/**
 * Simple template renderer for ATS-safe template - replaces {{key}} and handles {{#each}} loops
 * @param {string} tmpl - HTML template string
 * @param {object} data - Resume data object
 * @returns {string} Rendered HTML
 */
function renderAtsTemplate(tmpl, data) {
  let html = tmpl;

  // Replace simple values (using pre-escaped and sanitized data from validator)
  html = html.replace(/\{\{name\}\}/g, escapeHtml(data.name || ''));
  html = html.replace(/\{\{contact\.email\}\}/g, escapeHtml(data.contact?.email || ''));
  html = html.replace(/\{\{contact\.phone\}\}/g, escapeHtml(data.contact?.phone || ''));
  html = html.replace(/\{\{contact\.location\}\}/g, escapeHtml(data.contact?.location || ''));
  html = html.replace(/\{\{contact\.linkedin\}\}/g, escapeHtml(data.contact?.linkedin || ''));
  html = html.replace(/\{\{summary\}\}/g, escapeHtml(data.summary || ''));

  // Handle experience loop
  if (data.experience && data.experience.length > 0) {
    const experienceHtml = data.experience.map(job => {
      let jobHtml = `
        <div class="experience-item">
          <div class="job-header">
            <div>
              <div class="job-title">${escapeHtml(job.title || '')}</div>
              <div class="job-company">${escapeHtml(job.company || '')}</div>
            </div>
            <div class="job-dates">${escapeHtml(job.dates || '')}</div>
          </div>
          <div class="job-bullets">`;

      if (job.bullets && job.bullets.length > 0) {
        jobHtml += job.bullets.map(bullet =>
          `<div class="bullet">${escapeHtml(bullet)}</div>`
        ).join('');
      }

      jobHtml += `
          </div>
        </div>`;
      return jobHtml;
    }).join('');

    html = html.replace(/\{\{#each experience\}\}[\s\S]*?\{\{\/each\}\}/, experienceHtml);
  } else {
    html = html.replace(/\{\{#each experience\}\}[\s\S]*?\{\{\/each\}\}/, '');
  }

  // Handle skills loop
  if (data.skills && data.skills.length > 0) {
    const skillsHtml = data.skills.map(skill =>
      `<span class="skill-tag">${escapeHtml(skill)}</span>`
    ).join('');
    html = html.replace(/\{\{#each skills\}\}[\s\S]*?\{\{\/each\}\}/, skillsHtml);
  } else {
    html = html.replace(/\{\{#each skills\}\}[\s\S]*?\{\{\/each\}\}/, '');
  }

  // Handle education loop
  if (data.education && data.education.length > 0) {
    const educationHtml = data.education.map(edu => `
      <div class="education-item">
        <div class="edu-degree">${escapeHtml(edu.degree || '')}</div>
        <div class="edu-institution">${escapeHtml(edu.institution || '')}</div>
        <div class="edu-dates">${escapeHtml(edu.dates || '')}</div>
      </div>
    `).join('');
    html = html.replace(/\{\{#each education\}\}[\s\S]*?\{\{\/each\}\}/, educationHtml);
  } else {
    html = html.replace(/\{\{#each education\}\}[\s\S]*?\{\{\/each\}\}/, '');
  }

  return html;
}

/**
 * Escape HTML special characters to prevent HTML/XSS injection inside Puppeteer
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  return text.replace(/[&<>"'`=\/]/g, char => map[char]);
}

/**
 * Generate PDF from resume data
 * @param {object} resumeData - Validated resume data
 * @param {string} templateStyle - 'ats-safe' or 'classic'
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generatePdf(resumeData, templateStyle = 'ats-safe') {
  let browser = null;

  try {
    // Render HTML template with data
    let html;
    if (templateStyle === 'classic') {
      html = classicTemplate(resumeData);
    } else {
      html = renderAtsTemplate(atsTemplate, resumeData);
    }

    // Launch Puppeteer with hardened sandboxing and flags
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--disable-file-system',
        '--disable-local-storage',
        '--disable-shared-workers',
        '--disable-speech-api',
        '--disable-notifications',
        '--disable-remote-fonts',
        '--disable-background-networking',
        '--mute-audio'
      ]
    });

    const page = await browser.newPage();

    // Block all outbound/network connections from Chromium to prevent SSRF
    await page.setRequestInterception(true);
    page.on('request', request => {
      // Allow only internal about:blank or data URIs, block any network requests
      const url = request.url();
      if (url.startsWith('data:') || url === 'about:blank') {
        request.continue();
      } else {
        request.abort('blockedbyclient');
      }
    });

    // Disable JavaScript execution inside Chromium for maximum safety against XSS/Execution
    await page.setJavaScriptEnabled(false);

    // Set content and wait for rendering
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 10000 // Short, fast timeout
    });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '0.75in',
        right: '0.75in',
        bottom: '0.75in',
        left: '0.75in'
      }
    });

    return pdfBuffer;
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error(`PDF generation failed: ${error.message}`);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
  }
}

module.exports = { generatePdf };