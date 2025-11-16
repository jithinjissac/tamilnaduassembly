import puppeteer from 'puppeteer';
import Order from '../models/Order.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPDFFilePath, getPDFJobStatus, clearPDFCache, createFreshBrowser, registerPDFJob } from '../utils/pdfGenerator.js';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Persistent browser instance for better performance
let browserInstance = null;

// Store temporary PDF files with timestamps
const tempPDFs = new Map(); // Map<filename, { path, createdAt, timeout }>

// Browser launch queue to prevent concurrent launches
let browserLaunchPromise = null;

// Get or create browser instance with optimizations - Export for admin use
export const getBrowser = async () => {
    // If browser launch is in progress, wait for it
    if (browserLaunchPromise) {
        console.log('⏳ Browser launch already in progress, waiting...');
        try {
            await browserLaunchPromise;
        } catch (e) {
            console.log('⚠️ Previous browser launch failed, will retry');
        }
    }

    if (!browserInstance || !browserInstance.isConnected()) {
        // Create a promise for this launch to queue subsequent requests
        browserLaunchPromise = (async () => {
            console.log('🚀 Launching new Puppeteer browser instance with performance optimizations...');
            
            // Retry with exponential backoff
            let lastError;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const browser = await puppeteer.launch({
                        headless: true,
                        args: [
                            // Memory and stability
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--single-process=false',
                            
                            // Performance optimizations
                            '--disable-blink-features=AutomationControlled',
                            '--disable-background-networking',
                            '--disable-breakpad',
                            '--disable-default-apps',
                            '--disable-extensions',
                            '--disable-features=TranslateUI',
                            '--disable-popup-blocking',
                            '--disable-prompt-on-repost',
                            '--disable-sync',
                            '--disable-web-resources',
                            '--enable-automation',
                            '--no-first-run',
                            '--no-pings',
                            '--print-to-pdf-without-header'
                        ],
                        timeout: 30000 // 30 second timeout
                    });
                    
                    console.log('✅ Browser instance ready with PDF performance optimizations');
                    
                    // Handle browser disconnection
                    browser.on('disconnected', () => {
                        console.log('⚠️ Browser disconnected, will create new instance on next request');
                        browserInstance = null;
                    });
                    
                    browserInstance = browser;
                    return browser;
                    
                } catch (launchError) {
                    lastError = launchError;
                    console.error(`❌ Browser launch attempt ${attempt}/3 failed:`, launchError.message);
                    
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
            await browserLaunchPromise;
        } finally {
            browserLaunchPromise = null;
        }
    } else {
        console.log('♻️ Reusing existing browser instance');
    }
    return browserInstance;
};

// Create a new browser instance for large PDF operations (to avoid memory issues)
// NOTE: This is now imported from pdfGenerator.js to avoid circular dependency
// export const createFreshBrowser = async () => { ... }

// Cleanup function for temporary PDFs
const cleanupPDF = (filename) => {
    const pdfInfo = tempPDFs.get(filename);
    if (pdfInfo) {
        // Clear timeout if exists
        if (pdfInfo.timeout) {
            clearTimeout(pdfInfo.timeout);
        }
        
        // Delete file
        try {
            if (fs.existsSync(pdfInfo.path)) {
                fs.unlinkSync(pdfInfo.path);
                console.log(`🗑️ Deleted temporary PDF: ${filename}`);
            }
        } catch (error) {
            console.error(`Error deleting PDF ${filename}:`, error.message);
        }
        
        tempPDFs.delete(filename);
    }
};

// Auto-cleanup old PDFs (5 minutes timeout)
const scheduleCleanup = (filename) => {
    const timeout = setTimeout(() => {
        console.log(`⏰ Auto-cleanup timeout reached for ${filename}`);
        cleanupPDF(filename);
    }, 5 * 60 * 1000); // 5 minutes
    
    const pdfInfo = tempPDFs.get(filename);
    if (pdfInfo) {
        pdfInfo.timeout = timeout;
    }
};

// Cleanup function for graceful shutdown
export const closeBrowser = async () => {
    if (browserInstance) {
        console.log('🔒 Closing browser instance...');
        await browserInstance.close();
        browserInstance = null;
    }
    
    // Cleanup all temporary PDFs
    console.log('🗑️ Cleaning up all temporary PDFs...');
    for (const [filename] of tempPDFs) {
        cleanupPDF(filename);
    }
};

// Generate slip HTML - Export for admin use
export const generateSlipHTML = async (order, startIndex = 0, endIndex = null) => {
    const voters = endIndex ? order.voters.slice(startIndex, endIndex) : order.voters.slice(startIndex);
    console.log(`generateSlipHTML: Processing ${voters.length} voters (from index ${startIndex} to ${endIndex || 'end'})`);
    
    // Debug: check if voters have polling_station_name
    const votersWithStation = voters.filter(v => v.polling_station_name);
    console.log(`🔍 Voters with polling_station_name: ${votersWithStation.length}/${voters.length}`);
    if (votersWithStation.length > 0) {
        console.log(`📍 Sample station name: "${votersWithStation[0].polling_station_name}"`);
    }
    
    // Use slipsPerPage from order customization, default to 5
    const slipsPerPage = order.customization?.slipsPerPage || 5;
    console.log(`📄 Using ${slipsPerPage} slips per page (from order.customization.slipsPerPage: ${order.customization?.slipsPerPage})`);
    console.log(`🔍 Full customization object:`, JSON.stringify(order.customization, null, 2));
    
    // Use Malayalam name if available, otherwise English
    // Ensure we get a string value, not an object
    const symbolNameMalayalam = typeof order.customization.symbolNameMalayalam === 'string' 
        ? order.customization.symbolNameMalayalam 
        : (order.customization.symbolNameMalayalam?.name || '');
    const symbolNameEnglish = typeof order.customization.symbolName === 'string'
        ? order.customization.symbolName
        : (order.customization.symbolName?.name || '');
    const displaySymbolName = symbolNameMalayalam || symbolNameEnglish || 'Symbol';
    const pollingStation = order.location.pollingStationName || order.location.pollingStation;
    const wardName = order.location.wardName || order.location.ward;
    
    // Convert symbol to base64 ONCE (not per slip)
    let symbolUrl = '';
    const symbolImage = order.customization.symbolImage || '';
    const symbolPath = symbolImage.startsWith('/') 
        ? path.join(__dirname, '..', 'public', symbolImage)
        : symbolImage;
    
    if (symbolPath && !symbolPath.startsWith('http')) {
        try {
            const imageBuffer = fs.readFileSync(symbolPath);
            const ext = path.extname(symbolPath).toLowerCase();
            const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
            symbolUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
            console.log('✅ Symbol converted to base64 once (', (imageBuffer.length / 1024).toFixed(2), 'KB)');
        } catch (err) {
            console.error('❌ Failed to read symbol file:', err.message);
        }
    } else if (symbolPath) {
        symbolUrl = symbolPath;
    }
    
    // Load font settings from database
    let fontSize;
    try {
        const Settings = (await import('../models/Settings.js')).default;
        const slipSettings = await Settings.getSettings('slip');
        
        if (slipSettings && slipSettings.fiveSlips && slipSettings.sixSlips) {
            fontSize = slipsPerPage === 6 ? slipSettings.sixSlips : slipSettings.fiveSlips;
            console.log('✅ Loaded font settings from database');
        } else {
            throw new Error('Settings not found, using defaults');
        }
    } catch (err) {
        console.warn('⚠️ Could not load slip settings, using defaults:', err.message);
        // Fallback to default settings
        fontSize = slipsPerPage === 6 ? {
            symbolHeader: '7pt',
            symbolImage: '20mm',
            symbolName: '8.5pt',
            slipNumber: '10pt',
            secId: '9pt',
            voterName: '11pt',
            infoRow: '9pt',
            infoLabel: '16mm',
            pollingStation: '9pt'
        } : {
            symbolHeader: '8pt',
            symbolImage: '24mm',
            symbolName: '9.5pt',
            slipNumber: '11pt',
            secId: '10pt',
            voterName: '11pt',
            infoRow: '10pt',
            infoLabel: '17mm',
            pollingStation: '10pt'
        };
    }
    
    // Calculate slip height and gap based on slipsPerPage
    // A4 height: 297mm, with 5mm top/bottom padding = 287mm usable
    // For 5 slips: 52mm each (with 4mm gap × 4 = 16mm) = 260 + 16 = 276mm ✓
    // For 6 slips: 42mm each (with 4mm gap × 5 = 20mm) = 252 + 20 = 272mm ✓
    const slipHeight = slipsPerPage === 6 ? '42mm' : '52mm';
    const slipGap = '4mm';
    
    let html = `
<!DOCTYPE html>
<html lang="ml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Voter Slips - ${order.orderId}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Noto Sans Malayalam', 'Noto Sans', Arial, sans-serif; background: #fff; }
        
        :root { --symbol-image: url('${symbolUrl}'); }
        
        .page { width: 210mm; height: 297mm; padding: 5mm 10mm; display: flex; flex-direction: column; page-break-after: always; }
        .page:last-child { page-break-after: auto; }
        
        .voter-slip { width: 100%; height: ${slipHeight}; border: 2px solid; display: flex; padding: 2mm; position: relative; flex-shrink: 0; margin-bottom: ${slipGap}; }
        .voter-slip::after { content: ''; position: absolute; left: 0; right: 0; bottom: -${parseInt(slipGap)/2}mm; height: 0; border-bottom: 2px dashed #999; }
        .voter-slip:last-child { margin-bottom: 0; }
        .voter-slip:last-child::after { display: none; }
        .voter-slip > * { overflow: hidden; }
        
        .slip-left { width: 38mm; border-right: 2px dotted; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5mm; margin-right: 2.5mm; text-align: center; flex-shrink: 0; }
        .symbol-header { font-size: ${fontSize.symbolHeader}; font-weight: bold; margin-bottom: 0.8mm; line-height: 1.1; }
        .symbol-image { width: ${fontSize.symbolImage}; height: ${fontSize.symbolImage}; margin-bottom: 0.8mm; flex-shrink: 0; background-image: var(--symbol-image); background-size: contain; background-repeat: no-repeat; background-position: center; }
        .symbol-name { font-size: ${fontSize.symbolName}; font-weight: bold; line-height: 1.15; word-wrap: break-word; max-width: 36mm; }
        
        .slip-right { flex: 1; padding: 1.5mm 2.5mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; min-width: 0; }
        .ward-info { font-size: 10pt; font-weight: bold; margin-bottom: 1mm; padding: 1mm 0; border-bottom: 1px solid #000; text-align: center; }
        .slip-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1mm; font-size: 10pt; gap: 1mm; overflow: hidden; }
        .slip-number { font-weight: bold; font-size: ${fontSize.slipNumber}; white-space: nowrap; }
        .sec-id { font-weight: bold; font-size: ${fontSize.secId}; white-space: nowrap; }
        
        .voter-info { flex: 1; overflow: hidden; min-height: 0; }
        .info-row { margin-bottom: 0.8mm; font-size: ${fontSize.infoRow}; display: flex; line-height: 1.25; overflow: hidden; }
        .info-row.voter-name { font-size: ${fontSize.voterName}; font-weight: bold; margin-bottom: 1mm; }
        .info-label { font-weight: bold; min-width: ${fontSize.infoLabel}; flex-shrink: 0; }
        .info-value { flex: 1; word-break: break-word; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .polling-station-info { font-size: ${fontSize.pollingStation}; border-top: 1px solid; padding-top: 0.8mm; margin-top: 0.5mm; line-height: 1.3; font-weight: 600; word-wrap: break-word; white-space: normal; overflow-wrap: break-word; }
        
        .cover-page { width: 210mm; height: 297mm; padding: 18mm; page-break-after: always; display: flex; flex-direction: column; justify-content: flex-start; }
        .cover-title { font-size: 22pt; font-weight: bold; margin-bottom: 6mm; }
        .cover-meta { font-size: 12pt; margin-bottom: 10mm; line-height: 1.6; }
        .station-list { margin-top: 6mm; }
        .station-item { font-size: 12pt; padding: 5px 0; border-bottom: 1px dashed; display: flex; justify-content: space-between; gap: 8mm; }
        .station-name { font-weight: bold; flex: 1; }
        .station-count { min-width: 35mm; text-align: right; font-weight: 600; }
        
        @media print { @page { size: A4; margin: 0; } }
    </style>
</head>
<body>`;

    // Build station grouping and optional cover page
    const isPreview = endIndex !== null; // when previewing first N voters, skip cover for clarity
    const stationNameFor = (v) => v.polling_station_name || pollingStation || '';
    const stationMap = new Map(); // name -> { voters: [], count }
    voters.forEach(v => {
        const name = stationNameFor(v);
        if (!stationMap.has(name)) stationMap.set(name, { voters: [] });
        stationMap.get(name).voters.push(v);
    });
    const stationEntries = Array.from(stationMap.entries()).map(([name, obj]) => ({ name, count: obj.voters.length }));
    const multipleStations = stationEntries.length > 1;

    // If multiple stations and not preview, add a cover page summarizing stations
    if (multipleStations && !isPreview) {
        html += `
        <div class="cover-page">
            <div class="cover-title">വോട്ടര്‍ സ്ലിപ്പുകള്‍</div>
            <div class="cover-meta">
                <div><strong>ജില്ല:</strong> ${order.location.district || '-'}</div>
                <div><strong>ലോകല്‍ ബോഡി:</strong> ${order.location.localBody || '-'}</div>
                <div><strong>വാര്‍ഡ്:</strong> ${order.location.ward || '-'}</div>
                <div><strong>ഓര്‍ഡര്‍ ഐഡി:</strong> ${order.orderId}</div>
                <div><strong>മൊത്തം വോട്ടര്‍മാര്‍:</strong> ${voters.length}</div>
            </div>
            <div><strong>പോളിംഗ് സ്റ്റേഷനുകള്‍</strong></div>
            <div class="station-list">
                ${stationEntries.map(s => `
                    <div class="station-item">
                        <div class="station-name">${s.name || '-'}</div>
                        <div class="station-count">${s.count} വോട്ടര്‍മാര്‍</div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }

    // Generate pages - symbol already converted to base64 above
    // If multiple stations, render grouped by station to keep slips distinguishable
    const htmlParts = [];
    
    const renderVoters = (arr) => {
        for (let i = 0; i < arr.length; i += slipsPerPage) {
            htmlParts.push('<div class="page">');
            const pageVoters = arr.slice(i, i + slipsPerPage);
            pageVoters.forEach((voter, index) => {
            // Use original serial number from SEC data, NOT recalculated
            const serialNo = voter.sl_no || (startIndex + i + index + 1);
            
            // Use voter-specific polling station if available (for multi-station orders)
            const voterPollingStation = voter.polling_station_name || pollingStation;
            
            const genderAge = voter.gender_age ? voter.gender_age.split('/') : ['', ''];
            const gender = genderAge[0]?.trim() || '';
            const age = genderAge[1]?.trim() || '';
            
            htmlParts.push(`
            <div class="voter-slip">
                <div class="slip-left">
                    <div class="symbol-header">നമ്മുടെ ചിഹ്നം</div>
                    <div class="symbol-image" role="img" aria-label="Symbol"></div>
                    <div class="symbol-name">${displaySymbolName}</div>
                </div>
                <div class="slip-right">
                    <div class="ward-info">വാര്‍ഡ്: ${wardName}</div>
                    <div class="slip-header">
                        <div class="slip-number">ക്രമ നമ്പർ: ${serialNo}</div>
                        <div class="sec-id">കാർഡ് നമ്പർ: ${voter.sec_id || 'N/A'}</div>
                    </div>
                    <div class="voter-info">
                        <div class="info-row voter-name">
                            <span class="info-label">പേര്:</span>
                            <span class="info-value">${voter.name || 'N/A'}${(gender || age) ? ` (${gender}${gender && age ? '/' : ''}${age})` : ''}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">വീട്ടുപേര്:</span>
                            <span class="info-value">${voter.house_name || ''} ${voter.house_no ? `(${voter.house_no})` : ''}</span>
                        </div>
                        ${voter.guardian_name && voter.guardian_name.trim() ? `
                        <div class="info-row">
                            <span class="info-label">രക്ഷിതാവ്:</span>
                            <span class="info-value">${voter.guardian_name}</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="polling-station-info">പോളിംഗ് സ്റ്റേഷൻ: ${voterPollingStation}</div>
                </div>
            </div>`);
            });
            htmlParts.push('</div>');
        }
    };

    if (multipleStations) {
        // Render grouped by station (sort by station name for stable order)
        const names = Array.from(stationMap.keys()).sort((a, b) => (a || '').localeCompare(b || ''));
        names.forEach(name => {
            const groupVoters = stationMap.get(name).voters;
            renderVoters(groupVoters);
        });
    } else {
        // Single station (or unknown) - render as-is
        renderVoters(voters);
    }

    htmlParts.push(`
</body>
</html>`);

    html += htmlParts.join('');
    
    return html;
};

// Generate preview (first 2 pages = 10 slips)
export const generatePreview = async (req, res) => {
    try {
        const { orderId } = req.body;
        const userId = req.userId;
        const userRole = req.userRole;

        console.log('========================================');
        console.log('GENERATE PREVIEW POST REQUEST');
        console.log('========================================');
        console.log('Order ID:', orderId);
        console.log('User ID:', userId);
        console.log('User Role:', userRole);
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        console.log('Timestamp:', new Date().toISOString());

        console.log('Searching for order in database...');
        // Build query - admins can access all orders
        const query = { orderId };
        if (userRole !== 'admin') {
            query.userId = userId;
        }
        // Use .lean() to get fresh data from DB and avoid Mongoose document caching
        const order = await Order.findOne(query).lean();

        if (!order) {
            console.error('❌ ORDER NOT FOUND');
            console.error('Search criteria:', query);
            return res.status(404).json({ 
                status: 'error',
                message: 'Order not found' 
            });
        }

        console.log('✅ Order found in database');
        console.log('Order details:', {
            orderId: order.orderId,
            voterCount: order.voters?.length || 0,
            hasCustomization: !!order.customization,
            hasLocation: !!order.location,
            customizationKeys: order.customization ? Object.keys(order.customization) : [],
            locationKeys: order.location ? Object.keys(order.location) : [],
            slipsPerPage: order.customization?.slipsPerPage
        });
        console.log('🎫 Customization.slipsPerPage:', order.customization?.slipsPerPage);

        if (!order.voters || order.voters.length === 0) {
            console.error('❌ NO VOTERS IN ORDER');
            return res.status(400).json({ 
                status: 'error',
                message: 'No voter data found in order' 
            });
        }

        // ✅ CHECK IF PREVIEW PDF ALREADY EXISTS (avoid re-generation)
        if (order.previewPdfFilename) {
            const tempDir = path.join(__dirname, '..', 'public', 'temp-pdfs');
            const existingPath = path.join(tempDir, order.previewPdfFilename);
            if (fs.existsSync(existingPath)) {
                console.log('✅ Preview PDF already exists, serving cached version:', order.previewPdfFilename);
                const pdfUrl = `/api/slips/preview-pdf/${order.previewPdfFilename}`;
                return res.json({
                    status: 'success',
                    message: 'Preview already generated (cached).',
                    pdfUrl: pdfUrl,
                    filename: order.previewPdfFilename,
                    cleanup: `/api/slips/cleanup/${order.previewPdfFilename}`
                });
            } else {
                console.log('⚠️ Preview filename in DB but file missing, regenerating...');
            }
        }

        // If Malayalam name is not in order, fetch it from Symbol model
        if (!order.customization.symbolNameMalayalam && order.customization.symbolId) {
            try {
                const Symbol = (await import('../models/Symbol.js')).default;
                const symbol = await Symbol.findById(order.customization.symbolId);
                if (symbol && symbol.nameMalayalam) {
                    order.customization.symbolNameMalayalam = symbol.nameMalayalam;
                    console.log('✅ Fetched Malayalam name from Symbol:', symbol.nameMalayalam);
                }
            } catch (err) {
                console.warn('⚠️ Could not fetch symbol Malayalam name:', err.message);
            }
        }

        // Generate HTML for preview (first 2 pages based on slipsPerPage)
        const slipsPerPage = order.customization?.slipsPerPage || 5;
        const previewVoterLimit = slipsPerPage * 2; // 2 pages: 10 for 5/page, 12 for 6/page

        console.log(`Generating HTML for preview (first ${previewVoterLimit} voters = 2 pages with ${slipsPerPage} slips/page)...`);
        console.log('Total voters in order:', order.voters.length);
        console.log('First voter sample:', JSON.stringify(order.voters[0], null, 2));
        console.log('Customization details:', JSON.stringify(order.customization, null, 2).substring(0, 500) + '...');
        console.log('Location details:', JSON.stringify(order.location, null, 2));
        
        let html;
        try {
            const htmlStartTime = Date.now();
            html = await generateSlipHTML(order, 0, previewVoterLimit);
            console.log(`✅ HTML generated for ${previewVoterLimit} voters in`, Date.now() - htmlStartTime, 'ms');
            console.log('HTML length:', html.length, 'characters (', (html.length / 1024).toFixed(2), 'KB)');
        } catch (htmlError) {
            console.error('❌ ERROR GENERATING HTML:', htmlError.message);
            console.error('Stack:', htmlError.stack);
            throw htmlError;
        }

        // Generate PDF using FRESH browser for true concurrency (each user gets their own browser)
        let pdf;
        let browser;
        let page;
        const maxAttempts = 2;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(`\n📄 PDF Generation Attempt ${attempt}/${maxAttempts}`);
                console.log('Creating fresh browser for this user (concurrent-safe)...');
                const browserStartTime = Date.now();
                
                // ✅ USE FRESH BROWSER - allows multiple users to generate previews simultaneously
                browser = await createFreshBrowser();
                console.log('✅ Fresh browser ready in', Date.now() - browserStartTime, 'ms');
                
                console.log('Creating new page...');
                page = await browser.newPage();
                
                // Disable unnecessary features for faster PDF generation
                await page.setBypassCSP(true);
                await page.setJavaScriptEnabled(false); // No JS needed for PDF
                await page.setCacheEnabled(true);
                
                console.log('✅ New page created');
                
                // Set content - symbols are base64 embedded, no network wait needed
                console.log('Setting HTML content...');
                const contentStartTime = Date.now();
                await page.setContent(html, { 
                    waitUntil: 'domcontentloaded', // Faster than 'load' - no external resources
                    timeout: 15000  // 15 seconds (preview is small)
                });
                console.log('✅ Content set in', Date.now() - contentStartTime, 'ms');
                
                // Skip image wait - symbols are base64 embedded, renders immediately
                
                console.log('Generating PDF from HTML...');
                const pdfStartTime = Date.now();
                pdf = await page.pdf({
                    format: 'A4',
                    printBackground: true,
                    margin: { top: 0, bottom: 0, left: 0, right: 0 },
                    timeout: 15000  // 15 seconds (reduced)
                });
                console.log('✅ PDF generated in', Date.now() - pdfStartTime, 'ms');
                console.log('PDF size:', pdf.length, 'bytes (', (pdf.length / 1024).toFixed(2), 'KB)');
                
                // Verify PDF starts with correct header
                const pdfHeader = String.fromCharCode(...pdf.slice(0, 8));
                console.log('Validating PDF header:', pdfHeader);
                if (!pdfHeader.startsWith('%PDF')) {
                    console.error('❌ INVALID PDF HEADER');
                    console.error('First 20 bytes:', pdf.slice(0, 20));
                    throw new Error('Generated PDF is invalid - missing PDF header');
                }
                console.log('✅ PDF validation successful');
                
                // ✅ Close fresh browser (not shared, safe to close)
                await page.close();
                await browser.close();
                console.log('✅ Fresh browser closed');
                console.log('Total processing time:', Date.now() - browserStartTime, 'ms');
                
                // Success! Break out of retry loop
                break;
                
            } catch (pdfError) {
                console.error(`❌ Preview PDF generation attempt ${attempt} failed:`, pdfError.message);
                
                // Clean up page and browser if they exist
                try { if (page) await page.close(); } catch (e) {}
                try { if (browser) await browser.close(); } catch (e) {}
                
                // Check if this is a transient error that we should retry
                const isTransient = pdfError && (
                    pdfError.code === 'ECONNRESET' || 
                    (pdfError.message && (
                        pdfError.message.includes('ECONNRESET') ||
                        pdfError.message.includes('Target closed') ||
                        pdfError.message.includes('Connection closed')
                    ))
                );
                
                if (isTransient && attempt < maxAttempts) {
                    console.log('⚠️ Transient error detected, will create new fresh browser');
                    console.log(`⏳ Retrying in 2 seconds... (attempt ${attempt + 1}/${maxAttempts})`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue; // Retry
                }
                
                // Non-transient error or max attempts reached
                if (attempt === maxAttempts) {
                    console.error('❌ All retry attempts exhausted');
                }
                throw pdfError; // Re-throw to outer catch
            }
        }

        // Save PDF to temporary directory with STABLE filename
        const tempDir = path.join(__dirname, '..', 'public', 'temp-pdfs');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // ✅ STABLE FILENAME - same filename per order (no timestamp)
        const filename = `preview-${orderId}.pdf`;
        const filepath = path.join(tempDir, filename);
        fs.writeFileSync(filepath, pdf);
        
        // ✅ PERSIST preview filename to database
        try {
            await Order.findOneAndUpdate({ orderId }, { previewPdfFilename: filename });
            console.log(`✅ Saved previewPdfFilename to DB: ${filename}`);
        } catch (dbErr) {
            console.warn('⚠️ Could not update Order with previewPdfFilename:', dbErr.message);
        }
        
        // Store in map for cleanup
        tempPDFs.set(filename, {
            path: filepath,
            createdAt: Date.now(),
            timeout: null
        });
        
        // Schedule auto-cleanup after 5 minutes
        scheduleCleanup(filename);
        
        console.log('✅ PDF saved to:', filepath);
        console.log('✅ Scheduled for auto-cleanup in 5 minutes');
        
        // ✅ TRIGGER PERMANENT PDF GENERATION immediately after extraction
        // This generates the full PDF while user views preview
        // By the time they complete payment, PDF is ready for instant download
        console.log(`\n🔔 TRIGGERING PERMANENT PDF GENERATION (${order.voters.length} voters)...`);
        console.log(`📝 Order ID: ${orderId}`);
        
        try {
            const { generatePDFBackground } = await import('../utils/pdfGenerator.js');
            console.log('✅ Dynamic import successful');
            
            // Generate permanent PDF in background (saves to permanent-pdfs/)
            generatePDFBackground(order, orderId).catch(err => {
                console.error('⚠️ Background permanent PDF generation error (non-blocking):', err.message);
                console.error('⚠️ Stack:', err.stack);
                // Don't let background PDF errors fail the preview response
            });
            console.log(`✅ Permanent PDF generation started in background for: ${orderId}\n`);
        } catch (importErr) {
            console.error('❌ Failed to import generatePDFBackground:', importErr.message);
        }
        
        // Send PROTECTED PDF file URL (requires authentication)
        const pdfUrl = `/api/slips/preview-pdf/${filename}`;
        res.json({
            status: 'success',
            message: 'Preview generated. Full PDF is being prepared for download.',
            pdfUrl: pdfUrl,
            filename: filename,
            cleanup: `/api/slips/cleanup/${filename}`
        });
        
        console.log('✅ Sent PDF URL to client:', pdfUrl);
        console.log('========================================');

    } catch (error) {
        console.error('========================================');
        console.error('❌ GENERATE PREVIEW ERROR');
        console.error('========================================');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('========================================');
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to generate preview',
            error: error.message 
        });
    }
};

// View preview HTML directly in browser (GET endpoint)
// Protected - requires authentication and ownership
export const viewPreview = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.userId; // Set by authHTML middleware
        const userRole = req.userRole;

        console.log('========================================');
        console.log('VIEW PREVIEW HTML REQUEST (Protected)');
        console.log('========================================');
        console.log('Order ID:', orderId);
        console.log('User ID:', userId);
        console.log('User Role:', userRole);
        console.log('Timestamp:', new Date().toISOString());

        // Find order with user restriction (ownership check)
        console.log('Searching for order in database...');
        const query = { orderId };
        if (userRole !== 'admin') {
            query.userId = userId;
        }
        const order = await Order.findOne(query);

        if (!order) {
            console.error('❌ ORDER NOT FOUND OR UNAUTHORIZED');
            console.error('Search criteria:', { orderId, userId });
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Order Not Found</title>
                    <link rel="preconnect" href="https://fonts.googleapis.com">
                    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600&display=swap" rel="stylesheet">
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                    <style>
                        body {
                            font-family: 'Noto Sans', Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        }
                        .container {
                            background: white;
                            padding: 3rem;
                            border-radius: 20px;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                            text-align: center;
                            max-width: 500px;
                        }
                        .icon {
                            font-size: 4rem;
                            color: #e53e3e;
                            margin-bottom: 1rem;
                        }
                        h1 {
                            color: #2d3748;
                            margin-bottom: 1rem;
                        }
                        p {
                            color: #718096;
                            margin-bottom: 2rem;
                            line-height: 1.6;
                        }
                        .btn {
                            display: inline-block;
                            padding: 1rem 2rem;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            text-decoration: none;
                            border-radius: 8px;
                            font-weight: 600;
                            transition: transform 0.3s;
                        }
                        .btn:hover {
                            transform: translateY(-2px);
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="icon"><i class="fas fa-exclamation-triangle"></i></div>
                        <h1>Order Not Found</h1>
                        <p>This order does not exist or you don't have permission to view it.</p>
                        <a href="/dashboard.html" class="btn"><i class="fas fa-arrow-left"></i> Return to Dashboard</a>
                    </div>
                </body>
                </html>
            `);
        }

        console.log('✅ Order found in database');
        console.log('Order details:', {
            orderId: order.orderId,
            totalVoters: order.voters?.length || 0,
            customization: order.customization ? 'Present' : 'Missing',
            location: order.location ? 'Present' : 'Missing'
        });

        if (!order.voters || order.voters.length === 0) {
            console.error('❌ NO VOTERS IN ORDER');
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>No Voter Data</title>
                    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600&display=swap" rel="stylesheet">
                </head>
                <body style="font-family: 'Noto Sans', Arial, sans-serif; text-align: center; padding: 50px;">
                    <h2>❌ No Voter Data</h2>
                    <p>This order has no voter data to preview.</p>
                    <a href="/dashboard.html">Return to Dashboard</a>
                </body></html>
            `);
        }

        // Generate HTML for first 10 slips - NO PDF GENERATION
        // Return clean HTML with A4 pages, 5 slips per page
        console.log('Generating HTML for first 10 voters...');
        const startTime = Date.now();
        const html = await generateSlipHTML(order, 0, 10);
        console.log('✅ HTML generated in', Date.now() - startTime, 'ms');
        console.log('HTML size:', html.length, 'characters', '(', (html.length / 1024).toFixed(2), 'KB)');

        // Return the HTML directly (no wrapper - will be embedded in preview.html)
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        console.log('✅ Sending HTML preview to client...');
        console.log('Total processing time:', Date.now() - startTime, 'ms');
        console.log('========================================');
        res.send(html);

    } catch (error) {
        console.error('========================================');
        console.error('❌ VIEW PREVIEW ERROR');
        console.error('========================================');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('========================================');
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error</title>
                <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600&display=swap" rel="stylesheet">
            </head>
            <body style="font-family: 'Noto Sans', Arial, sans-serif; text-align: center; padding: 50px;">
                <h2>❌ Error Generating Preview</h2>
                <p>${error.message}</p>
                <a href="/dashboard.html">Return to Dashboard</a>
            </body></html>
        `);
    }
};

// Test Puppeteer with actual slip HTML (no logo)
export const testPuppeteer = async (req, res) => {
    try {
        console.log('Testing Puppeteer with slip HTML...');
        const testHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam:wght@400;600&family=Noto+Sans:wght@400;600&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Noto Sans Malayalam', 'Noto Sans', Arial, sans-serif; margin: 0; padding: 20mm; }
        .slip { border: 2px solid black; padding: 10px; margin-bottom: 10px; }
        h3 { margin: 0 0 10px 0; }
        p { margin: 5px 0; }
    </style>
</head>
<body>
    <div class="slip">
        <h3>Test Voter Slip</h3>
        <p><strong>Name:</strong> Test Voter</p>
        <p><strong>Guardian:</strong> Test Guardian</p>
        <p><strong>House:</strong> Test House</p>
    </div>
</body>
</html>`;
        
        const browser = await getBrowser();
        console.log('Browser ready');
        
        const page = await browser.newPage();
        await page.setContent(testHtml, { waitUntil: 'load', timeout: 10000 });
        console.log('Content set');
        
        const pdf = await page.pdf({ 
            format: 'A4',
            printBackground: true,
            margin: { top: 0, bottom: 0, left: 0, right: 0 }
        });
        console.log('PDF generated, size:', pdf.length, 'bytes');
        
        // Log first few bytes to verify PDF format
        console.log('First 20 bytes:', pdf.slice(0, 20).toString('hex'));
        console.log('PDF header:', pdf.slice(0, 8).toString());
        
        await page.close();
        console.log('Page closed (browser kept alive)');
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="test.pdf"');
        res.setHeader('Content-Length', pdf.length);
        res.send(pdf);
    } catch (error) {
        console.error('Puppeteer test error:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
};

// Download full slip (only for paid orders)
export const downloadSlip = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.userId;
        const userRole = req.userRole;

        console.log(`\n${'='.repeat(60)}`);
        console.log(`📥 DOWNLOAD REQUEST RECEIVED`);
        console.log(`${'='.repeat(60)}`);
        console.log(`   orderId from URL: "${orderId}"`);
        console.log(`   userId from auth: ${userId}`);
        console.log(`   userRole: ${userRole}`);
        console.log(`   userId type: ${typeof userId}`);
        console.log(`   userId constructor: ${userId?.constructor?.name}`);
        console.log(`${'='.repeat(60)}\n`);

        // Build query - admins can access all orders
        const query = { orderId };
        if (userRole !== 'admin') {
            query.userId = userId;
        }
        const order = await Order.findOne(query);

        if (!order) {
            console.log(`❌ ORDER NOT FOUND!`);
            console.log(`   Query:`, query);
            console.log(`   This usually means:`);
            console.log(`     1. Wrong orderId (check if it's MongoDB _id instead)`);
            console.log(`     2. Wrong userId (user doesn't own this order)`);
            console.log(`     3. Order doesn't exist in database\n`);
            
            return res.status(404).json({ 
                status: 'error',
                message: 'Order not found' 
            });
        }
        
        console.log(`✅ ORDER FOUND!`);
        console.log(`   orderId: ${order.orderId}`);
        console.log(`   paymentStatus: ${order.paymentStatus}`);
        console.log(`   totalVoters: ${order.totalVoters}\n`);

        // Check payment status
        if (order.paymentStatus !== 'completed') {
            return res.status(403).json({ 
                status: 'error',
                message: 'Payment not completed. Please complete payment to download.',
                isPaid: false
            });
        }

        // Try to get cached PDF first
        console.log(`🔍 Checking for cached PDF...`);
        let pdfPath = getPDFFilePath(orderId);

        if (pdfPath) {
            // Serve cached PDF (much faster!)
            console.log(`⚡ SERVING CACHED PDF from: ${pdfPath}`);
            console.log(`   File size: ${fs.statSync(pdfPath).size} bytes\n`);
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="voter-slips-${orderId}.pdf"`);
            res.setHeader('Cache-Control', 'private, max-age=31536000'); // 1 year
            res.setHeader('X-Content-Type-Options', 'nosniff');
            
            const pdf = fs.readFileSync(pdfPath);
            
            // Update download count
            order.downloadCount += 1;
            order.lastDownloadAt = new Date();
            await order.save();

            console.log(`✅ Cached PDF sent successfully!\n`);
            return res.end(pdf);
        }

        // ✅ DOUBLE-CHECK: Verify permanent PDF doesn't exist on disk before generating
        // (getPDFFilePath might return null if pdfJobs cache was cleared but file still exists)
        const permanentPdfDir = path.join(process.cwd(), 'public', 'permanent-pdfs');
        const permanentPdfPath = path.join(permanentPdfDir, `${orderId}.pdf`);
        
        if (fs.existsSync(permanentPdfPath)) {
            console.log(`✅ FOUND PERMANENT PDF ON DISK (bypassing cache check)!`);
            console.log(`   Path: ${permanentPdfPath}`);
            console.log(`   Size: ${(fs.statSync(permanentPdfPath).size / 1024 / 1024).toFixed(2)} MB\n`);
            
            // Register it in cache for next time
            registerPDFJob(orderId, {
                orderId,
                path: permanentPdfPath,
                status: 'ready',
                createdAt: new Date()
            });
            
            // Serve the existing permanent PDF
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="voter-slips-${orderId}.pdf"`);
            res.setHeader('Cache-Control', 'private, max-age=31536000');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            
            const pdf = fs.readFileSync(permanentPdfPath);
            
            // Update download count
            order.downloadCount += 1;
            order.lastDownloadAt = new Date();
            await order.save();

            console.log(`✅ Served existing permanent PDF successfully!\n`);
            return res.end(pdf);
        }
        
        // If PDF not cached yet, generate on-demand (slower but still works)
        console.log(`📄 PDF NOT CACHED - Generating new PDF...`);
        console.log(`   Order: ${orderId}`);
        console.log(`   Voters: ${order.totalVoters}`);
        console.log(`   This will take 20-50 seconds...\n`);
        
        // If Malayalam name is not in order, fetch it from Symbol model
        if (!order.customization.symbolNameMalayalam && order.customization.symbolId) {
            try {
                const Symbol = (await import('../models/Symbol.js')).default;
                const symbol = await Symbol.findById(order.customization.symbolId);
                if (symbol && symbol.nameMalayalam) {
                    order.customization.symbolNameMalayalam = symbol.nameMalayalam;
                    console.log('✅ Fetched Malayalam name from Symbol for download:', symbol.nameMalayalam);
                }
            } catch (err) {
                console.warn('⚠️ Could not fetch symbol Malayalam name:', err.message);
            }
        }

        // Generate HTML for all slips
        const html = await generateSlipHTML(order);

        // ✅ ALWAYS use fresh browser for on-demand generation to prevent browser crashes
        // This ensures the persistent browser stays stable for preview generation
        const useFreshBrowser = true; // Changed from: order.totalVoters > 1000
        console.log(`📄 Generating PDF on-demand for ${orderId} (${order.totalVoters} voters, fresh browser for stability)`);
        
        let browser;
        let browserStartTime = Date.now();
        
        if (useFreshBrowser) {
            browser = await createFreshBrowser();
            console.log('✅ Fresh browser created in', Date.now() - browserStartTime, 'ms');
        } else {
            console.log('Getting persistent browser instance...');
            browser = await getBrowser();
            console.log('✅ Browser ready in', Date.now() - browserStartTime, 'ms');
        }
        
        let page;
        let pdf;
        
        try {
            console.log('Creating new page...');
            page = await browser.newPage();
            
            // Disable unnecessary features for faster PDF generation
            await page.setBypassCSP(true);
            await page.setJavaScriptEnabled(false); // No JS needed for PDF
            await page.setCacheEnabled(true);
            
            console.log('✅ New page created with optimizations');
            
            // Set content - symbols are base64 embedded, no network wait needed
            console.log('Setting HTML content...');
            const contentStartTime = Date.now();
            await page.setContent(html, { 
                waitUntil: 'domcontentloaded', // Faster than 'load' - no external resources
                timeout: 120000  // 2 minutes
            });
            console.log('✅ Content set in', Date.now() - contentStartTime, 'ms');
            
            console.log('Generating PDF from HTML...');
            const pdfStartTime = Date.now();
            pdf = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: 0, bottom: 0, left: 0, right: 0 },
                timeout: 120000
            });
            console.log('✅ PDF generated in', Date.now() - pdfStartTime, 'ms');
            console.log('PDF size:', (pdf.length / 1024 / 1024).toFixed(2), 'MB');
            
            // Verify PDF header
            if (String.fromCharCode(...pdf.slice(0, 4)) !== '%PDF') {
                throw new Error('Invalid PDF generated');
            }
            
            // Close page
            await page.close();
            
            // Close fresh browser if we created one
            if (useFreshBrowser) {
                console.log('Closing fresh browser instance...');
                await browser.close();
                console.log('✅ Fresh browser closed');
            } else {
                console.log('Keeping persistent browser alive for reuse');
            }

        } catch (error) {
            // Make sure to close page and fresh browser on error
            if (page) {
                try {
                    await page.close();
                } catch (e) {
                    console.error('Error closing page:', e.message);
                }
            }
            
            if (useFreshBrowser && browser) {
                try {
                    console.log('⚠️ Error occurred, force-closing fresh browser...');
                    await browser.close();
                    console.log('✅ Fresh browser force-closed');
                } catch (e) {
                    console.error('Error closing fresh browser:', e.message);
                }
            } else if (browser) {
                // ✅ NEW: If using persistent browser and error occurs, mark it as disconnected
                // so a new instance is created on next request
                console.log('⚠️ Error occurred with persistent browser, marking as disconnected');
                browserInstance = null;
            }
            
            throw error;
        }

        // ✅ SAVE PDF PERMANENTLY to disk for future downloads
        // (permanentPdfDir already declared above for double-check)
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(permanentPdfDir)) {
            fs.mkdirSync(permanentPdfDir, { recursive: true });
            console.log('✅ Created permanent PDFs directory');
        }
        
        const permanentPdfPath2 = path.join(permanentPdfDir, `${orderId}.pdf`);
        
        // Save PDF to permanent storage
        console.log(`💾 Saving PDF permanently: ${permanentPdfPath2}`);
        fs.writeFileSync(permanentPdfPath2, pdf);
        console.log('✅ PDF saved permanently to disk');
        
        // Register in pdfJobs cache for instant retrieval next time
        registerPDFJob(orderId, {
            orderId,
            path: permanentPdfPath2,
            status: 'ready',
            createdAt: new Date()
            // NO deletionScheduled - permanent storage!
        });
        
        // ✅ PERSIST permanent filename to database
        try {
            await Order.findOneAndUpdate({ orderId }, { permanentPdfFilename: `${orderId}.pdf` });
            console.log(`✅ Saved permanentPdfFilename to DB: ${orderId}.pdf`);
        } catch (dbErr) {
            console.warn('⚠️ Could not update Order with permanentPdfFilename:', dbErr.message);
        }
        
        // Update download count
        order.downloadCount += 1;
        order.lastDownloadAt = new Date();
        await order.save();

        // Stream PDF directly to response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', pdf.length);
        res.setHeader('Content-Disposition', `attachment; filename="voter-slips-${orderId}.pdf"`);
        res.setHeader('Cache-Control', 'private, max-age=31536000'); // Cache for 1 year
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        console.log('⚡ Streaming PDF to client...');
        res.end(pdf);
        console.log('✅ PDF sent successfully (saved permanently for future downloads)');

    } catch (error) {
        console.error('❌ Download slip error:', error);
        console.error('Error stack:', error.stack);
        
        // Only send error response if headers haven't been sent yet
        if (!res.headersSent) {
            res.status(500).json({ 
                status: 'error',
                message: 'Failed to download slip',
                error: error.message 
            });
        }
    }
};

