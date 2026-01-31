const fs = require('fs').promises;
const { parseResumePDF } = require('./apify-client');

async function parsePdfBuffer(pdfBuffer) {
    const mod = require('pdf-parse');
    if (typeof mod === 'function') return await mod(pdfBuffer);
    if (typeof mod?.default === 'function') return await mod.default(pdfBuffer);
    if (typeof mod?.PDFParse === 'function') {
        const pdf = new mod.PDFParse({ data: pdfBuffer });
        try {
            await pdf.load();
            const textResult = await pdf.getText();
            const text = typeof textResult === 'string' ? textResult : (textResult?.text ?? '');
            return { text };
        } finally {
            if (typeof pdf.destroy === 'function') {
                await pdf.destroy();
            }
        }
    }
    throw new TypeError('Unsupported pdf-parse export shape');
}

/**
 * Validates a resume PDF file with detailed logging
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<{isValid: boolean, text: string, validation: {education: boolean, experience: boolean, skills: boolean}, error?: string}>}
 */
async function validateResume(filePath, options = {}) {
    try {
        console.log('=== PDF VALIDATION START ===');
        console.log('File path:', filePath);
        
        // Read PDF file
        const pdfBuffer = await fs.readFile(filePath);
        console.log('PDF buffer size:', pdfBuffer.length, 'bytes');
        
        // Parse PDF - fix import issue
        let pdfData;
        try {
            pdfData = await parsePdfBuffer(pdfBuffer);
            console.log('PDF parsed successfully');
            const extractedText = typeof pdfData?.text === 'string' ? pdfData.text : '';
            console.log('Extracted text length:', extractedText.length);
        } catch (parseError) {
            console.error('PDF Parse Error:', parseError);
            const parseErrorMessage = (parseError && parseError.message) ? parseError.message : String(parseError);
            const isParserMisconfigured =
                parseErrorMessage.includes('Unsupported pdf-parse export shape') ||
                parseErrorMessage.includes('pdf-parse export is not a function') ||
                parseErrorMessage.includes('pdfParse is not a function') ||
                parseErrorMessage.includes('export is not a function');

            if (options.enableApifyFallback && options.backendUrl && options.filename) {
                try {
                    console.log('Local PDF parse failed; trying Apify fallback...');
                    const pdfUrl = `${options.backendUrl}/uploads/${options.filename}`;
                    const apifyResult = await parseResumePDF(pdfUrl, { pdfPath: filePath });
                    const isValidFromApify = Boolean(apifyResult?.success && apifyResult?.data);
                    return {
                        isValid: isValidFromApify,
                        text: '',
                        validation: { education: true, experience: true, skills: true },
                        error: isValidFromApify ? undefined : 'Could not extract resume from PDF. Try exporting the PDF again.'
                    };
                } catch (apifyError) {
                    console.error('Apify fallback error:', apifyError?.message || apifyError);
                }
            }
            return {
                isValid: false,
                text: '',
                validation: { education: false, experience: false, skills: false },
                error: isParserMisconfigured
                    ? 'Server PDF parser is misconfigured. Please restart the backend or reinstall dependencies.'
                    : 'Invalid PDF file format'
            };
        }

        const extractedText = typeof pdfData?.text === 'string' ? pdfData.text : '';
        const text = extractedText.toLowerCase();
        const wordCount = text.split(/\s+/).filter(word => word.length > 2).length;
        console.log('Total word count:', wordCount);
        
        // Check minimum content length
        if (wordCount < 50) {
            console.log('REJECTED: Too short (', wordCount, 'words)');
            if (options.enableApifyFallback && options.backendUrl && options.filename) {
                try {
                    console.log('PDF text is too short; trying Apify fallback...');
                    const pdfUrl = `${options.backendUrl}/uploads/${options.filename}`;
                    const apifyResult = await parseResumePDF(pdfUrl, { pdfPath: filePath });
                    const isValidFromApify = Boolean(apifyResult?.success && apifyResult?.data);
                    return {
                        isValid: isValidFromApify,
                        text: extractedText,
                        validation: { education: true, experience: true, skills: true },
                        error: isValidFromApify ? undefined : 'Resume text could not be extracted. If this is a scanned PDF, export it with selectable text.'
                    };
                } catch (apifyError) {
                    console.error('Apify fallback error:', apifyError?.message || apifyError);
                }
            }
            return {
                isValid: false,
                text: extractedText,
                validation: { education: false, experience: false, skills: false },
                error: 'Resume too short (minimum 50 words required)'
            };
        }

        // Enhanced keyword detection for resume sections
        const educationKeywords = [
            'education', 'university', 'college', 'degree', 'bachelor', 'master', 'phd',
            'school', 'academic', 'graduation', 'gpa', 'major', 'minor'
        ];
        
        const experienceKeywords = [
            'experience', 'work', 'employment', 'job', 'position', 'role',
            'company', 'employer', 'responsibilities', 'achievements',
            'internship', 'intern', 'volunteer', 'freelance'
        ];
        
        const skillsKeywords = [
            'skills', 'technologies', 'competencies', 'abilities',
            'programming', 'languages', 'tools', 'software', 'frameworks',
            'certifications', 'courses'
        ];

        // Check for sections with detailed logging
        const foundEducation = educationKeywords.filter(keyword => text.includes(keyword));
        const foundExperience = experienceKeywords.filter(keyword => text.includes(keyword));
        const foundSkills = skillsKeywords.filter(keyword => text.includes(keyword));

        console.log('Education keywords found:', foundEducation);
        console.log('Experience keywords found:', foundExperience);
        console.log('Skills keywords found:', foundSkills);

        const hasEducation = foundEducation.length > 0;
        const hasExperience = foundExperience.length > 0;
        const hasSkills = foundSkills.length > 0;

        console.log('Section detection results:');
        console.log('  Education:', hasEducation);
        console.log('  Experience:', hasExperience);
        console.log('  Skills:', hasSkills);

        // Determine validity - require at least education OR experience
        const isValid = hasEducation || hasExperience;

        console.log('Final validation result:', isValid ? 'VALID' : 'INVALID');
        console.log('=== PDF VALIDATION END ===');

        return {
            isValid,
            text: extractedText,
            validation: {
                education: hasEducation,
                experience: hasExperience,
                skills: hasSkills
            },
            error: isValid ? undefined : 'Resume missing key sections (Education or Experience). Please upload a standard resume.'
        };

    } catch (error) {
        console.error('Resume Validation Error:', error);
        return {
            isValid: false,
            text: '',
            validation: { education: false, experience: false, skills: false },
            error: 'Failed to validate resume: ' + error.message
        };
    }
}

module.exports = { validateResume };
