// Use relative URL in production (same server), absolute for local dev
const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

const uploadInput = document.getElementById('resume-upload');
const uploadLabel = document.querySelector('.upload-label');
const messageEl = document.getElementById('message');
const progressWrap = document.getElementById('upload-progress');
const progressText = document.getElementById('progress-text');
const progressPercent = document.getElementById('progress-percent');
const progressBar = document.getElementById('progress-bar');
const resetButton = document.getElementById('upload-reset');

let uploadState = 'idle';

function setupScrollReveal() {
    const supportsReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (supportsReducedMotion) return;

    const targets = [
        ...document.querySelectorAll('.step'),
        ...document.querySelectorAll('.upload-box'),
        ...document.querySelectorAll('.validation-box'),
        ...document.querySelectorAll('.status-box'),
        ...document.querySelectorAll('.hero-card')
    ];

    targets.forEach(el => el.classList.add('reveal'));

    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('reveal-in');
            io.unobserve(entry.target);
        });
    }, { threshold: 0.12 });

    targets.forEach(el => io.observe(el));
}

function setProgress(percent, text) {
    const clamped = Math.max(0, Math.min(100, percent));
    progressBar.style.width = `${clamped}%`;
    progressPercent.textContent = `${Math.round(clamped)}%`;
    if (text) progressText.textContent = text;
}

const validationSection = document.getElementById('validation-section');
const checkEdu = document.getElementById('check-edu');
const checkExp = document.getElementById('check-exp');
const checkSkills = document.getElementById('check-skills');
const userEmailInput = document.getElementById('user-email');
const simulatePayBtn = document.getElementById('simulate-pay-btn');

const generationStatus = document.getElementById('generation-status');
const stepParsing = document.getElementById('step-parsing');
const stepEnhancing = document.getElementById('step-enhancing');
const stepBuilding = document.getElementById('step-building');
const stepDeploying = document.getElementById('step-deploying');
const finalResult = document.getElementById('final-result');
const viewPortfolioBtn = document.getElementById('view-portfolio-btn');
const emailPreviewBox = document.getElementById('email-preview-box');
const emailPreviewConfirmation = document.getElementById('email-preview-confirmation');
const emailPreviewCompleted = document.getElementById('email-preview-completed');
const progressMessage = document.getElementById('progress-message');
const progressMeta = document.getElementById('progress-meta');
const connectionStatus = document.getElementById('connection-status');
const customerMessageEl = document.getElementById('customer-message');
const errorState = document.getElementById('error-state');
const errorMessageEl = document.getElementById('error-message');
const errorDetailsEl = document.getElementById('error-details');
const retryBtn = document.getElementById('retry-btn');
const downloadZipBtn = document.getElementById('download-zip-btn');

let currentSaleId = null;
let pollInterval = null;
let emailPreviewInterval = null;

async function refreshEmailPreviews(orderId) {
    try {
        const res = await fetch(`${API_URL}/api/order/${orderId}/emails`);
        const emails = await res.json();
        const confirmationHtml = emails?.confirmation?.html;
        const completedHtml = emails?.completed?.html;

        if (confirmationHtml || completedHtml) {
            emailPreviewBox.style.display = 'block';
        }
        if (confirmationHtml) {
            emailPreviewConfirmation.srcdoc = confirmationHtml;
        }
        if (completedHtml) {
            emailPreviewCompleted.srcdoc = completedHtml;
        }
    } catch (err) {
        console.error('Email preview error', err);
    }
}

function setState(nextState) {
    uploadState = nextState;

    if (nextState === 'idle') {
        uploadInput.disabled = false;
        uploadLabel.classList.remove('disabled');
        uploadLabel.textContent = '📄 Upload Resume (PDF)';
        progressWrap.style.display = 'none';
        resetButton.style.display = 'none';
        validationSection.style.display = 'none';
        generationStatus.style.display = 'none';
        setProgress(0, '');
        messageEl.style.display = 'none';
        messageEl.textContent = '';
        return;
    }

    if (nextState === 'uploading') {
        uploadInput.disabled = true;
        uploadLabel.classList.add('disabled');
        uploadLabel.textContent = 'Uploading...';
        progressWrap.style.display = 'block';
        resetButton.style.display = 'none';
        validationSection.style.display = 'none';
        generationStatus.style.display = 'none';
        messageEl.style.display = 'none';
        messageEl.textContent = '';
        setProgress(0, 'Uploading your resume');
        return;
    }

    if (nextState === 'uploaded') {
        uploadInput.disabled = true;
        uploadLabel.classList.add('disabled');
        uploadLabel.textContent = 'Uploaded ✓';
        progressWrap.style.display = 'block';
        resetButton.style.display = 'inline-block';
        setProgress(100, 'Upload complete');
        return;
    }
}

