import puppeteer from 'puppeteer';
import Order from '../models/Order.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Persistent browser instance for better performance
let browserInstance = null;

// Store temporary PDF files with timestamps
const tempPDFs = new Map(); // Map<filename, { path, createdAt, timeout }>

// Get or create browser instance with optimizations - Export for admin use
export const getBrowser = async () => {
    if (!browserInstance || !browserInstance.isConnected()) {
        console.log('🚀 Launching new Puppeteer browser instance...');
        browserInstance = await puppeteer.launch({
            headless: true,
            args: [
                // Keep args minimal for Windows stability
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });
        console.log('✅ Browser instance ready with optimized memory settings');
        
        // Handle browser disconnection
        browserInstance.on('disconnected', () => {
            console.log('⚠️ Browser disconnected, will create new instance on next request');
            browserInstance = null;
        });
    } else {
        console.log('♻️ Reusing existing browser instance');
    }
    return browserInstance;
};

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
export const generateSlipHTML = (order, startIndex = 0, endIndex = null) => {
    const voters = endIndex ? order.voters.slice(startIndex, endIndex) : order.voters.slice(startIndex);
    console.log(`generateSlipHTML: Processing ${voters.length} voters (from index ${startIndex} to ${endIndex || 'end'})`);
    
    // Debug: check if voters have polling_station_name
    const votersWithStation = voters.filter(v => v.polling_station_name);
    console.log(`🔍 Voters with polling_station_name: ${votersWithStation.length}/${voters.length}`);
    if (votersWithStation.length > 0) {
        console.log(`📍 Sample station name: "${votersWithStation[0].polling_station_name}"`);
    }
    const slipsPerPage = 5;
    
    // Use Malayalam name if available, otherwise English
    const displaySymbolName = order.customization.symbolNameMalayalam || order.customization.symbolName;
    const pollingStation = order.location.pollingStationName || order.location.pollingStation;
    
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
    
    let html = `
<!DOCTYPE html>
<html lang="ml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Voter Slips - ${order.orderId}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Noto Sans Malayalam', Arial, sans-serif;
            background: white;
        }
        
        .page {
            width: 210mm;
            height: 297mm;
            padding: 8mm 10mm;
            display: flex;
            flex-direction: column;
            page-break-after: always;
            box-sizing: border-box;
        }
        
        .page:last-child {
            page-break-after: auto;
        }
        
        .voter-slip {
            width: 100%;
            height: 52mm;
            border: 2px solid #000;
            display: flex;
            padding: 2.5mm;
            position: relative;
            flex-shrink: 0;
            box-sizing: border-box;
            margin-bottom: 5mm;
        }
        
        .voter-slip::after {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            bottom: -2.5mm;
            height: 0;
            border-bottom: 2px dashed #999;
            z-index: 10;
        }
        
        .voter-slip:last-child {
            margin-bottom: 0;
        }
        
        .voter-slip:last-child::after {
            display: none;
        }
        
        .voter-slip > * {
            overflow: hidden;
        }
        
        .slip-left {
            width: 40mm;
            border-right: 2px dotted #000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 2mm 2mm 3mm 2mm;
            margin-right: 3mm;
            text-align: center;
            flex-shrink: 0;
        }
        
        .symbol-header {
            font-size: 9pt;
            font-weight: bold;
            margin-bottom: 1mm;
            text-align: center;
            color: #333;
            line-height: 1.1;
        }
        
        .symbol-image {
            width: 26mm;
            height: 26mm;
            margin-bottom: 1mm;
            object-fit: contain;
            flex-shrink: 0;
        }
        
        .symbol-name {
            font-size: 11pt;
            font-weight: bold;
            line-height: 1.15;
            text-align: center;
            word-wrap: break-word;
            overflow-wrap: break-word;
            word-break: break-word;
            max-width: 38mm;
            hyphens: auto;
        }
        
        .slip-right {
            flex: 1;
            padding: 2mm 3mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
            min-width: 0;
        }
        
        .slip-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5mm;
            font-size: 10pt;
            flex-wrap: wrap;
            gap: 1mm;
            overflow: hidden;
        }
        
        .slip-number {
            font-weight: bold;
            font-size: 14pt;
            color: #000;
        }
        
        .sec-id {
            font-weight: bold;
            font-size: 12pt;
        }
        
        .voter-info {
            flex: 1;
            overflow: hidden;
            min-height: 0;
        }
        
        .info-row {
            margin-bottom: 1mm;
            font-size: 11pt;
            display: flex;
            line-height: 1.3;
            overflow: hidden;
        }
        
        .info-row.voter-name {
            font-size: 13pt;
            font-weight: bold;
            margin-bottom: 1.5mm;
            overflow: hidden;
        }
        
        .info-label {
            font-weight: bold;
            min-width: 18mm;
            flex-shrink: 0;
        }
        
        .info-value {
            flex: 1;
            word-wrap: break-word;
            overflow-wrap: break-word;
            word-break: break-word;
            overflow: hidden;
            text-overflow: ellipsis;
            min-width: 0;
        }
        
        .polling-station-info {
            font-size: 12pt;
            border-top: 1px solid #ccc;
            padding-top: 1mm;
            line-height: 1.3;
            word-wrap: break-word;
            overflow-wrap: break-word;
            word-break: break-word;
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* Cover page for multi-station summary */
        .cover-page {
            width: 210mm;
            height: 297mm;
            padding: 18mm 18mm;
            page-break-after: always;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            box-sizing: border-box;
        }
        .cover-title {
            font-size: 22pt;
            font-weight: 800;
            margin-bottom: 6mm;
        }
        .cover-meta {
            font-size: 12pt;
            margin-bottom: 10mm;
            line-height: 1.6;
        }
        .station-list {
            margin-top: 6mm;
        }
        .station-item {
            font-size: 12pt;
            padding: 5px 0;
            border-bottom: 1px dashed #ccc;
            display: flex;
            justify-content: space-between;
            gap: 8mm;
        }
        .station-name {
            font-weight: 700;
            flex: 1;
        }
        .station-count {
            min-width: 35mm;
            text-align: right;
            font-weight: 600;
        }
        
        @media print {
            @page {
                size: A4;
                margin: 0;
            }
        }
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
    const renderVoters = (arr) => {
        for (let i = 0; i < arr.length; i += slipsPerPage) {
            html += '<div class="page">';
            const pageVoters = arr.slice(i, i + slipsPerPage);
            pageVoters.forEach((voter, index) => {
            // Use original serial number from SEC data, NOT recalculated
            const serialNo = voter.sl_no || (startIndex + i + index + 1);
            
            // Use voter-specific polling station if available (for multi-station orders)
            const voterPollingStation = voter.polling_station_name || pollingStation;
            
            const genderAge = voter.gender_age ? voter.gender_age.split('/') : ['', ''];
            const gender = genderAge[0]?.trim() || '';
            const age = genderAge[1]?.trim() || '';
            
            html += `
            <div class="voter-slip">
                <div class="slip-left">
                    <div class="symbol-header">നമ്മുടെ ചിഹ്നം</div>
                    <img src="${symbolUrl}" alt="Symbol" class="symbol-image">
                    <div class="symbol-name">${displaySymbolName}</div>
                </div>
                <div class="slip-right">
                    <div class="slip-header">
                        <div class="slip-number">ക്രമ നമ്പർ:  ${serialNo}</div>
                        <div class="sec-id">കാർഡ് നമ്പർ:  ${voter.sec_id || 'N/A'}</div>
                    </div>
                    <div class="voter-info">
                        <div class="info-row voter-name">
                            <span class="info-label">പേര്:  </span>
                            <span class="info-value">${voter.name || 'N/A'}${(gender || age) ? ` (${gender}${gender && age ? '/' : ''}${age})` : ''}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">വീട്ടുപേര്: </span>
                            <span class="info-value">${voter.house_name || ''} ${voter.house_no ? `(${voter.house_no})` : ''}</span>
                        </div>
                        ${voter.guardian_name && voter.guardian_name.trim() ? `
                        <div class="info-row">
                            <span class="info-label">രക്ഷിതാവ്: </span>
                            <span class="info-value">${voter.guardian_name}</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="polling-station-info">
                        <strong>പോളിംഗ് സ്റ്റേഷൻ: </strong> ${voterPollingStation}
                    </div>
                </div>
            </div>`;
            });
            html += '</div>';
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

    html += `
</body>
</html>`;

    return html;
};

