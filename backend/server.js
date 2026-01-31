require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { validateResume } = require('./services/resume-validator');
const { updateStatus, getStatus } = require('./services/order-tracker');
const { generatePortfolio } = require('./services/portfolio-generator');
const counter = require('./services/purchase-counter');
const { sendOrderConfirmedEmail } = require('./services/email-sender');
const downloadRouter = require('./routes/download');
const statusRouter = require('./routes/status');
const toyyibpayRouter = require('./routes/toyyibpay');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For ToyyibPay callbacks
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use('/generated', express.static('generated'));

// Serve frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const generatedDir = path.join(__dirname, 'generated');
const logsDir = path.join(__dirname, 'logs');
const dataDir = path.join(__dirname, 'data');

// Create directories
async function ensureDirectories() {
    try {
        await fs.mkdir(uploadsDir, { recursive: true });
        await fs.mkdir(generatedDir, { recursive: true });
        await fs.mkdir(logsDir, { recursive: true });
        await fs.mkdir(dataDir, { recursive: true });
        await counter.initialize();
        console.log('Directories initialized successfully');
    } catch (err) {
        console.error('Directory init error (non-fatal):', err.message);
    }
}

ensureDirectories().catch(err => console.error('ensureDirectories failed:', err));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
            return;
        }
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
            return;
        }
        cb(new Error('Only PDF and image files are allowed'), false);
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Routes
app.get('/api/status', (req, res) => {
    res.json({ status: 'Backend is running' });
});

app.get('/api/debug/env', (req, res) => {
    res.json({
        hasBackendUrl: Boolean(process.env.BACKEND_URL),
        hasVercelToken: Boolean(process.env.VERCEL_TOKEN),
        hasApifyToken: Boolean(process.env.APIFY_API_TOKEN),
        hasApifyActorId: Boolean(process.env.APIFY_ACTOR_ID),
        hasClaudeKey: Boolean(process.env.ANTHROPIC_API_KEY),
        emailPreviewMode: String(process.env.EMAIL_PREVIEW_MODE || '').toLowerCase() === 'true'
    });
});

app.use('/download', downloadRouter);
app.use('/api/status', statusRouter);
app.use('/api/toyyibpay', toyyibpayRouter);
// Serve locally generated pages
app.use('/generated', express.static(path.join(__dirname, 'generated')));

// Upload endpoint with validation
app.post('/api/upload', upload.fields([{ name: 'resume', maxCount: 1 }, { name: 'photo', maxCount: 1 }]), async (req, res) => {
    try {
        const resumeFile = req.files?.resume?.[0];
        const photoFile = req.files?.photo?.[0];

        if (!resumeFile) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        if (resumeFile.mimetype !== 'application/pdf') {
            await fs.unlink(resumeFile.path).catch(() => {});
            if (photoFile?.path) await fs.unlink(photoFile.path).catch(() => {});
            return res.status(400).json({ error: 'Resume must be a PDF' });
        }
        if (photoFile) {
            if (!photoFile.mimetype.startsWith('image/')) {
                await fs.unlink(photoFile.path).catch(() => {});
                return res.status(400).json({ error: 'Headshot must be an image' });
            }
            if (photoFile.size > 5 * 1024 * 1024) {
                await fs.unlink(photoFile.path).catch(() => {});
                return res.status(400).json({ error: 'Headshot too large (max 5MB)' });
            }
        }
        
        // Enhanced PDF Validation
        const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
        const validation = await validateResume(resumeFile.path, {
            enableApifyFallback: true,
            backendUrl,
            filename: resumeFile.filename
        });
        
        if (!validation.isValid) {
            // Cleanup invalid file
            await fs.unlink(resumeFile.path).catch(() => {});
            if (photoFile?.path) await fs.unlink(photoFile.path).catch(() => {});
            return res.status(400).json({ 
                success: false, 
                error: validation.error || 'Invalid resume format'
            });
        }

        const fileUrl = `${backendUrl}/uploads/${resumeFile.filename}`;
        
        res.json({
            success: true,
            fileUrl,
            filename: resumeFile.filename,
            photoFilename: photoFile?.filename || null,
            message: 'Resume validated and uploaded successfully',
            validation: validation.validation
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Upload failed: ' + error.message 
        });
    }
});

