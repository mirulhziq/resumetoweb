const nodemailer = require('nodemailer');

const previewMode = String(process.env.EMAIL_PREVIEW_MODE || '').toLowerCase() === 'true';
const emailPortRaw = process.env.EMAIL_PORT;
const emailPort = emailPortRaw ? parseInt(emailPortRaw, 10) : undefined;
const resolvedEmailPort = Number.isFinite(emailPort) ? emailPort : 587;

const transporter = previewMode
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: resolvedEmailPort,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

async function sendEmail({ to, subject, html }) {
    if (previewMode) {
        return { preview: true, to, subject, html };
    }

    await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        html
    });

    return { preview: false, to, subject, html };
}

function buildAdminAlertEmailHtml({ title, orderId, email, details }) {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    .container { max-width: 720px; margin: 0 auto; padding: 20px; }
    .header { background: #111827; color: white; padding: 20px; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; font-size: 13px; background: #111827; color: #f9fafb; padding: 12px; border-radius: 10px; overflow-x: auto; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .row:last-child { border-bottom: none; }
    .muted { color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0;">${title}</h2>
      <div class="muted" style="margin-top:6px;color:#d1d5db;">ResumeToWeb admin alert</div>
    </div>
    <div class="content">
      <div class="row"><div>Order ID</div><div><strong>${orderId || ''}</strong></div></div>
      <div class="row"><div>Customer email</div><div><strong>${email || ''}</strong></div></div>
      <div class="row"><div>Time</div><div>${new Date().toISOString()}</div></div>
      <p class="muted" style="margin-top:16px;margin-bottom:10px;">Details</p>
      <div class="mono">${escapeHtml(String(details || ''))}</div>
    </div>
  </div>
</body>
</html>
    `;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function sendAdminAlertEmail({ subject, title, orderId, customerEmail, details }) {
    const to = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    if (!to) {
        throw new Error('ADMIN_EMAIL/EMAIL_USER not set');
    }
    const html = buildAdminAlertEmailHtml({
        title: title || subject || 'Alert',
        orderId,
        email: customerEmail,
        details
    });
    return await sendEmail({
        to,
        subject: subject || 'ResumeToWeb Admin Alert',
        html
    });
}

function buildSuccessEmailHtml({ vercelUrl, downloadUrl, position }) {
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Your Portfolio is Ready!</h1>
        </div>
        <div class="content">
            <p>Hi there!</p>
            
            <p>Your professional portfolio is live! You're customer <strong>#${position}/50</strong>. 🚀</p>
            
            <h2>📍 Live Website (30 Days)</h2>
            <p><a href="${vercelUrl}" class="button">View Portfolio →</a></p>
            <p><small>${vercelUrl}</small></p>
            
            <h2>📦 Download Package (Forever)</h2>
            <p><a href="${downloadUrl}" class="button">Download ZIP →</a></p>
            <p><small>Valid for 30 days, 10 downloads max</small></p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
            
            <h3>What's Inside?</h3>
            <ul>
                <li>Complete portfolio (HTML/CSS)</li>
                <li>Original resume PDF</li>
                <li>Hosting instructions</li>
            </ul>
            
            <h3>Quick Hosting</h3>
            <ol>
                <li>Download ZIP</li>
                <li>Go to <a href="https://app.netlify.com/drop">Netlify Drop</a></li>
                <li>Drag folder</li>
                <li>Get permanent URL!</li>
            </ol>
            
            <p>Questions? Reply to this email!</p>
            
            <p>Best,<br>ResumeToWeb Team</p>
        </div>
        <div class="footer">
            <p>Built with ResumeToWeb.com 🚀</p>
        </div>
    </div>
</body>
</html>
    `;
}

function buildOrderConfirmedEmailHtml({ orderId, etaMinutes, amount, currency }) {
    const createdAt = new Date().toISOString();
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #111827; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 24px; }
        .card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
        .row:last-child { border-bottom: none; }
        .muted { color: #6b7280; font-size: 13px; }
        .pill { display: inline-block; background: #dbeafe; color: #1d4ed8; padding: 6px 10px; border-radius: 999px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Order Confirmed</h1>
            <div class="pill">Test Mode (payment bypassed)</div>
        </div>
        <div class="content">
            <p>We received your resume and started generating your portfolio.</p>
            <div class="card">
                <div class="row"><div>Order ID</div><div><strong>${orderId}</strong></div></div>
                <div class="row"><div>Created</div><div>${createdAt}</div></div>
                <div class="row"><div>Amount</div><div><strong>${currency} ${amount}</strong></div></div>
                <div class="row"><div>Estimated completion</div><div><strong>${etaMinutes} minutes</strong></div></div>
            </div>
            <p class="muted" style="margin-top: 14px;">You’ll receive a second email when your site is deployed and your ZIP is ready.</p>
            <p>ResumeToWeb Team</p>
        </div>
    </div>
</body>
</html>
    `;
}

async function sendSuccessEmail({ email, vercelUrl, downloadUrl, position }) {
    console.log('📧 Sending success email to', email);
    
    const html = buildSuccessEmailHtml({ vercelUrl, downloadUrl, position });
    const result = await sendEmail({
        to: email,
        subject: `🎉 Portfolio Ready! (Customer #${position}/50)`,
        html
    });
    console.log(result.preview ? '✅ Email preview generated' : '✅ Email sent');
    return result;
}

async function sendOrderConfirmedEmail({ email, orderId, etaMinutes, amount, currency }) {
    console.log('📧 Sending order confirmation email to', email);
    const html = buildOrderConfirmedEmailHtml({ orderId, etaMinutes, amount, currency });
    const result = await sendEmail({
        to: email,
        subject: `✅ Order Confirmed (Order ${orderId})`,
        html
    });
    console.log(result.preview ? '✅ Email preview generated' : '✅ Email sent');
    return result;
}

async function sendSoldOutEmail(email) {
    const html = `
<html>
<body style="font-family: Arial; padding: 20px;">
    <h1>😔 We're Sold Out</h1>
    <p>Thanks for your purchase! Unfortunately we've hit our 50-customer limit.</p>
    <p>Your payment will be refunded in 3-5 days.</p>
    <p>Want to join the waitlist? Reply "Notify me"!</p>
    <p>Best,<br>ResumeToWeb Team</p>
</body>
</html>
    `;
    
    const result = await sendEmail({
        to: email,
        subject: '😔 Sold Out - Refund Processing',
        html
    });
    return result;
}

module.exports = { sendSuccessEmail, sendOrderConfirmedEmail, sendSoldOutEmail, sendAdminAlertEmail };