function updateValidationUI(validation) {
    validationSection.style.display = 'block';
    
    const updateCheck = (el, valid) => {
        if (valid) {
            el.innerHTML = '<span>✅</span> ' + el.textContent.split(' ')[1];
            el.classList.add('valid');
            el.classList.remove('invalid');
        } else {
            el.innerHTML = '<span>❌</span> ' + el.textContent.split(' ')[1];
            el.classList.add('invalid');
            el.classList.remove('valid');
        }
    };

    updateCheck(checkEdu, validation.education);
    updateCheck(checkExp, validation.experience);
    updateCheck(checkSkills, validation.skills);
}

const statusCopy = {
    queued: 'You’re in the queue. We’ll start as soon as a worker is free.',
    parsing: 'Parsing your PDF into structured data…',
    enhancing: 'Enhancing the content with AI…',
    building: 'Building your portfolio layout…',
    deploying: 'Deploying your portfolio…',
    completed: 'Portfolio ready.',
    failed: 'Generation failed.'
};

function formatElapsed(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
}

function setConnection(type, text) {
    if (!connectionStatus) return;
    if (!text) {
        connectionStatus.style.display = 'none';
        return;
    }
    connectionStatus.style.display = 'block';
    connectionStatus.className = `connection-status ${type}`;
    connectionStatus.textContent = text;
}

function showCustomerMessage(text) {
    if (!customerMessageEl) return;
    if (!text) {
        customerMessageEl.style.display = 'none';
        customerMessageEl.textContent = '';
        return;
    }
    customerMessageEl.style.display = 'block';
    customerMessageEl.textContent = text;
}

function showErrorPanel(message, saleId) {
    if (errorState && errorMessageEl && retryBtn) {
        errorState.style.display = 'block';
        // Support passing either a string or { message, details }
        if (typeof message === 'object' && message) {
            errorMessageEl.textContent = message.message || 'Something went wrong.';
            if (errorDetailsEl) {
                const details = message.details ? String(message.details) : '';
                if (details) {
                    errorDetailsEl.style.display = 'block';
                    // Use innerHTML with <br> for newlines and proper formatting
                    errorDetailsEl.innerHTML = details
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/\n/g, '<br>');
                } else {
                    errorDetailsEl.style.display = 'none';
                    errorDetailsEl.innerHTML = '';
                }
            }
        } else {
            errorMessageEl.textContent = String(message || 'Something went wrong.');
            if (errorDetailsEl) {
                errorDetailsEl.style.display = 'none';
                errorDetailsEl.innerHTML = '';
            }
        }
        retryBtn.disabled = false;
        retryBtn.textContent = 'Retry';
        retryBtn.onclick = () => {
            errorState.style.display = 'none';
            startPolling(saleId);
        };
        return;
    }
    alert(message);
}

