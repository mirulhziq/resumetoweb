const fs = require('fs').promises;
const path = require('path');

async function buildPortfolio(resumeData, enhancedContent, options = {}) {
    console.log('Building portfolio from template...');

    const templatePath = path.join(__dirname, '../templates/portfolio-template.html');
    let html = await fs.readFile(templatePath, 'utf8');

    // Clean and validate name - filter out placeholder names
    let name = resumeData.name || '';
    const placeholderNames = ['resume owner', 'your name', 'name', 'full name', 'candidate'];
    if (!name || placeholderNames.includes(name.toLowerCase().trim())) {
        // Try to get name from email if available
        if (resumeData.email) {
            const emailName = resumeData.email.split('@')[0]
                .replace(/[._]/g, ' ')
                .split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');
            name = emailName;
        } else {
            name = '';
        }
    }

    const headline = (enhancedContent && enhancedContent.headline) || deriveHeadline(resumeData);
    const initials = getInitials(name);
    const role = deriveRole(resumeData);

    // Basic info replacements
    html = html.replace(/{{NAME}}/g, esc(name));
    html = html.replace(/{{INITIALS}}/g, esc(initials));
    html = html.replace(/{{ROLE}}/g, esc(role));
    html = html.replace(/{{META_DESCRIPTION}}/g, esc((enhancedContent.about || headline).substring(0, 150)));
    html = html.replace(/{{HEADLINE}}/g, esc(headline));
    html = html.replace(/{{EMAIL}}/g, esc(resumeData.email || ''));

    // Footer contact links
    const footerContact = buildFooterContact(resumeData);
    html = html.replace('{{FOOTER_CONTACT}}', footerContact);

    // Build blocks (conditionally included)
    const aboutBlock = buildAboutBlock(enhancedContent.about || resumeData.summary);
    const experienceBlock = buildExperienceBlock(enhancedContent.enhancedExperience || resumeData.experience);
    const projectsBlock = buildProjectsBlock(enhancedContent.enhancedProjects || resumeData.projects);
    const skillsBlock = buildSkillsBlock(resumeData.skills);
    const educationBlock = buildEducationBlock(resumeData.education);
    const certificationsBlock = buildListSection('certifications', 'Certifications', enhancedContent.enhancedCertifications || resumeData.certifications);
    const awardsBlock = buildListSection('awards', 'Awards', enhancedContent.enhancedAwards || resumeData.awards);
    const activitiesBlock = buildListSection('activities', 'Activities', enhancedContent.enhancedActivities || resumeData.activities);
    const publicationsBlock = buildListSection('publications', 'Publications', enhancedContent.enhancedPublications || resumeData.publications);

    html = html.replace('{{ABOUT_BLOCK}}', aboutBlock);
    html = html.replace('{{EXPERIENCE_BLOCK}}', experienceBlock);
    html = html.replace('{{PROJECTS_BLOCK}}', projectsBlock);
    html = html.replace('{{SKILLS_BLOCK}}', skillsBlock);
    html = html.replace('{{EDUCATION_BLOCK}}', educationBlock);
    html = html.replace('{{CERTIFICATIONS_BLOCK}}', certificationsBlock);
    html = html.replace('{{AWARDS_BLOCK}}', awardsBlock);
    html = html.replace('{{ACTIVITIES_BLOCK}}', activitiesBlock);
    html = html.replace('{{PUBLICATIONS_BLOCK}}', publicationsBlock);

    // Navigation links
    const navLinks = buildNavLinks({
        hasAbout: Boolean(aboutBlock),
        hasExperience: Boolean(experienceBlock),
        hasProjects: Boolean(projectsBlock),
        hasSkills: Boolean(skillsBlock),
        hasEducation: Boolean(educationBlock),
        hasCertifications: Boolean(certificationsBlock),
        hasAwards: Boolean(awardsBlock),
        hasActivities: Boolean(activitiesBlock),
        hasPublications: Boolean(publicationsBlock)
    });
    html = html.replace('{{NAV_LINKS}}', navLinks);

    console.log('Portfolio built successfully');
    return html;
}

