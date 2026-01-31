import { Actor } from 'apify';
import pdf from 'pdf-parse';

await Actor.main(async () => {
    const input = await Actor.getInput();
    const { pdfUrl } = input;
    
    console.log('📄 Parsing PDF:', pdfUrl);
    
    try {
        // Download PDF
        const response = await fetch(pdfUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.statusText}`);
        }
        
        const pdfBuffer = await response.arrayBuffer();
        const data = await pdf(Buffer.from(pdfBuffer));
        const text = data.text;
        
        console.log('✅ PDF parsed successfully');
        console.log('Text length:', text.length, 'characters');
        
        // Extract structured data
        const resumeData = {
            name: extractName(text),
            email: extractEmail(text),
            phone: extractPhone(text),
            linkedin: extractLinkedIn(text),
            summary: extractSummary(text),
            experience: extractExperience(text),
            education: extractEducation(text),
            skills: extractSkills(text),
            projects: extractProjects(text)
        };
        
        const confidence = calculateConfidence(resumeData);
        
        await Actor.pushData({
            success: true,
            confidence,
            data: resumeData
        });
        
        console.log('✅ Extraction complete, confidence:', confidence);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        await Actor.pushData({
            success: false,
            error: error.message,
            data: null
        });
    }
});

// ===== EXTRACTION FUNCTIONS =====

function extractEmail(text) {
    const regex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const match = text.match(regex);
    return match ? match[0] : null;
}

function extractPhone(text) {
    const regex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
    const match = text.match(regex);
    return match ? match[0].trim() : null;
}

function extractLinkedIn(text) {
    const regex = /linkedin\.com\/in\/[\w-]+/i;
    const match = text.match(regex);
    return match ? `https://${match[0]}` : null;
}

function extractName(text) {
    const lines = text.split('\n').slice(0, 10);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.length > 60 || trimmed.length < 3) continue;
        if (trimmed.includes('@') || trimmed.includes('http') || trimmed.includes('linkedin')) continue;
        // Skip phone numbers
        if (/^\+?\d[\d\s\-()]+$/.test(trimmed)) continue;
        // Skip section headings
        if (/^(RESUME|CV|CURRICULUM|EXPERIENCE|EDUCATION|SKILLS|SUMMARY|PROFILE|OBJECTIVE)/i.test(trimmed)) continue;
        
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
    return null;
}

function extractSummary(text) {
    const regex = /(?:SUMMARY|PROFILE|ABOUT ME|OBJECTIVE)[:\s]+([^\n]+(?:\n(?!\n)[^\n]+)*)/i;
    const match = text.match(regex);
    if (match) return match[1].trim().split('\n\n')[0];
    
    const paragraphs = text.split('\n\n');
    for (const para of paragraphs.slice(1, 4)) {
        if (para.length > 50 && 
            !para.includes('@') && 
            !para.includes('http') &&
            !para.match(/\d{4}/)) {
            return para.trim();
        }
    }
    return null;
}

function extractExperience(text) {
    const experiences = [];
    const expSection = text.match(/(?:EXPERIENCE|WORK HISTORY|EMPLOYMENT)[:\s]+([\s\S]*?)(?=\n(?:EDUCATION|SKILLS|PROJECTS|$))/i);
    
    if (!expSection) return [];
    
    const entries = expSection[1].split(/\n\n+/);
    
    for (const entry of entries) {
        if (entry.trim().length < 20) continue;
        const lines = entry.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) continue;
        
        const title = lines[0].split('|')[0].trim();
        let company = lines[1];
        if (lines[0].includes('|')) {
            company = lines[0].split('|')[1].trim();
        }
        
        const dateRegex = /\b(20\d{2}|19\d{2})\b.*?\b(20\d{2}|19\d{2}|Present|Current)\b/i;
        let dates = entry.match(dateRegex);
        dates = dates ? dates[0] : "Date not specified";
        
        const description = lines.slice(2).join(' ').substring(0, 300);
        
        experiences.push({
            title,
            company,
            dates,
            description: description || "Responsibilities included various professional tasks."
        });
        
        if (experiences.length >= 5) break;
    }
    
    return experiences;
}

function extractEducation(text) {
    const education = [];
    const eduSection = text.match(/(?:EDUCATION|ACADEMIC)[:\s]+([\s\S]*?)(?=\n(?:EXPERIENCE|SKILLS|PROJECTS|$))/i);
    
    if (!eduSection) return [];
    
    const entries = eduSection[1].split(/\n\n+/);
    
    for (const entry of entries) {
        if (entry.trim().length < 10) continue;
        const lines = entry.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 1) continue;
        
        const degree = lines[0];
        const school = lines[1] || "University";
        const yearMatch = entry.match(/\b(20\d{2}|19\d{2})\b/);
        const year = yearMatch ? yearMatch[0] : "Year not specified";
        
        education.push({ degree, school, year });
        if (education.length >= 3) break;
    }
    
    return education;
}

function extractSkills(text) {
    const skillsSection = text.match(/(?:SKILLS|TECHNICAL SKILLS|COMPETENCIES)[:\s]+([\s\S]*?)(?=\n(?:EXPERIENCE|EDUCATION|PROJECTS|$))/i);
    
    if (!skillsSection) {
        const commonSkills = [
            'Python', 'JavaScript', 'Java', 'C\\+\\+', 'Ruby', 'Go', 'Swift',
            'React', 'Angular', 'Vue', 'Node\\.js', 'Django', 'Flask',
            'SQL', 'MongoDB', 'PostgreSQL', 'Redis',
            'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes',
            'Git', 'CI/CD', 'Agile', 'Scrum'
        ];
        
        const foundSkills = commonSkills.filter(skill => 
            new RegExp(`\\b${skill}\\b`, 'i').test(text)
        );
        
        return foundSkills.slice(0, 15);
    }
    
    const skills = skillsSection[1]
        .split(/[,•\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 1 && s.length < 30 && !s.includes(':'))
        // Filter out garbage phrases
        .filter(s => !/\b(through|successful|various|responsible|experience|duties|tasks|resume|cv|owner)\b/i.test(s))
        .slice(0, 20);
    
    return skills;
}

function extractProjects(text) {
    const projects = [];
    const projSection = text.match(/(?:PROJECTS|PORTFOLIO)[:\s]+([\s\S]*?)(?=\n(?:EXPERIENCE|EDUCATION|SKILLS|$))/i);
    
    if (!projSection) return [];
    
    const entries = projSection[1].split(/\n\n+/);
    
    for (const entry of entries) {
        if (entry.trim().length < 20) continue;
        const lines = entry.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 1) continue;
        
        const name = lines[0];
        const description = lines.slice(1).join(' ').substring(0, 250);
        const techRegex = /(?:Technologies?|Built with|Using)[:\s]+([^\n]+)/i;
        const techMatch = entry.match(techRegex);
        const technologies = techMatch ? techMatch[1] : "";
        
        projects.push({ name, description, technologies });
        if (projects.length >= 4) break;
    }
    
    return projects;
}

function calculateConfidence(data) {
    let score = 0;
    if (data.name) score += 20;
    if (data.email) score += 20;
    if (data.phone) score += 10;
    if (data.experience && data.experience.length > 0) score += 25;
    if (data.education && data.education.length > 0) score += 15;
    if (data.skills && data.skills.length > 0) score += 10;
    return score / 100;
}
