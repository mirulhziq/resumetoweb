const { ApifyClient } = require('apify-client');
const crypto = require('crypto');
const fs = require('fs').promises;

const client = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
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

async function parseResumePDF(pdfUrl, options = {}) {
    console.log('📄 Calling Apify to parse PDF...');

    // If the machine has a misconfigured proxy (common: 127.0.0.1:9),
    // the Apify client will retry for a long time. Fail fast so we can
    // immediately fall back to local parsing for a better UX.
    if (hasBlockedLocalProxy()) {
        throw new Error('Outbound HTTP proxy is misconfigured (127.0.0.1:9). Skipping Apify.');
    }

    async function makeCloudReachablePdfUrl() {
        // If pdfUrl is not public (localhost), upload the PDF bytes to Apify KV store and use record URL.
        const urlStr = String(pdfUrl || '');
        const isLocalhost = urlStr.includes('://localhost') || urlStr.includes('://127.0.0.1');
        if (!isLocalhost) return urlStr;

        // Derive local file path from the URL. Our backend serves /uploads/<filename>.
        const filename = urlStr.split('/uploads/')[1] || '';
        if (!filename) {
            throw new Error('APIFY_PDF_URL_LOCALHOST_NO_FILENAME');
        }
        const localPath = options.pdfPath || require('path').join(__dirname, '../uploads', filename);
        const pdfBuffer = await fs.readFile(localPath);

        const storeName = process.env.APIFY_RESUME_KV_STORE || 'resume-to-web-temp';
        const store = await client.keyValueStores().getOrCreate(storeName);
        const key = `resume-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`;
        await client.keyValueStore(store.id).setRecord({
            key,
            value: pdfBuffer,
            contentType: 'application/pdf'
        });
        const recordUrl = await client.keyValueStore(store.id).getRecordPublicUrl(key);
        return recordUrl;
    }
    
    try {
        const reachablePdfUrl = await makeCloudReachablePdfUrl();
        const run = await client.actor(process.env.APIFY_ACTOR_ID).call({
            pdfUrl: reachablePdfUrl
        });
        
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        if (!items || items.length === 0) {
            throw new Error('Apify returned no data');
        }
        
        const result = items[0];
        
        if (!result.success) {
            throw new Error(`Apify extraction failed: ${result.error}`);
        }
        
        console.log('✅ Apify parsing complete');
        console.log(`   Confidence: ${result.confidence}`);
        console.log(`   Name: ${result.data.name}`);
        console.log(`   Email: ${result.data.email}`);
        
        return result;
        
    } catch (error) {
        console.error('❌ Apify error:', error.message);
        throw error;
    }
}

module.exports = { parseResumePDF };