// Generate preview (first 2 pages = 10 slips)
export const generatePreview = async (req, res) => {
    try {
        const { orderId } = req.body;
        const userId = req.userId;

        console.log('========================================');
        console.log('GENERATE PREVIEW POST REQUEST');
        console.log('========================================');
        console.log('Order ID:', orderId);
        console.log('User ID:', userId);
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        console.log('Timestamp:', new Date().toISOString());

        console.log('Searching for order in database...');
        const order = await Order.findOne({ orderId, userId });

        if (!order) {
            console.error('❌ ORDER NOT FOUND');
            console.error('Search criteria:', { orderId, userId });
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
            locationKeys: order.location ? Object.keys(order.location) : []
        });

        if (!order.voters || order.voters.length === 0) {
            console.error('❌ NO VOTERS IN ORDER');
            return res.status(400).json({ 
                status: 'error',
                message: 'No voter data found in order' 
            });
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

        // Generate HTML for first 10 slips only
        console.log('Generating HTML for preview (first 10 voters only)...');
        console.log('Total voters in order:', order.voters.length);
        console.log('First voter sample:', JSON.stringify(order.voters[0], null, 2));
        console.log('Customization details:', JSON.stringify(order.customization, null, 2).substring(0, 500) + '...');
        console.log('Location details:', JSON.stringify(order.location, null, 2));
        
        let html;
        try {
            const htmlStartTime = Date.now();
            html = generateSlipHTML(order, 0, 10);
            console.log('✅ HTML generated for 10 voters in', Date.now() - htmlStartTime, 'ms');
            console.log('HTML length:', html.length, 'characters (', (html.length / 1024).toFixed(2), 'KB)');
        } catch (htmlError) {
            console.error('❌ ERROR GENERATING HTML:', htmlError.message);
            console.error('Stack:', htmlError.stack);
            throw htmlError;
        }

        // Generate PDF using persistent browser with speed optimizations
        console.log('Getting browser instance...');
        const browserStartTime = Date.now();
        const browser = await getBrowser();
        console.log('✅ Browser ready in', Date.now() - browserStartTime, 'ms');
        
        console.log('Creating new page...');
        const page = await browser.newPage();
        
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
        const pdf = await page.pdf({
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
        
        // Close only the page, keep browser alive for reuse
        await page.close();
        console.log('Page closed (browser kept alive for reuse)');
        console.log('Total processing time:', Date.now() - browserStartTime, 'ms');

        // Save PDF to temporary directory
        const tempDir = path.join(__dirname, '..', 'public', 'temp-pdfs');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const filename = `preview-${orderId}-${Date.now()}.pdf`;
        const filepath = path.join(tempDir, filename);
        fs.writeFileSync(filepath, pdf);
        
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
        
        // Send PROTECTED PDF file URL (requires authentication)
        const pdfUrl = `/api/slips/preview-pdf/${filename}`;
        res.json({
            status: 'success',
            message: 'Preview generated successfully',
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

        console.log('========================================');
        console.log('VIEW PREVIEW HTML REQUEST (Protected)');
        console.log('========================================');
        console.log('Order ID:', orderId);
        console.log('User ID:', userId);
        console.log('Timestamp:', new Date().toISOString());

        // Find order with user restriction (ownership check)
        console.log('Searching for order in database...');
        const order = await Order.findOne({ orderId, userId });

        if (!order) {
            console.error('❌ ORDER NOT FOUND OR UNAUTHORIZED');
            console.error('Search criteria:', { orderId, userId });
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Order Not Found</title>
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                    <style>
                        body {
                            font-family: Arial, sans-serif;
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
                <html><head><title>No Voter Data</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
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
        const html = generateSlipHTML(order, 0, 10);
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
            <html><head><title>Error</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
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
    <style>
        body { font-family: Arial; margin: 0; padding: 20mm; }
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

        const order = await Order.findOne({ orderId, userId });

        if (!order) {
            return res.status(404).json({ 
                status: 'error',
                message: 'Order not found' 
            });
        }

        if (order.paymentStatus !== 'completed') {
            return res.status(403).json({ 
                status: 'error',
                message: 'Payment not completed. Please complete payment to download.' 
            });
        }

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
        const html = generateSlipHTML(order);

        // Generate PDF using persistent browser with speed optimizations
        console.log('Getting browser instance...');
        const browserStartTime = Date.now();
        const browser = await getBrowser();
        console.log('✅ Browser ready in', Date.now() - browserStartTime, 'ms');
        
        console.log('Creating new page...');
        const page = await browser.newPage();
        
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
            timeout: 120000  // 2 minutes (reduced from 3)
        });
        console.log('✅ Content set in', Date.now() - contentStartTime, 'ms');
        
        // Skip image wait - symbols are base64 embedded, no need to wait
        // This saves significant time especially for large orders
        
        console.log('Generating PDF from HTML...');
        const pdfStartTime = Date.now();
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, bottom: 0, left: 0, right: 0 },
            timeout: 120000  // 2 minutes (reduced from 3)
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
        
        // Close only the page, keep browser alive
        await page.close();
        console.log('Page closed (browser kept alive for reuse)');

        // Update download count
        order.downloadCount += 1;
        order.lastDownloadAt = new Date();
        await order.save();

        console.log(`✅ PDF generated successfully for ${orderId}: ${(pdf.length / 1024 / 1024).toFixed(2)} MB`);

        // Save to temporary file first (same as preview approach)
        const tempDir = path.join(__dirname, '..', 'public', 'temp-pdfs');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const filename = `download-${orderId}-${Date.now()}.pdf`;
        const filePath = path.join(tempDir, filename);
        
        console.log('Saving PDF to temporary file:', filePath);
        fs.writeFileSync(filePath, pdf);
        console.log('✅ PDF saved to file successfully');
        
        // Set optimized response headers for better performance
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', pdf.length);
        res.setHeader('Content-Disposition', `attachment; filename="voter-slips-${orderId}.pdf"`);
        res.setHeader('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        // Send the file (not the buffer) - more efficient for large files
        res.download(filePath, `voter-slips-${orderId}.pdf`, (err) => {
            if (err) {
                console.error('❌ Error sending file:', err);
            } else {
                console.log('✅ File sent successfully');
            }
            
            // Delete the temporary file after sending
            setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log('🗑️ Temporary file deleted:', filename);
                    }
                } catch (cleanupErr) {
                    console.error('⚠️ Failed to delete temp file:', cleanupErr.message);
                }
            }, 5000); // Delete after 5 seconds
        });

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

        // Extract order ID from filename (format: preview-ORD-xxx-timestamp.pdf)
        const orderIdMatch = filename.match(/preview-(ORD-[^-]+-[^-]+)/);
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
