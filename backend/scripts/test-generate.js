const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { generatePortfolio } = require('../services/portfolio-generator');

async function runTest() {
    try {
        const uploadsDir = path.join(__dirname, '../public/uploads');
        const files = await fs.readdir(uploadsDir);
        const pdfs = files.filter(f => f.endsWith('.pdf'));

        if (pdfs.length === 0) {
            console.error('❌ No PDFs found in public/uploads. Please upload one via the frontend first.');
            process.exit(1);
        }

        // Get most recent
        const recentPdf = pdfs.sort().pop(); // Simple sort, works for timestamp-prefixed files
        console.log(`📂 Found PDF: ${recentPdf}`);

        const mockEmail = 'test@example.com';
        const mockSaleId = 'test_sale_' + Date.now();
        const mockPosition = 1;

        console.log('🚀 Starting test generation...');
        await generatePortfolio(mockEmail, mockSaleId, mockPosition, recentPdf);
        
        console.log('✅ Test passed!');
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

runTest();