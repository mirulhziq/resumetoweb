const JSZip = require('jszip');
const fs = require('fs').promises;
const path = require('path');

function sanitizeFilenamePart(input, fallback = 'unknown') {
    const s = String(input || '').trim();
    const cleaned = s
        // Windows + general filesystem invalid chars
        .replace(/[<>:\"/\\|?*\u0000-\u001F]/g, '')
        // collapse whitespace
        .replace(/\s+/g, ' ')
        .trim();
    const safe = cleaned || fallback;
    // keep filenames readable + manageable
    return safe.slice(0, 60);
}

function getEmailLocalPart(email) {
    const s = String(email || '');
    const at = s.indexOf('@');
    return at > 0 ? s.slice(0, at) : s;
}

async function createZIP(htmlContent, pdfPath, saleId, meta = {}) {
    console.log('📦 Creating ZIP file...');
    
    const zip = new JSZip();
    
    // Add HTML
    zip.file('index.html', htmlContent);
    
    // Add README
    const readme = `
🎉 Your Professional Portfolio Website

FILES INCLUDED:
- index.html: Your complete portfolio
- README.txt: This file
- resume.pdf: Your original resume (if available)

HOW TO HOST (FREE):

Option 1: Netlify Drop (Fastest)
1. Go to app.netlify.com/drop
2. Drag this folder
3. Get instant URL

Option 2: Vercel
1. Go to vercel.com/new
2. Upload this folder
3. Get instant URL

Option 3: GitHub Pages
1. Create repo: yourusername.github.io
2. Upload index.html
3. Visit yourusername.github.io

Questions? Reply to the email!

Built with ResumeToWeb.com 🚀
    `;
    
    zip.file('README.txt', readme);
    
    // Add PDF if exists
    try {
        const pdfBuffer = await fs.readFile(pdfPath);
        zip.file('resume.pdf', pdfBuffer);
    } catch (error) {
        console.log('⚠️  PDF not found, skipping');
    }
    
    // Generate ZIP
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    
    // Save
    const customerName = sanitizeFilenamePart(meta.customerName, 'Customer');
    const emailLocal = sanitizeFilenamePart(getEmailLocalPart(meta.email), 'email');
    const zipBasename = `${customerName}_${emailLocal}--${saleId}.zip`;
    const zipPath = path.join(__dirname, '../../temp', zipBasename);
    await fs.mkdir(path.dirname(zipPath), { recursive: true });
    await fs.writeFile(zipPath, zipBuffer);
    
    console.log('✅ ZIP created:', zipPath);
    
    return { zipPath, zipBasename };
}

module.exports = { createZIP };
