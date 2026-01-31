function extractEmail(text) {
    const regex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const match = String(text || '').match(regex);
    return match ? match[0] : '';
}

function normalizeText(raw) {
    // Remove private-use glyphs and replacement chars that show as "unknown boxes"
    // Keep newlines so we can do heading-based section extraction reliably.
    return String(raw || '')
        .replace(/\uFFFD/g, '')
        .replace(/[\uE000-\uF8FF]/g, '')
        .replace(/[^\S\r\n]+/g, ' ')
        // Strip control chars except \n and \r
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .trim();
}

function toLines(text) {
    return normalizeText(text).split(/\r?\n/).map(l => l.trimRight());
}

function isHeading(line, headingRegex) {
    return headingRegex.test(String(line || '').trim());
}

function extractSection(lines, startHeadingRegex, stopHeadingRegexes) {
    const startIdx = lines.findIndex(l => isHeading(l, startHeadingRegex));
    if (startIdx === -1) return [];
    const out = [];
    for (let i = startIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
            out.push('');
            continue;
        }
        const isStop = stopHeadingRegexes.some(rx => isHeading(line, rx));
        if (isStop) break;
        out.push(lines[i]);
    }
    return out;
}

function extractPhone(text) {
    // More permissive than apify-actor: supports +60 formats etc.
    const regex = /(\+?\d{1,3}[\s-]?)?(\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}/;
    const match = String(text || '').match(regex);
    return match ? match[0].trim() : '';
}

function extractLinkedIn(text) {
    const regex = /linkedin\.com\/in\/[\w-]+/i;
    const match = String(text || '').match(regex);
    return match ? `https://${match[0]}` : '';
}

function extractName(text) {
    const lines = toLines(text).slice(0, 10);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.length > 60 || trimmed.length < 3) continue;
        if (trimmed.includes('@') || trimmed.includes('http') || trimmed.includes('linkedin')) continue;
        // Skip phone numbers
        if (/^\+?\d[\d\s\-()]+$/.test(trimmed)) continue;
        // Skip section headings
        if (/^(RESUME|CV|CURRICULUM|EXPERIENCE|EDUCATION|SKILLS|SUMMARY|PROFILE|OBJECTIVE)/i.test(trimmed)) continue;
        // Skip addresses
        if (/\b(street|road|avenue|city|state|zip|postal)\b/i.test(trimmed)) continue;
        
        // Match names: "John Doe", "JOHN DOE", "John doe", etc.
        // At least 2 words, letters only (with spaces, hyphens, apostrophes)
        if (/^[A-Za-z][A-Za-z'\-]*(\s+[A-Za-z][A-Za-z'\-]*)+$/.test(trimmed)) {
            // Convert ALL CAPS to Title Case
            const name = trimmed.split(/\s{2,}/)[0];
            if (name.toUpperCase() === name) {
                return name.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            }
            return name;
        }
    }
    return '';
}

function extractSummary(text) {
    const t = normalizeText(text);
    const lines = toLines(t);

    // Prefer explicit SUMMARY/PROFILE section if it is a heading
    const summaryLines = extractSection(
        lines,
        /^\s*(SUMMARY|PROFILE|ABOUT\s+ME|OBJECTIVE)\s*$/i,
        [/^\s*(EXPERIENCE|WORK\s+HISTORY|EMPLOYMENT|EDUCATION|ACADEMIC|SKILLS|TECHNICAL\s+SKILLS|PROJECTS|PORTFOLIO)\s*$/i]
    );
    const summaryText = summaryLines.join('\n').trim();
    if (summaryText) return summaryText;

    // Fallback: first non-contact paragraph that doesn't look like an entire resume dump
    const paragraphs = t.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    for (const para of paragraphs.slice(0, 8)) {
        if (para.length < 60) continue;
        if (para.includes('@') || para.includes('http')) continue;
        // Don't allow education lists into summary
        if (/(EDUCATION|UNIVERSITI|UNIVERSITY|CGPA|SPM|MATRICULATION)/i.test(para)) continue;
        return para;
    }
    return '';
}

function extractExperience(text) {
    const experiences = [];
    const lines = toLines(text);
    const expLines = extractSection(
        lines,
        /^\s*(EXPERIENCE|WORK\s+HISTORY|EMPLOYMENT)\s*$/i,
        [/^\s*(EDUCATION|ACADEMIC|SKILLS|TECHNICAL\s+SKILLS|PROJECTS|PORTFOLIO)\s*$/i]
    );
    if (expLines.length === 0) return [];

    const entries = expLines.join('\n').split(/\n\s*\n+/);
    for (const entry of entries) {
        const cleaned = entry.trim();
        if (cleaned.length < 20) continue;
        const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) continue;

        const title = lines[0].split('|')[0].trim();
        let company = lines[1] || '';
        if (lines[0].includes('|')) {
            company = lines[0].split('|')[1].trim();
        }

        const dateRegex = /\b(20\d{2}|19\d{2})\b.*?\b(20\d{2}|19\d{2}|Present|Current)\b/i;
        let dates = cleaned.match(dateRegex);
        dates = dates ? dates[0] : '';

        const description = lines.slice(2).join('\n').trim();

        experiences.push({
            title: title || 'Role',
            company: company || 'Company',
            dates: dates || 'Date not specified',
            description: description || 'Responsibilities included various professional tasks.'
        });
        if (experiences.length >= 6) break;
    }
    return experiences;
}

