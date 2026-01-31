const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

function hasBlockedLocalProxy() {
    const candidates = [
        process.env.HTTPS_PROXY,
        process.env.HTTP_PROXY,
        process.env.ALL_PROXY,
        process.env.https_proxy,
        process.env.http_proxy,
        process.env.all_proxy
    ].filter(Boolean);
    return candidates.some((v) => {
        const s = String(v).toLowerCase();
        return s.includes('127.0.0.1:9') || s.includes('localhost:9');
    });
}

let cachedModelId = null;

async function resolveModelId() {
    if (process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL;
    if (cachedModelId) return cachedModelId;

    // Try to discover available models via the Models API (best).
    try {
        if (anthropic.models && typeof anthropic.models.list === 'function') {
            const resp = await anthropic.models.list({ limit: 50 });
            const models = Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : [];
            // Prefer the newest Sonnet models (4.5, then 4.x), then any Sonnet.
            const preferred =
                models.find(m => typeof m?.id === 'string' && /claude-sonnet-4-5/i.test(m.id)) ||
                models.find(m => typeof m?.id === 'string' && /claude-sonnet-4/i.test(m.id)) ||
                models.find(m => typeof m?.id === 'string' && /sonnet/i.test(m.id));
            const fallback = models.find(m => typeof m?.id === 'string' && /sonnet/i.test(m.id));
            const picked = preferred?.id || fallback?.id;
            if (picked) {
                cachedModelId = picked;
                return picked;
            }
        }
    } catch {
        // Ignore; we’ll try known IDs below.
    }

    // Known/common Sonnet IDs across API versions.
    // If one returns 404, we try the next.
    const candidates = [
        'claude-sonnet-4-5-20250929',
        'claude-sonnet-4-20250514',
        // Legacy fallbacks (may be retired)
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-sonnet-20240620'
    ];
    cachedModelId = candidates[0];
    return cachedModelId;
}

function clampWords(text, maxWords) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return words.join(' ');
    return words.slice(0, maxWords).join(' ') + '…';
}

function uniq(arr) {
    return Array.from(new Set((arr || []).filter(Boolean)));
}

function safeString(s) {
    return String(s || '').trim();
}

function buildFallbackEnhanced(resumeData) {
    const name = safeString(resumeData?.name);
    const exp0 = resumeData?.experience?.[0];
    const expTitle = safeString(exp0?.title);
    const topSkills = uniq(resumeData?.skills).slice(0, 5);

    const headlineBase = expTitle || (topSkills.length ? 'Professional' : 'Portfolio');
    const headline = topSkills.length
        ? clampWords(`${headlineBase} focused on ${topSkills.slice(0, 3).join(', ')}`, 14)
        : clampWords(`${headlineBase}`, 14);

    const aboutSource = safeString(resumeData?.summary);
    const about = aboutSource
        ? clampWords(aboutSource.replace(/\s+/g, ' '), 120)
        : `Professional portfolio for ${name || 'the candidate'}.`;

    const highlights = [];
    // Use first experience description sentences
    for (const exp of (resumeData?.experience || []).slice(0, 3)) {
        const desc = safeString(exp?.description);
        if (!desc) continue;
        const firstLine = desc.split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
        if (firstLine) highlights.push(clampWords(firstLine, 18));
        if (highlights.length >= 4) break;
    }
    // If none, use skills
    if (highlights.length === 0 && topSkills.length) {
        highlights.push(`Core skills: ${topSkills.slice(0, 5).join(', ')}`);
    }

    const enhancedExperience = (resumeData?.experience || []).map((e) => ({
        title: safeString(e?.title) || 'Role',
        company: safeString(e?.company) || 'Company',
        dates: safeString(e?.dates) || 'Date not specified',
        description: safeString(e?.description) || 'Responsibilities included various professional tasks.'
    }));

    const enhancedProjects = (resumeData?.projects || []).map((p) => ({
        name: safeString(p?.name) || 'Project',
        description: safeString(p?.description) || 'Project details available upon request.',
        technologies: safeString(p?.technologies || '')
    }));

    return {
        headline,
        highlights: highlights.slice(0, 5),
        about,
        enhancedExperience,
        enhancedProjects,
        enhancedCertifications: Array.isArray(resumeData?.certifications) ? resumeData.certifications.filter(Boolean) : [],
        enhancedAwards: Array.isArray(resumeData?.awards) ? resumeData.awards.filter(Boolean) : [],
        enhancedActivities: Array.isArray(resumeData?.activities) ? resumeData.activities.filter(Boolean) : [],
        enhancedPublications: Array.isArray(resumeData?.publications) ? resumeData.publications.filter(Boolean) : [],
        __meta: { mode: 'fallback' }
    };
}

