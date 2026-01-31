const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { getLink, incrementDownloads } = require('../services/download-token');

router.get('/:token', async (req, res) => {
    const { token } = req.params;
    
    try {
        const link = await getLink(token);
        
        if (!link) {
            return res.status(404).send('<h1>Link Not Found</h1><p>Check your email for correct link.</p>');
        }
        
        // Check expiration
        if (new Date() > new Date(link.expiresAt)) {
            return res.status(410).send('<h1>Link Expired</h1><p>Links expire after 30 days.</p>');
        }
        
        // Check download limit
        if (link.downloads >= 10) {
            return res.status(429).send('<h1>Download Limit Reached</h1><p>Maximum 10 downloads.</p>');
        }
        
        // Get file
        const zipBasename = link.zipBasename || `${link.saleId}.zip`;
        const zipPath = path.join(__dirname, '../../temp', zipBasename);
        
        try {
            await fs.access(zipPath);
        } catch {
            // Legacy fallback (older links didn’t store zipBasename)
            const legacyZipPath = path.join(__dirname, '../../temp', `${link.saleId}.zip`);
            try {
                await fs.access(legacyZipPath);
                // Send legacy file with the friendly name if we have it, else the legacy name.
                return res.download(legacyZipPath, zipBasename);
            } catch {
                return res.status(404).send('<h1>File Not Found</h1><p>Contact support.</p>');
            }
        }
        
        // Increment counter
        await incrementDownloads(token);
        
        // Send file
        res.download(zipPath, zipBasename);
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).send('<h1>Error</h1><p>Download failed.</p>');
    }
});

module.exports = router;