function getInitials(name) {
    if (!name) return 'P';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) {
        return words[0].charAt(0).toUpperCase();
    }
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

function deriveRole(resumeData) {
    // Get role from first experience title or derive from skills
    const expTitle = resumeData?.experience?.[0]?.title;
    if (expTitle) {
        // Clean up common prefixes/suffixes and garbage words
        let role = expTitle
            .replace(/^(Senior|Junior|Lead|Principal|Staff)\s+/i, '')
            .split(/[,|]/)[0]
            .trim();
        // Filter out garbage
        if (/\b(through|successful|various|resume|owner)\b/i.test(role) || role.length < 3) {
            role = '';
        }
        if (role) return role;
    }
    const topSkills = Array.isArray(resumeData?.skills) ? resumeData.skills.slice(0, 2).filter(s => s && s.length > 2) : [];
    if (topSkills.length) {
        return `${topSkills[0]} Developer`;
    }
    return 'Professional';
}

function deriveHeadline(resumeData) {
    const expTitle = resumeData?.experience?.[0]?.title;
    const topSkills = Array.isArray(resumeData?.skills) ? resumeData.skills.slice(0, 4).filter(Boolean) : [];
    
    if (expTitle && topSkills.length) {
        return `Experienced ${expTitle} with expertise in ${topSkills.slice(0, 3).join(', ')}. Passionate about delivering quality work and continuous improvement.`;
    }
    if (expTitle) {
        return `Experienced ${expTitle} passionate about delivering quality work and making an impact.`;
    }
    if (topSkills.length) {
        return `Professional with expertise in ${topSkills.join(', ')}. Dedicated to continuous learning and excellence.`;
    }
    return 'Dedicated professional committed to excellence and continuous growth.';
}

function buildFooterContact(resumeData) {
    const links = [];
    
    if (resumeData.email) {
        links.push(`<a href="mailto:${esc(resumeData.email)}" class="footer-contact-link">${esc(resumeData.email)}</a>`);
    }
    if (resumeData.phone) {
        links.push(`<a href="tel:${esc(resumeData.phone)}" class="footer-contact-link">${esc(resumeData.phone)}</a>`);
    }
    if (resumeData.linkedin) {
        links.push(`<a href="${esc(resumeData.linkedin)}" target="_blank" rel="noopener" class="footer-contact-link">LinkedIn</a>`);
    }
    
    return links.join('\n');
}

function buildNavLinks({ hasAbout, hasExperience, hasProjects, hasSkills, hasEducation, hasCertifications, hasAwards, hasActivities, hasPublications }) {
    const links = [];
    if (hasAbout) links.push(`<a href="#about" class="nav-link">About</a>`);
    if (hasExperience) links.push(`<a href="#experience" class="nav-link">Experience</a>`);
    if (hasProjects) links.push(`<a href="#projects" class="nav-link">Projects</a>`);
    if (hasSkills) links.push(`<a href="#skills" class="nav-link">Skills</a>`);
    if (hasEducation) links.push(`<a href="#education" class="nav-link">Education</a>`);
    return links.join('\n');
}

function stripWeirdBulletPrefix(s) {
    return String(s || '')
        .replace(/^[\s\uFFFD\uE000-\uF8FF]+/g, '')
        .replace(/^[•·●▪◦‣⁃\-–—*]+\s*/g, '')
        .trim();
}

function clampWords(text, maxWords) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return words.join(' ');
    return words.slice(0, maxWords).join(' ') + '…';
}

// ===== ABOUT SECTION (Noiré Style) =====
function buildAboutBlock(aboutText) {
    const cleaned = String(aboutText || '').trim();
    if (!cleaned) return '';

    const paragraphs = cleaned
        .split(/\n\s*\n+/)
        .map(p => p.trim())
        .filter(Boolean)
        .slice(0, 2)
        .map(p => clampWords(p.replace(/\s+/g, ' '), 120));

    const htmlParagraphs = paragraphs
        .map(p => `<p>${esc(p)}</p>`)
        .join('');

    return `
    <section class="about" id="about">
        <div class="container">
            <div class="about-header">
                <div class="section-label">Introduction</div>
                <h2 class="section-title">About Me</h2>
            </div>
            <div class="about-content">
                <div class="about-text">
                    ${htmlParagraphs}
                    <div class="about-cta">
                        <a href="#contact" class="btn-outline">
                            Get In Touch
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                                <polyline points="12 5 19 12 12 19"></polyline>
                            </svg>
                        </a>
                    </div>
                </div>
                <div></div>
            </div>
        </div>
    </section>
    `;
}