// Simulate payment endpoint (bypass Gumroad for testing)
app.post('/api/simulate-payment', async (req, res) => {
    try {
        const { email, filename, photoFilename } = req.body;
        
        if (!filename) {
            return res.status(400).json({ error: 'Filename required' });
        }
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email required' });
        }

        const orderId = uuidv4();
        let position;
        try {
            position = await counter.incrementCounter(email, orderId);
        } catch (err) {
            if (err && err.message === 'SOLD_OUT') {
                return res.status(400).json({ error: 'SOLD_OUT' });
            }
            throw err;
        }

        const etaMinutes = 3;
        await updateStatus(orderId, 'queued', {
            email,
            filename,
            photoFilename: photoFilename || null,
            position,
            etaMinutes,
            createdAt: new Date().toISOString(),
            steps: { queued: new Date().toISOString() }
        });

        try {
            const confirmation = await sendOrderConfirmedEmail({
                email,
                orderId,
                etaMinutes,
                amount: '0.00',
                currency: 'USD'
            });
            await updateStatus(orderId, 'queued', {
                emails: {
                    confirmation: {
                        subject: confirmation.subject,
                        html: confirmation.html,
                        preview: confirmation.preview
                    }
                }
            });
        } catch (emailError) {
            await updateStatus(orderId, 'queued', {
                emailError: emailError?.message || String(emailError)
            });
        }

        // Start portfolio generation process
        setImmediate(async () => {
            try {
                await generatePortfolio(email, orderId, position, filename, photoFilename || null);
            } catch (error) {
                console.error('Portfolio generation error:', error);
                await updateStatus(orderId, 'failed', { error: error.message });
            }
        });

        res.json({
            success: true,
            orderId,
            saleId: orderId,
            position,
            etaMinutes,
            message: 'Started in test mode'
        });
    } catch (error) {
        console.error('Payment simulation error:', error);
        res.status(500).json({ 
            error: 'Payment simulation failed: ' + error.message 
        });
    }
});

// Check generation status
app.get('/api/status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const status = await getStatus(orderId);
        
        res.json(status);
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ 
            error: 'Status check failed: ' + error.message 
        });
    }
});

app.get('/api/order/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const status = await getStatus(orderId);
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: 'Order lookup failed: ' + error.message });
    }
});

app.get('/api/order/:orderId/emails', async (req, res) => {
    try {
        const { orderId } = req.params;
        const status = await getStatus(orderId);
        res.json(status?.emails || {});
    } catch (error) {
        res.status(500).json({ error: 'Email lookup failed: ' + error.message });
    }
});

// Download endpoint
app.get('/api/download/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        // Simple token validation - in production, use proper token management
        const filePath = path.join(__dirname, 'generated', `${token}.zip`);
        
        if (!await fileExists(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.download(filePath, `portfolio-${token}.zip`);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ 
            error: 'Download failed: ' + error.message 
        });
    }
});

// Helper function to check if file exists
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

// Catch-all: serve frontend for non-API routes
app.get('*', (req, res) => {
    // Don't serve index.html for API routes or static files
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.startsWith('/generated/') || req.path.startsWith('/download/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large (max 10MB)' });
        }
        return res.status(400).json({ error: 'File upload error: ' + error.message });
    }
    
    res.status(500).json({ 
        error: 'Internal server error: ' + error.message 
    });
});

// Start server - bind to 0.0.0.0 for Railway/Docker
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n╔════════════════════════════════════╗');
    console.log('║  Resume to Web API Running        ║'); 
    console.log('║  Port:', PORT.toString().padEnd(21, ' '), '║');
    console.log('║  Host: 0.0.0.0                    ║');
    console.log('╚════════════════════════════════════╝\n');
});
