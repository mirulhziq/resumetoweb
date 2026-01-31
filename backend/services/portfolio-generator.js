const { parseResumePDF } = require('./apify-client');
const { enhanceContent } = require('./claude-enhancer');
const { buildPortfolio } = require('./template-builder');
const { deployToVercel } = require('./vercel-deployer');
const { createZIP } = require('./zip-creator');
const { generateToken, saveLink } = require('./download-token');
const { sendSuccessEmail, sendAdminAlertEmail } = require('./email-sender');
const { updateStatus } = require('./order-tracker');
const { extractResumeDataFromText } = require('./resume-extractor');
const path = require('path');
const fs = require('fs').promises;

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

async function parseLocalResumeData(pdfFilePath) {
    const buffer = await fs.readFile(pdfFilePath);
    const pdfData = await parsePdfBuffer(buffer);
    const extractedText = typeof pdfData?.text === 'string' ? pdfData.text : '';
    return extractResumeDataFromText(extractedText);
}

async function generatePortfolio(email, saleId, position, pdfFilename, photoFilename) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎨 Generating portfolio for ${email}`);
    console.log(`   Position: #${position}/50`);
    console.log(`${'='.repeat(60)}\n`);
    
    try {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
        await updateStatus(saleId, 'parsing', { steps: { parsing: new Date().toISOString() } });

        // Step 1: Parse PDF with Apify
        console.log('Step 1/6: Parsing PDF with Apify...');
        // Use provided filename or fallback to saleId (legacy behavior)
        const actualFilename = pdfFilename || `${saleId}.pdf`;
        const pdfUrl = `${backendUrl}/uploads/${actualFilename}`;
        let resumeData;
        let parsingMode = 'apify';
        try {
            const localPdfPath = path.join(__dirname, '../uploads', actualFilename);
            const apifyResult = await parseResumePDF(pdfUrl, { pdfPath: localPdfPath });
            resumeData = apifyResult.data;
        } catch (error) {
            parsingMode = 'local';
            console.log('⚠️  Apify parse failed, using local PDF parsing for test mode');
            const localPdfPath = path.join(__dirname, '../uploads', actualFilename);
            resumeData = await parseLocalResumeData(localPdfPath);
        }
        await updateStatus(saleId, 'parsing', {
            parsingMode,
            customerName: resumeData?.name || '',
            steps: { parsing: new Date().toISOString() }
        });
        
        // Step 2: Enhance content with Claude
        await updateStatus(saleId, 'enhancing', { steps: { enhancing: new Date().toISOString() } });
        console.log('Step 2/6: Enhancing content with Claude...');
        const enhanced = await enhanceContent(resumeData);
        const aiEnhancementMode = enhanced?.__meta?.mode || 'fallback';
        const aiEnhancementError = enhanced?.__meta?.error;
        const aiModelUsed = enhanced?.__meta?.model || null;
        const aiWarnings = [];
        if (aiEnhancementMode !== 'claude') aiWarnings.push('AI_ENHANCEMENT_FALLBACK');
        if (aiEnhancementError) aiWarnings.push('CLAUDE_FAILED');
        if (aiWarnings.length) {
            await updateStatus(saleId, 'enhancing', {
                aiEnhancementMode,
                aiEnhancementError,
                aiModelUsed,
                warnings: aiWarnings
            });
        } else {
            await updateStatus(saleId, 'enhancing', { aiEnhancementMode, aiModelUsed });
        }
        
        // Step 3: Build portfolio from template
        await updateStatus(saleId, 'building', { steps: { building: new Date().toISOString() } });
        console.log('Step 3/6: Building portfolio...');
        const photoUrl = photoFilename ? `${backendUrl}/uploads/${photoFilename}` : undefined;
        let html;
        try {
            html = await buildPortfolio(resumeData, enhanced, { photoUrl });
        } catch (buildErr) {
            const msg = buildErr?.message || String(buildErr);
            await updateStatus(saleId, 'building', {
                warnings: ['TEMPLATE_BUILD_FAILED'],
                templateBuildError: msg
            });
            // Minimal monochrome fallback HTML (always succeeds)
            const safeName = String(resumeData?.name || 'Portfolio').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeHeadline = String(enhanced?.headline || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeAbout = String(enhanced?.about || resumeData?.summary || '')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n\s*\n+/g, '\n\n')
                .trim();
            html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeName} | Portfolio</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial;line-height:1.65;color:#0b0b0f;background:#fff;margin:0}
    .wrap{max-width:900px;margin:0 auto;padding:40px 20px}
    h1{font-size:44px;letter-spacing:-0.03em;line-height:1.1;margin:0 0 12px}
    .muted{color:#5a5a66;font-weight:600}
    .card{border:1px solid rgba(0,0,0,0.12);border-radius:16px;padding:18px 18px;margin-top:18px}
    p{margin:0 0 12px}
    .hr{height:1px;background:rgba(0,0,0,0.10);margin:18px 0}
    a{color:#0b0b0f;text-decoration:underline;text-underline-offset:3px}
    pre{white-space:pre-wrap}
  </style>
</head>
<body>
  <main class="wrap">
    <h1>${safeName}</h1>
    <div class="muted">${safeHeadline}</div>
    <div class="card">
      <div class="muted">About</div>
      <div class="hr"></div>
      <pre>${safeAbout}</pre>
    </div>
  </main>
</body>
</html>`;
        }
        
        // Step 4 & 5: Deploy + Create ZIP (parallel)
        await updateStatus(saleId, 'deploying', { steps: { deploying: new Date().toISOString() } });
        console.log('Steps 4-5/6: Deploying + Creating ZIP...');
        const [deploySettled, zipSettled] = await Promise.allSettled([
            deployToVercel(html, saleId),
            createZIP(
                html,
                // Uploaded files live in backend/uploads
                path.join(__dirname, '../uploads', actualFilename),
                saleId,
                { customerName: resumeData?.name, email }
            )
        ]);

        const zipResult = zipSettled.status === 'fulfilled' ? zipSettled.value : null;
        const zipPath = zipResult?.zipPath;
        const zipBasename = zipResult?.zipBasename;

        // If deploy failed, still persist ZIP link for admin/customer while reporting failure.
        if (deploySettled.status === 'rejected') {
            const deployErrorMsg = deploySettled?.reason?.message || String(deploySettled?.reason || 'Deploy failed');
            let downloadUrl = null;
            if (zipPath) {
                const token = await generateToken(email, saleId);
                downloadUrl = `${backendUrl}/download/${token}`;
                await saveLink({
                    token,
                    email,
                    saleId,
                    zipBasename: zipBasename || null,
                    downloads: 0,
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                });
            }

            await updateStatus(saleId, 'deploying', {
                deployMode: 'vercel',
                deployError: deployErrorMsg,
                ...(zipPath ? { zipPath, zipBasename: zipBasename || null, downloadUrl } : {}),
                warnings: ['DEPLOY_FAILED']
            });

            try {
                await sendAdminAlertEmail({
                    subject: `❌ Deploy failed - Order ${saleId}`,
                    title: 'Deployment failed',
                    orderId: saleId,
                    customerEmail: email,
                    details: deployErrorMsg
                });
            } catch (adminErr) {
                await updateStatus(saleId, 'deploying', {
                    adminEmailError: adminErr?.message || String(adminErr),
                    warnings: ['ADMIN_ALERT_FAILED']
                });
            }

            throw new Error(deployErrorMsg);
        }

        const deployResult = deploySettled.value;
        const vercelUrl = deployResult?.url;
        const deployMode = deployResult?.mode || 'vercel';
        const deployError = deployResult?.error;
        const deploymentId = deployResult?.deploymentId || null;
        const adminMessage = deployResult?.adminMessage || null;

        const warnings = [];
        if (deployMode !== 'vercel') warnings.push('DEPLOY_NOT_VERCEL');
        if (deployError) warnings.push('DEPLOY_ERROR_RECORDED');
        if (adminMessage) warnings.push('ADMIN_CONTACT_PROVIDED');
        if (warnings.length) {
            await updateStatus(saleId, 'deploying', {
                deployMode,
                deployError,
                deploymentId,
                warnings
            });
            try {
                await sendAdminAlertEmail({
                    subject: `⚠️ Deploy issue - Order ${saleId}`,
                    title: 'Deployment issue detected',
                    orderId: saleId,
                    customerEmail: email,
                    details: deployError || 'Unknown deploy error'
                });
            } catch (adminErr) {
                await updateStatus(saleId, 'deploying', {
                    adminEmailError: adminErr?.message || String(adminErr),
                    warnings: ['ADMIN_ALERT_FAILED']
                });
            }
        } else {
            await updateStatus(saleId, 'deploying', { deployMode, deploymentId });
        }
        
        // Step 6: Generate download link
        console.log('Step 6/6: Generating download link...');
        const token = await generateToken(email, saleId);
        const downloadUrl = `${backendUrl}/download/${token}`;
        
        await saveLink({
            token,
            email,
            saleId,
            zipBasename: zipBasename || null,
            downloads: 0,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        });
        
        // Send success email
        let completionEmail = null;
        let emailError = null;
        try {
            completionEmail = await sendSuccessEmail({
                email,
                vercelUrl,
                downloadUrl,
                position
            });
        } catch (err) {
            emailError = err?.message || String(err);
            await updateStatus(saleId, 'deploying', {
                warnings: ['EMAIL_SEND_FAILED'],
                emailError
            });
            try {
                await sendAdminAlertEmail({
                    subject: `⚠️ Customer email failed - Order ${saleId}`,
                    title: 'Customer success email failed',
                    orderId: saleId,
                    customerEmail: email,
                    details: emailError
                });
            } catch (adminErr) {
                await updateStatus(saleId, 'deploying', {
                    adminEmailError: adminErr?.message || String(adminErr),
                    warnings: ['ADMIN_ALERT_FAILED']
                });
            }
        }

        // If deployment fell back to local, show the admin contact message
        const customerMessage = adminMessage || '';

        await updateStatus(saleId, 'completed', {
            vercelUrl,
            downloadUrl,
            zipPath,
            zipBasename: zipBasename || null,
            deployMode,
            deploymentId,
            ...(deployError ? { deployError } : {}),
            ...(emailError ? { emailError } : {}),
            ...(customerMessage ? { customerMessage } : {}),
            ...(adminMessage ? { adminMessage } : {}),
            steps: { completed: new Date().toISOString() },
            ...(completionEmail
                ? {
                      emails: {
                          completed: {
                              subject: completionEmail.subject,
                              html: completionEmail.html,
                              preview: completionEmail.preview
                          }
                      }
                  }
                : {})
        });
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`✅ Portfolio complete!`);
        console.log(`   Live: ${vercelUrl}`);
        console.log(`   Download: ${downloadUrl}`);
        console.log(`${'='.repeat(60)}\n`);
        
        return { vercelUrl, downloadUrl, position };
        
    } catch (error) {
        const adminContactMessage = `You may contact admin with this number: 011 1535 0810`;
        await updateStatus(saleId, 'failed', { 
            error: error.message,
            adminMessage: adminContactMessage,
            customerMessage: adminContactMessage
        });
        console.error(`\n${'='.repeat(60)}`);
        console.error(`❌ ERROR: ${error.message}`);
        console.error(`${'='.repeat(60)}\n`);
        throw error;
    }
}

module.exports = { generatePortfolio };