// ===== EXPERIENCE SECTION (Noiré Style) =====
function splitIntoBullets(text) {
    const raw = String(text || '').trim();
    if (!raw) return [];

    const hasBulletChars = raw.includes('•') || /\n\s*[-*]\s+/.test(raw);
    if (hasBulletChars || raw.includes('\n')) {
        const parts = raw
            .split(/\n+/)
            .map(s => stripWeirdBulletPrefix(s))
            .filter(Boolean);
        if (parts.length <= 1) return [];
        return parts.slice(0, 6);
    }
    return [];
}

function buildExperienceBlock(experience) {
    if (!experience || !Array.isArray(experience) || experience.length === 0) return '';

    const cards = experience.map(exp => {
        const bullets = splitIntoBullets(exp.description);
        let descHtml = '';
        
        if (bullets.length) {
            const li = bullets.map(b => `<li>${esc(b)}</li>`).join('');
            descHtml = `<ul class="exp-bullets">${li}</ul>`;
        } else {
            descHtml = `<p class="exp-desc">${esc(exp.description)}</p>`;
        }

        return `
        <div class="exp-card">
            <div class="exp-header">
                <div>
                    <h3 class="exp-title">${esc(exp.title)}</h3>
                    <div class="exp-company">${esc(exp.company)}</div>
                </div>
                <span class="exp-date">${esc(exp.dates)}</span>
            </div>
            ${descHtml}
        </div>
        `;
    }).join('');

    return `
    <section class="experience" id="experience">
        <div class="container">
            <div class="experience-header">
                <div>
                    <div class="section-label">Career</div>
                    <h2 class="section-title">Work Experience</h2>
                </div>
            </div>
            <div class="experience-grid">
                ${cards}
            </div>
        </div>
    </section>
    `;
}

// ===== PROJECTS SECTION (Noiré Style) =====
function buildProjectsBlock(projects) {
    if (!projects || !Array.isArray(projects) || projects.length === 0) return '';

    const cards = projects.map((proj, index) => {
        const techTags = proj.technologies
            ? `<div class="project-tech">${proj.technologies.split(',').map(tech =>
                `<span class="tech-tag">${esc(tech.trim())}</span>`
              ).join('')}</div>`
            : '';

        // Generate placeholder visual
        const placeholderNum = (index % 4) + 1;

        return `
        <div class="project-card">
            <div class="project-image">
                <span class="project-image-placeholder">${String(index + 1).padStart(2, '0')}</span>
            </div>
            <div class="project-content">
                <h3 class="project-name">${esc(proj.name)}</h3>
                <p class="project-desc">${esc(proj.description)}</p>
                ${techTags}
            </div>
        </div>
        `;
    }).join('');

    return `
    <section class="projects" id="projects">
        <div class="container">
            <div class="projects-header">
                <div class="section-label">Portfolio</div>
                <h2 class="projects-tagline">Drive your project toward excellence with clarity.</h2>
            </div>
            <div class="projects-grid">
                ${cards}
            </div>
        </div>
    </section>
    `;
}

// ===== SKILLS SECTION (Noiré Style - Dark Accordion) =====
function buildSkillsBlock(skills) {
    if (!skills || !Array.isArray(skills) || skills.length === 0) return '';

    // Group skills into categories (or keep as single group if not categorizable)
    const categories = groupSkills(skills);
    
    const accordionItems = categories.map((cat, index) => {
        const tags = cat.skills.map(skill =>
            `<span class="skill-tag">${esc(skill)}</span>`
        ).join('');

        const isOpen = index === 0 ? ' open' : '';

        return `
        <div class="skill-item${isOpen}">
            <div class="skill-header">
                <span class="skill-name">${esc(cat.name)}</span>
                <svg class="skill-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
            </div>
            <div class="skill-content">
                <div class="skill-tags">${tags}</div>
            </div>
        </div>
        `;
    }).join('');

    return `
    <section class="skills" id="skills">
        <div class="container">
            <div class="section-label">Expertise</div>
            <h2 class="section-title">Skills & Competencies</h2>
            <div class="skills-accordion">
                ${accordionItems}
            </div>
        </div>
    </section>
    `;
}

