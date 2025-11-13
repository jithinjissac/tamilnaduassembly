import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import util from 'util';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Single canonical pdfGenerator implementation.
// Responsibilities:
// - maintain an in-memory pdfJobs map
// - provide registerPDFJob/getPDFJobStatus/getPDFFilePath
// - background generation helpers with retries and dynamic imports to avoid circular deps

export const pdfJobs = new Map();

export const registerPDFJob = (orderId, job) => pdfJobs.set(orderId, job);

// Browser launch queue
let freshBrowserLaunchPromise = null;

export const createFreshBrowser = async () => {
    // If browser launch is in progress, wait for it
    if (freshBrowserLaunchPromise) {
        console.log('⏳ Fresh browser launch already in progress, waiting...');
        try {
            const browser = await freshBrowserLaunchPromise;
            // Return a new browser anyway since this might be for parallel use
        } catch (e) {
            console.log('⚠️ Previous fresh browser launch failed, will retry');
        }
    }
    
    freshBrowserLaunchPromise = (async () => {
        console.log('🚀 Creating fresh browser instance for PDF generation...');
        
        // Retry with exponential backoff
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const browser = await puppeteer.launch({
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-background-networking',
                        '--disable-default-apps',
                        '--disable-extensions'
                    ],
                    timeout: 30000 // 30 second timeout
                });
                console.log('✅ Fresh browser instance created successfully');
                return browser;
                
            } catch (launchError) {
                lastError = launchError;
                console.error(`❌ Fresh browser launch attempt ${attempt}/3 failed:`, launchError.message);
                
                if (attempt < 3) {
                    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
                    console.log(`⏳ Waiting ${delay/1000}s before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError;
    })();
    
    try {
        return await freshBrowserLaunchPromise;
    } finally {
        freshBrowserLaunchPromise = null;
    }
};

const tempPDFCache = new Map();

const schedulePDFDeletion = (orderId, filePath, delay) => {
    setTimeout(() => {
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            pdfJobs.delete(orderId);
            console.log(`🗑️ Deleted temporary PDF for ${orderId}`);
        } catch (err) {
            console.warn('Error deleting temp PDF', err.message);
        }
    }, delay);
};

export const findAndLinkTempPDF = (orderId) => {
    try {
        const tempDir = path.join(__dirname, '..', 'public', 'temp-pdfs');
        if (!fs.existsSync(tempDir)) return null;
        const files = fs.readdirSync(tempDir);
        const tempFile = files.find(f => f.startsWith(`temp-${orderId}-`) && f.endsWith('.pdf'));
        if (!tempFile) return null;
        const oldPath = path.join(tempDir, tempFile);
        const newFilename = `cache-${orderId}-${Date.now()}.pdf`;
        const newPath = path.join(tempDir, newFilename);
        fs.renameSync(oldPath, newPath);
        pdfJobs.set(orderId, { status: 'ready', path: newPath, filename: newFilename, createdAt: new Date(), progress: 100 });
        schedulePDFDeletion(orderId, newPath, 24 * 60 * 60 * 1000);
        return newPath;
    } catch (err) {
        console.error('findAndLinkTempPDF error', util.inspect(err, { depth: null }));
        return null;
    }
};

export const generatePDFBackgroundWithSessionId = async (order, sessionId) => {
    try {
        const { generateSlipHTML } = await import('../controllers/slipController.js');
        const html = await generateSlipHTML(order);

        // Always use a fresh browser for early/background generation
        const browser = await createFreshBrowser();
        const page = await browser.newPage();
        await page.setBypassCSP(true);
        await page.setJavaScriptEnabled(false);
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 120000 });
        const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
        await page.close();
        await browser.close();

        const tempDir = path.join(__dirname, '..', 'public', 'temp-pdfs');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const filename = `${sessionId}.pdf`;
        const filePath = path.join(tempDir, filename);
        fs.writeFileSync(filePath, pdf);
        tempPDFCache.set(sessionId, { orderId: sessionId, tempPath: filePath, createdAt: new Date() });
        schedulePDFDeletion(sessionId, filePath, 60 * 60 * 1000);
        console.log('Saved temp background PDF for session', sessionId);
        return filePath;
    } catch (err) {
        console.error('generatePDFBackgroundWithSessionId failed', util.inspect(err, { depth: null }));
        return null;
    }
};

export const generatePDFBackground = async (order, orderId) => {
    // set in-progress
    pdfJobs.set(orderId, { status: 'generating', createdAt: new Date(), progress: 0 });
    try {
        const { generateSlipHTML } = await import('../controllers/slipController.js');
        const html = await generateSlipHTML(order);

        // ✅ ALWAYS use fresh browser for background generation to avoid disconnection issues
        let browser;
        let page;
        let pdf;
        const maxAttempts = 2;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(`🔄 Background PDF attempt ${attempt}/${maxAttempts} for ${orderId} (${order.totalVoters} voters)`);
                browser = await createFreshBrowser();
                page = await browser.newPage();
                await page.setBypassCSP(true);
                await page.setJavaScriptEnabled(false);
                await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 120000 });
                pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
                await page.close();
                await browser.close();
                console.log(`✅ Background PDF generated successfully for ${orderId}`);
                break;
            } catch (err) {
                console.error(`❌ PDF generation attempt ${attempt} failed for ${orderId}`, util.inspect(err, { depth: 1 }));
                try { if (page) await page.close(); } catch (e) {}
                try { if (browser) await browser.close(); } catch (e) {}
                const isTransient = err && (err.code === 'ECONNRESET' || err.message?.includes('ECONNRESET') || err.message?.includes('Target closed'));
                if (!isTransient || attempt === maxAttempts) throw err;
                console.log(`⏳ Retrying in 2 seconds...`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        const permanentPdfDir = path.join(__dirname, '..', 'public', 'permanent-pdfs');
        if (!fs.existsSync(permanentPdfDir)) fs.mkdirSync(permanentPdfDir, { recursive: true });
        const filePath = path.join(permanentPdfDir, `${orderId}.pdf`);
        fs.writeFileSync(filePath, pdf);
        registerPDFJob(orderId, { status: 'ready', path: filePath, size: pdf.length, createdAt: new Date(), progress: 100 });

        try {
            const Order = (await import('../models/Order.js')).default;
            const orderBefore = await Order.findOne({ orderId });
            const hadPdfBefore = orderBefore?.permanentPdfFilename;
            
            await Order.findOneAndUpdate({ orderId }, { permanentPdfFilename: `${orderId}.pdf` });
            
            // Send PDF ready email ONLY for NEW PDF generation (not when finding existing PDFs)
            if (!hadPdfBefore) {
                const User = (await import('../models/User.js')).default;
                const { sendPDFReadyEmail } = await import('./emailService.js');
                const orderDoc = await Order.findOne({ orderId }).populate('userId');
                if (orderDoc && orderDoc.userId && orderDoc.paymentStatus === 'completed') {
                    console.log(`📧 Sending PDF ready email for NEW PDF generation: ${orderId}`);
                    sendPDFReadyEmail(orderDoc.userId, orderDoc).catch(err => {
                        console.error('❌ Failed to send PDF ready email:', err.message);
                    });
                } else if (orderDoc && orderDoc.paymentStatus !== 'completed') {
                    console.log(`⏳ Skipping PDF ready email - payment not completed yet for: ${orderId} (status: ${orderDoc.paymentStatus})`);
                }
            } else {
                console.log(`ℹ️ PDF already existed for ${orderId}, skipping email notification`);
            }
        } catch (e) {
            console.warn('Could not update Order with permanentPdfFilename', e.message);
        }

        return filePath;
    } catch (err) {
        console.error('generatePDFBackground failed for', orderId, util.inspect(err, { depth: 2 }));
        pdfJobs.set(orderId, { status: 'failed', error: err?.message || String(err), createdAt: new Date() });
        throw err;
    }
};

export const getPDFJobStatus = (orderId) => pdfJobs.get(orderId) || { status: 'not-found' };

export const getPDFFilePath = (orderId) => {
    console.log(`[getPDFFilePath] Checking for PDF: ${orderId}`);
    
    // Check in-memory cache first
    const job = pdfJobs.get(orderId);
    if (job && job.status === 'ready' && fs.existsSync(job.path)) {
        console.log(`[getPDFFilePath] ✅ Found in cache: ${job.path}`);
        return job.path;
    }
    
    // Check filesystem for permanent PDF
    const permanentPdfPath = path.join(__dirname, '..', 'public', 'permanent-pdfs', `${orderId}.pdf`);
    console.log(`[getPDFFilePath] Checking filesystem: ${permanentPdfPath}`);
    
    if (fs.existsSync(permanentPdfPath)) {
        console.log(`[getPDFFilePath] ✅ Found permanent PDF on disk, registering in cache`);
        pdfJobs.set(orderId, { orderId, path: permanentPdfPath, status: 'ready', createdAt: new Date() });
        return permanentPdfPath;
    }
    
    console.log(`[getPDFFilePath] ❌ PDF not found anywhere`);
    return null;
};

export const cleanupExpiredPDFs = () => {
    const tempDir = path.join(__dirname, '..', 'public', 'temp-pdfs');
    if (!fs.existsSync(tempDir)) return;
    try {
        const files = fs.readdirSync(tempDir);
        const now = Date.now();
        files.forEach(f => {
            if (f.startsWith('cache-')) {
                const p = path.join(tempDir, f);
                const age = now - fs.statSync(p).mtimeMs;
                if (age > 35 * 60 * 1000) fs.unlinkSync(p);
            }
        });
    } catch (e) {
        console.warn('cleanupExpiredPDFs error', e.message);
    }
};

export const clearPDFCache = (orderId) => {
    const job = pdfJobs.get(orderId);
    if (job && job.path && fs.existsSync(job.path)) {
        try { fs.unlinkSync(job.path); } catch (e) {}
    }
    pdfJobs.delete(orderId);
};