function extractMetricTokens(text) {
    const s = String(text || '');
    const tokens = new Set();

    // Percentages (high hallucination risk)
    for (const m of s.match(/\b\d+(?:[\.,]\d+)?%/g) || []) {
        tokens.add(m.replace(/,/g, ''));
    }

    // Currency amounts (high hallucination risk)
    for (const m of s.match(/(?:USD|MYR|RM|EUR|GBP)\s*\d+(?:[\.,]\d+)?/gi) || []) {
        tokens.add(m.replace(/,/g, '').toUpperCase());
    }
    for (const m of s.match(/[$€£]\s*\d+(?:[\.,]\d+)?/g) || []) {
        tokens.add(m.replace(/,/g, ''));
    }

    return tokens;
}

function containsNewMetricTokens(outputText, inputMetricTokens) {
    const out = extractMetricTokens(outputText);
    for (const t of out) {
        if (!inputMetricTokens.has(t)) return true;
    }
    return false;
}

async function enhanceContent(resumeData) {
    console.log('✨ Enhancing content with Claude API...');

    if (!process.env.ANTHROPIC_API_KEY) {
        console.log('⚠️  ANTHROPIC_API_KEY not set; skipping AI enhancement');
        return buildFallbackEnhanced(resumeData);
    }

    // If proxy env is misconfigured, don’t wait on outbound calls.
    if (hasBlockedLocalProxy()) {
        console.log('⚠️  Outbound proxy misconfigured; skipping Claude enhancement');
        return buildFallbackEnhanced(resumeData);
    }
    
    const prompt = `You are a senior recruiter and resume writer. Rewrite the content to be recruiter-friendly and professional while staying strictly factual.

CRITICAL RULES (anti-hallucination):
- Use ONLY information present in the input resume data.
- Do NOT invent metrics, numbers, company names, job titles, dates, tools, or achievements.
- If a result/impact is not explicitly stated, do NOT fabricate it.
- If you cannot improve a line without inventing facts, keep it close to the original wording and just improve clarity.

STYLE REQUIREMENTS:
- Apply SMART/STAR thinking where possible:
  - Situation/Task/Action/Result: If Result is not present, omit it (do not invent).
- Experience should be 3–5 bullets per role, concise, scannable, action-led.
- Prefer: action verb + what you did + scope/tech + (only if present) outcome.

Resume Data:
${JSON.stringify(resumeData, null, 2)}

Tasks:
1. Write a short, strong headline (8–14 words) for the hero section.
2. Write 3–5 scan-friendly highlights (1 line each). Grounded in input only.
3. Write a professional About (60–90 words). Do NOT include education list, phone, email, or long dumps.
4. Rewrite experience entries into bullet points (3–5 bullets each). Return the field \"description\" as a multi-line string with each bullet on its own line prefixed by \"- \".\n5. Improve project descriptions for clarity without inventing facts.\n6. Rewrite certifications/awards/activities/publications items (if present) to be concise and professional without adding new facts.

Return ONLY valid JSON (no markdown, no code blocks, no explanation):
{
  "headline": "Short headline here...",
  "highlights": ["Highlight 1", "Highlight 2", "Highlight 3"],
  "about": "Professional about paragraph here...",
  "enhancedExperience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "dates": "2020-2023",
      "description": "- Bullet 1\\n- Bullet 2\\n- Bullet 3"
    }
  ],
  "enhancedProjects": [
    {
      "name": "Project Name",
      "description": "Improved description grounded in the input...",
      "technologies": "Comma, separated, tech"
    }
  ],
  "enhancedCertifications": ["Certification 1", "Certification 2"],
  "enhancedAwards": ["Award 1", "Award 2"],
  "enhancedActivities": ["Activity 1", "Activity 2"],
  "enhancedPublications": ["Publication 1"]
}`;

    try {
        const inputMetricTokens = extractMetricTokens(JSON.stringify(resumeData || {}));

        const modelCandidates = [await resolveModelId()];
        // If the resolved model is one of the known candidates, append fallbacks.
        for (const c of [
            'claude-sonnet-4-5-20250929',
            'claude-sonnet-4-20250514',
            'claude-3-7-sonnet-20250219',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-sonnet-20240620'
        ]) {
            if (!modelCandidates.includes(c)) modelCandidates.push(c);
        }

        let lastErr = null;
        let message = null;
        for (const model of modelCandidates) {
            try {
                message = await anthropic.messages.create({
                    model,
                    max_tokens: 2000,
                    messages: [{ role: "user", content: prompt }]
                });
                cachedModelId = model;
                lastErr = null;
                break;
            } catch (err) {
                lastErr = err;
                const msg = err?.message || String(err);
                // Try next model only on model-not-found / 404-like failures
                if (msg.includes('not_found_error') || msg.includes('model') && msg.includes('not_found') || msg.includes('404')) {
                    continue;
                }
                throw err;
            }
        }
        if (!message && lastErr) throw lastErr;
        
        let responseText = message.content[0].text;
        
        // Clean markdown if present
        responseText = responseText.trim();
        if (responseText.startsWith('```json')) {
            responseText = responseText.replace(/```json\n/g, '').replace(/\n```/g, '');
        } else if (responseText.startsWith('```')) {
            responseText = responseText.replace(/```\n/g, '').replace(/\n```/g, '');
        }
        
        const enhanced = JSON.parse(responseText);
        if (!enhanced || typeof enhanced !== 'object') {
            throw new Error('Claude returned invalid JSON object');
        }
        if (!Array.isArray(enhanced.highlights)) enhanced.highlights = [];
        if (typeof enhanced.headline !== 'string') enhanced.headline = '';
        if (typeof enhanced.about !== 'string') enhanced.about = '';
        if (!Array.isArray(enhanced.enhancedExperience)) enhanced.enhancedExperience = [];
        if (!Array.isArray(enhanced.enhancedProjects)) enhanced.enhancedProjects = [];
        if (!Array.isArray(enhanced.enhancedCertifications)) enhanced.enhancedCertifications = [];
        if (!Array.isArray(enhanced.enhancedAwards)) enhanced.enhancedAwards = [];
        if (!Array.isArray(enhanced.enhancedActivities)) enhanced.enhancedActivities = [];
        if (!Array.isArray(enhanced.enhancedPublications)) enhanced.enhancedPublications = [];
        enhanced.__meta = { mode: 'claude', model: cachedModelId };

        // No-hallucination guard: reject if Claude introduced numbers not present in input.
        const outputText =
            JSON.stringify({
                headline: enhanced.headline,
                highlights: enhanced.highlights,
                about: enhanced.about,
                enhancedExperience: enhanced.enhancedExperience,
                enhancedProjects: enhanced.enhancedProjects,
                enhancedCertifications: enhanced.enhancedCertifications,
                enhancedAwards: enhanced.enhancedAwards,
                enhancedActivities: enhanced.enhancedActivities,
                enhancedPublications: enhanced.enhancedPublications
            }) || '';
        if (containsNewMetricTokens(outputText, inputMetricTokens)) {
            const fallback = buildFallbackEnhanced(resumeData);
            fallback.__meta = {
                mode: 'fallback',
                error: 'Claude output contained new metric tokens (%/currency) not present in input; rejected to avoid hallucination.'
            };
            return fallback;
        }
        
        console.log('✅ Content enhanced');
        console.log(`   Input tokens: ${message.usage.input_tokens}`);
        console.log(`   Output tokens: ${message.usage.output_tokens}`);
        
        const cost = (message.usage.input_tokens * 3 + message.usage.output_tokens * 15) / 1000000;
        console.log(`   Cost: $${cost.toFixed(4)}`);
        
        return enhanced;
        
    } catch (error) {
        console.error('❌ Claude API error:', error.message);
        const fallback = buildFallbackEnhanced(resumeData);
        fallback.__meta = { mode: 'fallback', error: error?.message || String(error) };
        return fallback;
    }
}

module.exports = { enhanceContent };
