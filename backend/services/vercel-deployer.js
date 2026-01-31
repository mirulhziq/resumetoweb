const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const ADMIN_CONTACT = '011 1535 0810';

async function deployToVercel(htmlContent, saleId) {
    console.log('🚀 Deploying to Vercel...');
    
    const projectName = `resume-${saleId.slice(0, 12)}`;
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';

    // Helper: write local file and return with admin contact message
    async function writeLocalWithAdminMessage(reason) {
        const outPath = path.join(__dirname, '../generated', `${saleId}.html`);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, htmlContent, 'utf8');
        const url = `${backendUrl}/generated/${saleId}.html`;
        console.log('✅ Deployed locally to:', url);
        return {
            url,
            mode: 'local',
            error: reason,
            adminMessage: `Deployment issue. You may contact admin with this number: ${ADMIN_CONTACT}`
        };
    }

    // Check if VERCEL_TOKEN is configured
    if (!process.env.VERCEL_TOKEN) {
        console.log('⚠️ VERCEL_TOKEN not set; falling back to local deployment');
        return await writeLocalWithAdminMessage('VERCEL_TOKEN is not configured');
    }

    // If proxy env is misconfigured, skip outbound deploy
    const proxyCandidates = [
        process.env.HTTPS_PROXY,
        process.env.HTTP_PROXY,
        process.env.ALL_PROXY,
        process.env.https_proxy,
        process.env.http_proxy,
        process.env.all_proxy
    ].filter(Boolean);
    const hasBlockedLocalProxy = proxyCandidates.some((v) => {
        const s = String(v).toLowerCase();
        return s.includes('127.0.0.1:9') || s.includes('localhost:9');
    });
    if (hasBlockedLocalProxy) {
        console.log('⚠️ Proxy misconfigured; falling back to local deployment');
        return await writeLocalWithAdminMessage('Outbound HTTP proxy is misconfigured (127.0.0.1:9)');
    }
    
    try {
        const response = await axios.post(
            'https://api.vercel.com/v13/deployments',
            {
                name: projectName,
                public: true,
                files: [
                    {
                        file: 'index.html',
                        data: htmlContent
                    }
                ],
                projectSettings: {
                    framework: null
                },
                target: 'production'
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 45_000
            }
        );

        const deploymentId = response?.data?.id;
        const initialUrl = response?.data?.url ? `https://${response.data.url}` : null;
        if (!deploymentId || !initialUrl) {
            console.log('⚠️ Invalid Vercel response; falling back to local deployment');
            return await writeLocalWithAdminMessage('Vercel returned an invalid response');
        }

        // Poll deployment until ready
        const maxWaitMs = 120_000;
        const start = Date.now();
        let lastState = null;
        let finalUrl = initialUrl;

        while (Date.now() - start < maxWaitMs) {
            try {
                const dep = await axios.get(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
                    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
                    timeout: 20_000
                });
                const readyState = dep?.data?.readyState;
                lastState = readyState || lastState;
                if (typeof dep?.data?.url === 'string') {
                    finalUrl = `https://${dep.data.url}`;
                }
                if (readyState === 'READY') break;
                if (readyState === 'ERROR') {
                    console.log('⚠️ Vercel deployment error state; falling back to local');
                    return await writeLocalWithAdminMessage(dep?.data?.error?.message || 'Vercel deployment error');
                }
            } catch (pollErr) {
                console.log('⚠️ Polling error:', pollErr.message);
            }
            // Backoff
            await new Promise(r => setTimeout(r, 1500));
        }

        if (lastState !== 'READY') {
            console.log('⚠️ Vercel deployment timeout; falling back to local');
            return await writeLocalWithAdminMessage(`Deployment timeout (lastState=${String(lastState)})`);
        }

        // Probe the URL to check if it's publicly accessible
        try {
            const probe = await axios.get(finalUrl, { timeout: 20_000, validateStatus: () => true });
            const body = typeof probe?.data === 'string' ? probe.data : '';
            const authGated =
                probe?.status === 401 ||
                probe?.status === 403 ||
                body.includes('Authentication Required') ||
                body.includes('requires Vercel authentication');
            
            if (authGated) {
                console.log('⚠️ Vercel URL is auth-gated; falling back to local deployment');
                return await writeLocalWithAdminMessage('Vercel deployment requires authentication (Deployment Protection enabled in Vercel dashboard)');
            }
        } catch (probeErr) {
            console.log('⚠️ Could not probe Vercel URL:', probeErr.message);
            // Continue anyway - the URL might still work for the customer
        }

        console.log('✅ Deployed to Vercel:', finalUrl);
        return { url: finalUrl, mode: 'vercel', deploymentId };

    } catch (error) {
        const status = error?.response?.status;
        const data = error?.response?.data;
        if (status) {
            console.error('❌ Vercel deployment failed:', status, error.message);
        } else {
            console.error('❌ Vercel deployment failed:', error.message);
        }
        if (data) {
            console.error('Vercel response:', JSON.stringify(data));
        }
        
        // Graceful fallback to local deployment
        return await writeLocalWithAdminMessage(error?.message || 'Unknown deployment error');
    }
}

module.exports = { deployToVercel };