function startPolling(saleId) {
    generationStatus.style.display = 'block';
    validationSection.style.display = 'none';
    messageEl.style.display = 'none';
    showCustomerMessage('');
    if (errorState) errorState.style.display = 'none';
    
    const startedAt = Date.now();
    let consecutiveErrors = 0;

    const poll = async () => {
        try {
            const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
            if (progressMeta) progressMeta.textContent = `Elapsed: ${formatElapsed(elapsedSeconds)}`;

            const res = await fetch(`${API_URL}/api/order/${saleId}`);
            const data = await res.json();
            consecutiveErrors = 0;
            setConnection('ok', '');
            
            const steps = {
                'parsing': stepParsing,
                'enhancing': stepEnhancing,
                'building': stepBuilding,
                'deploying': stepDeploying,
                'completed': null
            };

            const order = ['queued', 'parsing', 'enhancing', 'building', 'deploying', 'completed'];
            const currentIndex = order.indexOf(data.status);

            // Update UI steps
            order.forEach((s, idx) => {
                const el = document.getElementById(`step-${s}`);
                if (!el) return;
                
                if (idx < currentIndex) {
                    el.classList.add('completed');
                    el.classList.remove('active');
                    el.innerHTML = `${el.textContent.replace('⏳ ', '').replace(' ✓', '')} ✓`;
                } else if (idx === currentIndex) {
                    el.classList.add('active');
                    el.classList.remove('completed');
                    el.innerHTML = `⏳ ${el.textContent.replace(' ✓', '').replace('⏳ ', '')}`;
                } else {
                    el.classList.remove('active');
                    el.classList.remove('completed');
                    el.innerHTML = el.textContent.replace(' ✓', '').replace('⏳ ', '');
                }
            });

            const baseCopy = statusCopy[data.status] || 'Working…';
            const longWaitNudge =
                (data.status === 'parsing' && elapsedSeconds > 35)
                    ? ' This can take longer for complex PDFs.'
                    : (data.status === 'enhancing' && elapsedSeconds > 65)
                        ? ' AI can take 1–2 minutes depending on load.'
                        : '';
            if (progressMessage) progressMessage.textContent = baseCopy + longWaitNudge;

            if (data.customerMessage) {
                showCustomerMessage(data.customerMessage);
            }

            if (data.status === 'completed') {
                clearInterval(pollInterval);
                finalResult.style.display = 'block';
                viewPortfolioBtn.href = data.vercelUrl;
                viewPortfolioBtn.textContent =
                    data.deployMode === 'local' ? 'View Portfolio (Local)' : 'View Portfolio 🚀';
                stepDeploying.classList.add('completed');
                stepDeploying.classList.remove('active');
                stepDeploying.innerHTML = data.deployMode === 'local' ? 'Generated locally ✓' : 'Deployed ✓';
                if (downloadZipBtn) {
                    downloadZipBtn.href = data.downloadUrl || '#';
                    downloadZipBtn.style.display = data.downloadUrl ? 'inline-block' : 'none';
                }
                if (emailPreviewInterval) clearInterval(emailPreviewInterval);
                await refreshEmailPreviews(saleId);
                if (progressMessage) {
                    if (data.deployMode === 'local') {
                        const adminMsg = data.adminMessage || data.customerMessage || '';
                        progressMessage.textContent = 'Done. Your portfolio was generated locally and your ZIP is ready.';
                        if (adminMsg) {
                            showCustomerMessage(adminMsg);
                        }
                    } else {
                        progressMessage.textContent = 'Done. Your portfolio is ready.';
                    }
                }
            } else if (data.status === 'failed') {
                clearInterval(pollInterval);
                if (downloadZipBtn) {
                    downloadZipBtn.href = data.downloadUrl || '#';
                    downloadZipBtn.style.display = data.downloadUrl ? 'inline-block' : 'none';
                }
                const adminContact = data.adminMessage || data.customerMessage || 'You may contact admin with this number: 011 1535 0810';
                showErrorPanel(
                    {
                        message: "Sorry — we hit an unexpected issue while generating your portfolio.",
                        details: `${data.error || 'Unknown error'}\n\n${adminContact}`
                    },
                    saleId
                );
            }

        } catch (err) {
            console.error('Poll error', err);
            consecutiveErrors += 1;
            setConnection('warning', 'Connection issue — retrying…');
            if (consecutiveErrors >= 5) {
                clearInterval(pollInterval);
                showErrorPanel({ message: 'We’re having trouble staying connected.', details: 'Please retry in a moment.' }, saleId);
            }
        }
    };

    // Poll immediately, then continue on interval.
    poll();
    pollInterval = setInterval(poll, 2000);
}

// Check for payment return from ToyyibPay
function checkPaymentReturn() {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const orderId = urlParams.get('orderId');
    
    if (status === 'success' && orderId) {
        // Clear URL params
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Start polling for this order
        currentSaleId = orderId;
        messageEl.style.display = 'block';
        messageEl.textContent = 'Payment received! Generating your portfolio...';
        emailPreviewBox.style.display = 'block';
        refreshEmailPreviews(orderId);
        if (emailPreviewInterval) clearInterval(emailPreviewInterval);
        emailPreviewInterval = setInterval(() => refreshEmailPreviews(orderId), 3000);
        startPolling(orderId);
    }
}

// Run on page load
checkPaymentReturn();

// Pay with ToyyibPay
async function payWithToyyibPay() {
    const email = userEmailInput.value;
    const filename = localStorage.getItem('uploadedFile');
    const photoFilename = localStorage.getItem('uploadedPhoto');

    if (!email || !email.includes('@')) {
        alert('Please enter a valid email');
        return;
    }

    if (!filename) {
        alert('Please upload your resume first');
        return;
    }

    simulatePayBtn.disabled = true;
    simulatePayBtn.textContent = 'Creating payment...';

    try {
        const res = await fetch(`${API_URL}/api/toyyibpay/create-bill`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, filename, photoFilename })
        });
        
        const data = await res.json();
        
        if (data.success && data.paymentUrl) {
            // Redirect to ToyyibPay payment page
            window.location.href = data.paymentUrl;
        } else {
            alert('Error: ' + (data.error || 'Failed to create payment'));
            simulatePayBtn.disabled = false;
            simulatePayBtn.textContent = 'Pay Now';
        }
    } catch (err) {
        console.error(err);
        alert('Payment creation failed');
        simulatePayBtn.disabled = false;
        simulatePayBtn.textContent = 'Pay Now';
    }
}