// Manual cleanup endpoint - called when user closes browser/tab
export const cleanupPreview = async (req, res) => {
    try {
        const { filename } = req.params;
        
        console.log('🗑️ Manual cleanup requested for:', filename);
        cleanupPDF(filename);
        
        res.json({
            status: 'success',
            message: 'PDF cleaned up successfully'
        });
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Cleanup failed',
            error: error.message
        });
    }
};

// Serve preview PDF file with authentication and ownership check
export const servePreviewPDF = async (req, res) => {
    try {
        const { filename } = req.params;
        const userId = req.userId;

        console.log('📄 Preview PDF request:', filename, 'by user:', userId);

        // Extract order ID from filename (format: preview-ORD-YYYYMMDD-XXXXXX.pdf)
        // Remove .pdf extension first, then extract orderId
        const filenameWithoutExt = filename.replace('.pdf', '');
        const orderIdMatch = filenameWithoutExt.match(/preview-(ORD-.+)/);
        if (!orderIdMatch) {
            console.error('❌ Invalid filename format:', filename);
            return res.status(400).json({
                status: 'error',
                message: 'Invalid filename format'
            });
        }

        const orderId = orderIdMatch[1];
        console.log('Extracted order ID:', orderId);

        // Verify user owns this order
        const order = await Order.findOne({ orderId, userId });
        if (!order) {
            console.error('❌ Order not found or unauthorized:', orderId, userId);
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized access to this preview'
            });
        }

        console.log('✅ User authorized for order:', orderId);

        // Serve the PDF file
        const filePath = path.join(__dirname, '..', 'public', 'temp-pdfs', filename);
        
        if (!fs.existsSync(filePath)) {
            console.error('❌ PDF file not found:', filePath);
            return res.status(404).json({
                status: 'error',
                message: 'Preview PDF not found or expired'
            });
        }

        console.log('✅ Serving PDF file:', filename);
        res.setHeader('Content-Type', 'application/pdf');
        res.sendFile(filePath);

    } catch (error) {
        console.error('❌ Serve preview PDF error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to serve preview PDF',
            error: error.message
        });
    }
};