function extractEducation(text) {
    const education = [];
    const lines = toLines(text);
    const eduLines = extractSection(
        lines,
        /^\s*(EDUCATION|ACADEMIC)\s*$/i,
        [/^\s*(EXPERIENCE|WORK\s+HISTORY|EMPLOYMENT|SKILLS|TECHNICAL\s+SKILLS|PROJECTS|PORTFOLIO)\s*$/i]
    );
    if (eduLines.length === 0) return [];

    const entries = eduLines.join('\n').split(/\n\s*\n+/);
    for (const entry of entries) {
        const cleaned = entry.trim();
        if (cleaned.length < 10) continue;
        const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 1) continue;

        // Many resumes: first line can be school, second line degree (or vice versa).
        // We'll keep both, but never inject placeholder school.
        const first = lines[0] || '';
        const second = lines[1] || '';
        const degree = first;
        const school = second;
        const yearMatch = cleaned.match(/\b(20\d{2}|19\d{2})\b/);
        const year = yearMatch ? yearMatch[0] : '';

        // If we only have one line, treat it as school and leave degree empty.
        if (!second) {
            education.push({ degree: '', school: first, year });
        } else {
            education.push({ degree, school, year });
        }
        if (education.length >= 3) break;
    }
    return education;
}

function extractSkills(text) {
    const lines = toLines(text);
    const skillsLines = extractSection(
        lines,
        /^\s*(SKILLS|TECHNICAL\s+SKILLS|COMPETENCIES)\s*$/i,
        [/^\s*(EXPERIENCE|WORK\s+HISTORY|EMPLOYMENT|EDUCATION|ACADEMIC|PROJECTS|PORTFOLIO)\s*$/i]
    );
    if (skillsLines.length === 0) return [];

    // Join but keep line boundaries to support "Languages: ..." format
    const rawLines = skillsLines
        .map(l => String(l || '').trim())
        .filter(Boolean);

    const out = [];
    for (const line of rawLines) {
        // e.g. "Languages: Java, Python, Kotlin"
        const parts = line.includes(':') ? line.split(':').slice(1).join(':') : line;
        parts
            .split(/[,•]/)
            .map(s => s.trim())
            .filter(Boolean)
            .forEach(s => out.push(s));
    }

    // Clean up stray punctuation and overly long phrases
    const cleaned = out
        .map(s => s.replace(/\s+/g, ' ').trim())
        .filter(s => s.length > 1 && s.length <= 32)
        // Filter out garbage phrases
        .filter(s => !/\b(through|successful|various|responsible|experience|duties|tasks|resume|cv|owner)\b/i.test(s))
        // Must contain at least one letter
        .filter(s => /[a-zA-Z]/.test(s));

    return Array.from(new Set(cleaned)).slice(0, 24);
}

function extractProjects(text) {
    const projects = [];
    const t = String(text || '');
    const projSection = t.match(/(?:PROJECTS|PORTFOLIO)[:\s]+([\s\S]*?)(?=\n(?:EXPERIENCE|EDUCATION|SKILLS|$))/i);
    if (!projSection) return [];

    const entries = projSection[1].split(/\n\n+/);
    for (const entry of entries) {
        const cleaned = entry.trim();
        if (cleaned.length < 20) continue;
        const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 1) continue;

        const name = lines[0];
        const description = lines.slice(1).join(' ').substring(0, 350).trim();
        const techRegex = /(?:Technologies?|Built with|Using)[:\s]+([^\n]+)/i;
        const techMatch = cleaned.match(techRegex);
        const technologies = techMatch ? techMatch[1] : '';

        projects.push({
            name: name || 'Project',
            description: description || 'Project details available upon request.',
            technologies
        });
        if (projects.length >= 5) break;
    }
    return projects;
}

function extractGenericSection(lines, headingRegex, stopRegexes) {
    const sectionLines = extractSection(lines, headingRegex, stopRegexes);
    const cleaned = sectionLines
        .map(l => String(l || '').trim())
        .filter(Boolean)
        .join('\n')
        .trim();
    if (!cleaned) return [];

    // Split into bullet-ish items
    const parts = cleaned
        .split(/\n+/)
        .map(s => s.trim().replace(/^[•·●▪◦‣⁃\-–—*]+\s*/g, '').trim())
        .filter(Boolean);
    return parts.slice(0, 20);
}

function extractResumeDataFromText(text) {
    const lines = toLines(text);
    const stop = [
        /^\s*(EXPERIENCE|WORK\s+HISTORY|EMPLOYMENT|EDUCATION|ACADEMIC|SKILLS|TECHNICAL\s+SKILLS|COMPETENCIES|PROJECTS|PORTFOLIO|CERTIFICATIONS?|CERTIFICATES?|AWARDS?|ACHIEVEMENTS?|ACTIVITIES|VOLUNTEER(ING)?|PUBLICATIONS?)\s*$/i
    ];

    const certifications = extractGenericSection(lines, /^\s*(CERTIFICATIONS?|CERTIFICATES?)\s*$/i, stop);
    const awards = extractGenericSection(lines, /^\s*(AWARDS?|ACHIEVEMENTS?)\s*$/i, stop);
    const activities = extractGenericSection(lines, /^\s*(ACTIVITIES|VOLUNTEER(ING)?)\s*$/i, stop);
    const publications = extractGenericSection(lines, /^\s*(PUBLICATIONS?)\s*$/i, stop);

    return {
        name: extractName(text),
        email: extractEmail(text),
        phone: extractPhone(text),
        linkedin: extractLinkedIn(text),
        summary: extractSummary(text),
        experience: extractExperience(text),
        education: extractEducation(text),
        skills: extractSkills(text),
        projects: extractProjects(text),
        certifications,
        awards,
        activities,
        publications
    };
}

module.exports = { extractResumeDataFromText };