function groupSkills(skills) {
    // Try to intelligently group skills
    const programming = [];
    const frameworks = [];
    const tools = [];
    const soft = [];
    const other = [];

    const programmingKeywords = ['java', 'python', 'javascript', 'typescript', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'go', 'rust', 'sql', 'html', 'css', 'r', 'scala'];
    const frameworkKeywords = ['react', 'angular', 'vue', 'node', 'express', 'django', 'flask', 'spring', 'laravel', 'rails', 'next', 'nuxt', '.net', 'tensorflow', 'pytorch'];
    const toolKeywords = ['git', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'jenkins', 'jira', 'figma', 'photoshop', 'excel', 'power bi', 'tableau', 'mysql', 'mongodb', 'postgresql'];
    const softKeywords = ['leadership', 'communication', 'teamwork', 'problem', 'analytical', 'critical', 'management', 'presentation', 'negotiation', 'collaboration'];

    for (const skill of skills) {
        const lower = skill.toLowerCase();
        if (programmingKeywords.some(k => lower.includes(k))) {
            programming.push(skill);
        } else if (frameworkKeywords.some(k => lower.includes(k))) {
            frameworks.push(skill);
        } else if (toolKeywords.some(k => lower.includes(k))) {
            tools.push(skill);
        } else if (softKeywords.some(k => lower.includes(k))) {
            soft.push(skill);
        } else {
            other.push(skill);
        }
    }

    const categories = [];
    if (programming.length) categories.push({ name: 'Programming Languages', skills: programming });
    if (frameworks.length) categories.push({ name: 'Frameworks & Libraries', skills: frameworks });
    if (tools.length) categories.push({ name: 'Tools & Platforms', skills: tools });
    if (soft.length) categories.push({ name: 'Soft Skills', skills: soft });
    if (other.length) categories.push({ name: 'Other Skills', skills: other });

    // If no categorization worked, return all as single group
    if (categories.length === 0) {
        return [{ name: 'Technical Skills', skills }];
    }

    return categories;
}

// ===== EDUCATION SECTION (Noiré Style) =====
function buildEducationBlock(education) {
    if (!education || !Array.isArray(education) || education.length === 0) return '';

    const cards = education.map(edu => `
        <div class="edu-card">
            ${edu.degree ? `<div class="edu-degree">${esc(edu.degree)}</div>` : ''}
            ${edu.school ? `<div class="edu-school">${esc(edu.school)}</div>` : ''}
            ${edu.year ? `<div class="edu-year">${esc(edu.year)}</div>` : ''}
        </div>
    `).join('');

    return `
    <section class="education" id="education">
        <div class="container">
            <div class="section-label">Background</div>
            <h2 class="section-title">Education</h2>
            <div class="education-grid">
                ${cards}
            </div>
        </div>
    </section>
    `;
}

// ===== LIST SECTIONS (Certifications, Awards, etc.) =====
function buildListSection(id, title, items) {
    if (!items || !Array.isArray(items) || items.filter(Boolean).length === 0) return '';

    const listItems = items
        .filter(Boolean)
        .slice(0, 12)
        .map(item => `<div class="list-item">${esc(stripWeirdBulletPrefix(item))}</div>`)
        .join('');

    return `
    <section class="${id}" id="${id}">
        <div class="container">
            <div class="section-label">${esc(title)}</div>
            <h2 class="section-title">${esc(title)}</h2>
            <div class="list-section-grid">
                ${listItems}
            </div>
        </div>
    </section>
    `;
}

function esc(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

module.exports = { buildPortfolio };