// Test Mode Payment (bypasses ToyyibPay)
async function simulatePayment() {
    const email = userEmailInput.value;
    const filename = localStorage.getItem('uploadedFile');
    const photoFilename = localStorage.getItem('uploadedPhoto');

    if (!email || !email.includes('@')) {
        alert('Please enter a valid email');
        return;
    }

    simulatePayBtn.disabled = true;
    simulatePayBtn.textContent = 'Processing...';

    try {
        const res = await fetch(`${API_URL}/api/simulate-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, filename, photoFilename })
        });
        
        const data = await res.json();
        
        if (data.success) {
            currentSaleId = data.saleId;
            messageEl.style.display = 'block';
            messageEl.textContent = `Order confirmed. Estimated completion: ~${data.etaMinutes} minutes.`;
            emailPreviewBox.style.display = 'block';
            await refreshEmailPreviews(currentSaleId);
            if (emailPreviewInterval) clearInterval(emailPreviewInterval);
            emailPreviewInterval = setInterval(() => refreshEmailPreviews(currentSaleId), 3000);
            startPolling(currentSaleId);
        } else {
            alert('Error: ' + data.error);
            simulatePayBtn.disabled = false;
            simulatePayBtn.textContent = 'Start Generation';
        }
    } catch (err) {
        console.error(err);
        alert('Payment simulation failed');
        simulatePayBtn.disabled = false;
        simulatePayBtn.textContent = 'Start Generation';
    }
}

// Payment Button Click Handler
// Set to true for production with ToyyibPay, false for testing
const USE_TOYYIBPAY = false; // Temporarily disabled - ToyyibPay credentials need updating

simulatePayBtn.addEventListener('click', async () => {
    if (USE_TOYYIBPAY) {
        await payWithToyyibPay();
    } else {
        await simulatePayment();
    }
});

// Update slots
async function updateSlots() {
    try {
        const res = await fetch(`${API_URL}/api/status/remaining`);
        const data = await res.json();
        
        const counter = document.getElementById('slot-counter');
        const count = document.getElementById('remaining-count');
        
        if (data.soldOut) {
            counter.innerHTML = `
                <div style="padding: 20px;">
                    <h3>🔥 SOLD OUT!</h3>
                    <p>All 50 spots claimed</p>
                </div>
            `;
            document.querySelector('.cta-button').style.display = 'none';
        } else {
            count.textContent = `${data.remaining}/50 spots remaining`;
            if (data.remaining <= 10) {
                counter.style.border = '2px solid #fbbf24';
            }
        }
    } catch (err) {
        console.error('Error fetching slots:', err);
    }
}

// Handle upload
uploadInput.addEventListener('change', (e) => {
    if (uploadState !== 'idle') return;

    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        alert('PDF only!');
        uploadInput.value = '';
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        alert('Max 10MB');
        uploadInput.value = '';
        return;
    }

    setState('uploading');

    const formData = new FormData();
    formData.append('resume', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/upload`);

    xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = (event.loaded / event.total) * 100;
        setProgress(percent, 'Uploading your resume');
    };

    xhr.onerror = () => {
        setState('idle');
        uploadInput.value = '';
        alert('Upload failed. Try again.');
    };

    xhr.onload = () => {
        let data;
        try {
            data = JSON.parse(xhr.responseText);
        } catch {
            data = null;
        }

        if (!data || !data.success) {
            setState('idle');
            uploadInput.value = '';
            alert(data?.error || 'Upload failed. Try again.');
            return;
        }

        localStorage.setItem('uploadedFile', data.filename);
        localStorage.removeItem('uploadedPhoto');
        setState('uploaded');
        
        // Show validation results
        if (data.validation) {
            updateValidationUI(data.validation);
        }

        messageEl.style.display = 'block';
        messageEl.textContent = 'Resume validated! Please proceed below.';
    };

    xhr.send(formData);
});

resetButton.addEventListener('click', () => {
    localStorage.removeItem('uploadedFile');
    localStorage.removeItem('uploadedPhoto');
    uploadInput.value = '';
    setState('idle');
    if (pollInterval) clearInterval(pollInterval);
    if (emailPreviewInterval) clearInterval(emailPreviewInterval);
    emailPreviewBox.style.display = 'none';
    emailPreviewConfirmation.srcdoc = '';
    emailPreviewCompleted.srcdoc = '';
});

// Init
updateSlots();
setInterval(updateSlots, 30000);
setState('idle');
setupScrollReveal();