// Get PDF generation status for order success page
export const getPDFStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.userId;
        const userRole = req.userRole;

        console.log(`\n[PDF STATUS CHECK] Order: ${orderId}, User: ${userId}, Role: ${userRole}`);

        // Verify user owns this order (or is admin)
        const query = { orderId };
        if (userRole !== 'admin') {
            query.userId = userId;
        }
        const order = await Order.findOne(query);
        if (!order) {
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized access to this order'
            });
        }

        // Check if payment is completed
        if (order.paymentStatus !== 'completed') {
            return res.json({
                status: 'pending',
                message: 'Payment not completed',
                isPaid: false,
                pdfReady: false
            });
        }

        // Check PDF generation status using getPDFJobStatus
        const jobStatus = getPDFJobStatus(orderId);
        console.log(`[PDF STATUS] Job status:`, jobStatus);

        // Check if permanent PDF exists on disk
        const permanentPdfPath = path.join(process.cwd(), 'public', 'permanent-pdfs', `${orderId}.pdf`);
        const pdfExists = fs.existsSync(permanentPdfPath);
        console.log(`[PDF STATUS] PDF exists on disk: ${pdfExists}`);

        if (pdfExists) {
            // PDF is ready for download
            return res.json({
                status: 'ready',
                message: 'PDF is ready for download',
                isPaid: true,
                pdfReady: true,
                progress: 100,
                downloadCount: order.downloadCount || 0
            });
        }

        // Check job status
        if (jobStatus.status === 'generating') {
            return res.json({
                status: 'generating',
                message: 'PDF is being generated in background',
                isPaid: true,
                pdfReady: false,
                progress: jobStatus.progress || 50,
                estimatedTime: '20-50 seconds'
            });
        }

        if (jobStatus.status === 'failed') {
            return res.json({
                status: 'failed',
                message: 'PDF generation failed, will generate on download',
                isPaid: true,
                pdfReady: false,
                progress: 0,
                error: jobStatus.error
            });
        }

        // No job status and no PDF = not started yet or still in queue
        return res.json({
            status: 'pending',
            message: 'PDF generation will start shortly',
            isPaid: true,
            pdfReady: false,
            progress: 10,
            estimatedTime: '20-50 seconds'
        });

    } catch (error) {
        console.error('❌ Get PDF status error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to check PDF status',
            error: error.message
        });
    }
};
