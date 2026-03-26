# ECI Portal Integration - Technical Implementation

## Real ECI Portal Architecture

Based on headless browser inspection of https://voters.eci.gov.in/download-eroll

### Portal Technology Stack
- **Framework**: React SPA (Single Page Application)
- **State Management**: Client-side state with dynamic dropdown population
- **Session**: JSESSIONID cookie-based (~30 min lifetime)
- **Captcha**: Base64 embedded or served from `/captcha/generate`
- **Download**: PDF/ZIP with merged polling station data

---

## Form Structure

### 1. Cascading Dropdowns

```
State (S11 = Kerala)
  └─> Year of Revision (2026, 2025, etc.)
       └─> Roll Type (SIR FinalRoll, Draft, etc.)
            └─> District (ALAPPUZHA, THIRUVANANTHAPURAM, etc.)
                 └─> Assembly Constituency (React Autocomplete Combobox)
                      └─> Language (MALAYALAM default)
                           └─> Polling Parts Table (with Select All)
```

### 2. React Autocomplete (Assembly Constituency)

**Type**: `<input role="combobox">` instead of `<select>`

**Behavior**: 
- User types constituency name
- Dropdown shows matching results
- Press Enter or click to select
- Triggers API call to fetch polling parts

### 3. Polling Parts Selection Table

**Features**:
- Checkbox for each polling station part
- **Select All** checkbox (recommended)
- Search bar for filtering
- Pagination controls (<< < > >>)
- Shows ~7 items per page

**Structure**:
```javascript
{
  "partNo": "1",
  "partName": "Kumara Vilasam Auditorium Aroor",
  "partId": "unique_id_string"
}
```

---

## API Endpoints (Discovered)

### 1. Get Assembly Constituencies
```
Endpoint: /api/getAssemblyConstituencies (likely)
Method: POST
Triggered: When district is selected

Request:
{
  "stateCode": "S11",
  "year": "2026",
  "rollType": "SIR FinalRoll - 2026",
  "districtCode": "ALAPPUZHA"
}

Response:
[
  { "acCode": "102", "acName": "AROOR" },
  { "acCode": "103", "acName": "CHERTHALA" },
  ...
]
```

### 2. Get Polling Parts
```
Endpoint: /api/getPollingParts (likely)
Method: POST
Triggered: When AC is selected

Request:
{
  "stateCode": "S11",
  "year": "2026",
  "rollType": "SIR FinalRoll - 2026",
  "districtCode": "ALAPPUZHA",
  "acCode": "102",
  "language": "MALAYALAM"
}

Response:
[
  {
    "partNo": "1",
    "partName": "Kumara Vilasam Auditorium Aroor",
    "partId": "xyz123"
  },
  ...
]
```

### 3. Download PDFs
```
Endpoint: /api/downloadSelectedParts (likely)
Method: POST
Headers:
  Content-Type: application/json
  Cookie: JSESSIONID=abc123...
  X-Requested-With: XMLHttpRequest

Request:
{
  "stateCode": "S11",
  "year": "2026",
  "rollType": "SIR FinalRoll - 2026",
  "districtCode": "ALAPPUZHA",
  "acCode": "102",
  "language": "MALAYALAM",
  "captcha": "33hmk",
  "selectedParts": ["1", "2", "3", "4", "5", ...],
  "selectAll": true
}

Response on Success:
- Content-Type: application/pdf
- Direct PDF stream
OR
- JSON with download URL

Response on Captcha Error:
{
  "status": "error",
  "message": "Invalid Captcha"
}
```

---

## Playwright Implementation

### Our Current Approach

```javascript
// 1. Launch browser with proper headers
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 ...',
  acceptDownloads: true
});

// 2. Navigate to state-specific URL
await page.goto(`https://voters.eci.gov.in/download-eroll?stateCode=S11`);

// 3. Fill React form sequentially
await page.selectOption('select[aria-label="Year Of Revision"]', '2026');
await page.selectOption('select[aria-label="Roll Type"]', 'SIR FinalRoll - 2026');
await page.selectOption('select[aria-label="District"]', 'ALAPPUZHA');

// 4. Handle React Autocomplete for AC
await page.click('input[role="combobox"]');
await page.fill('input[role="combobox"]', 'AROOR');
await page.keyboard.press('Enter');

// 5. Wait for polling parts table
await page.waitForSelector('text=Select All', { timeout: 15000 });

// 6. Capture captcha screenshot
const captchaElement = await page.$('img[alt="captcha"]');
await captchaElement.screenshot({ path: captchaPath });

// Store session for later use
activeSessions.set(sessionId, { browser, context, page });
```

### Captcha Submission & Download

```javascript
// 7. Fill captcha
await page.fill('input[placeholder*="Captcha"]', captchaCode);

// 8. Select all polling parts
await page.check('#selectAll');

// 9. Download with event listener
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 180000 }),
  page.click('button:has-text("Download Selected PDFs")')
]);

await download.saveAs(downloadPath);
```

---

## Error Handling

### Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid Captcha" | Incorrect captcha entry | Retry with new captcha |
| Session expired | 10 min+ idle time | Reload captcha |
| Timeout | ECI portal slow | Increase timeout to 180s |
| Parts not loaded | Network delay | Wait longer for table |
| Download failed | Connection drop | Retry download |

### Error Detection in Automation

```javascript
// Listen for modal/alert with "Invalid Captcha" text
page.on('dialog', async dialog => {
  if (dialog.message().includes('Invalid Captcha')) {
    logger.error('Captcha validation failed');
    await dialog.accept();
    throw new Error('Invalid captcha');
  }
});

// Check for error elements in DOM
const errorMsg = await page.$('text=/Invalid Captcha|Error/i');
if (errorMsg) {
  throw new Error('Captcha validation failed');
}
```

---

## Session Management

### JSESSIONID Cookie
- **Lifetime**: ~30 minutes
- **Set by**: Server on first page load
- **Used for**: Maintaining form state, captcha validation
- **Cleanup**: Automatic on timeout or browser close

### Our Session Storage
```javascript
activeSessions.set(sessionId, {
  browser,
  context,
  page,
  formData,
  createdAt: Date.now()
});

// Auto-cleanup after 10 minutes
setInterval(() => {
  for (const [sid, session] of activeSessions.entries()) {
    if (Date.now() - session.createdAt > 10 * 60 * 1000) {
      session.browser.close();
      activeSessions.delete(sid);
    }
  }
}, 5 * 60 * 1000);
```

---

## Captcha Handling

### Types Observed
1. **Base64 embedded**: `<img src="data:image/png;base64,...">`
2. **Dynamic endpoint**: `<img src="/captcha/generate?t=1234...">`

### Our Approach
1. Screenshot entire captcha image
2. Serve to frontend for manual entry
3. Store in session for submission
4. No OCR/2Captcha (manual for now)

### Future: Automated Solving
```javascript
// Option 1: OCR (Tesseract.js)
const { createWorker } = require('tesseract.js');
const worker = await createWorker();
const { data: { text } } = await worker.recognize(captchaPath);

// Option 2: 2Captcha service
const solver = new TwoCaptcha(API_KEY);
const result = await solver.imageCaptcha(captchaBase64);
```

---

## PDF Parsing Strategy

### ECI PDF Format
- Multi-page document with voter tables
- Each page: Header, polling station info, voter list
- Columns: S.No, Name, Relative, House No, Age, Gender, EPIC No

### Our Parser (`pdfParser.js`)
```javascript
// Extract text from PDF
const pdfData = await pdf(buffer);
const text = pdfData.text;

// Pattern matching for voter records
const voters = [];
const lines = text.split('\n');

for (const line of lines) {
  // Match EPIC number (ABC1234567)
  const epicMatch = line.match(/([A-Z]{3}\d{7})/);
  
  // Extract name, age, gender, etc.
  // Parse multiple formats based on ECI variations
}

return voters;
```

---

## Scalability Considerations

### Batch Processing
For downloading all Kerala ACs (140+ constituencies):

```javascript
const districts = await getDistricts('S11');

for (const district of districts) {
  const constituencies = await getConstituencies(district.code);
  
  for (const ac of constituencies) {
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      const voters = await extractVoters({
        stateCode: 'S11',
        district: district.code,
        constituency: ac.code,
        // ... other params
      });
      
      // Store in database
      await saveToDatabase(voters);
    } catch (error) {
      logger.error(`Failed for ${ac.name}:`, error);
      // Continue with next AC
    }
  }
}
```

### Rate Limiting Protection
- Add 3-5 second delays between requests
- Use proxy rotation (if needed)
- Implement exponential backoff on errors
- Monitor for IP blocks

### Proxy Integration
```javascript
const browser = await chromium.launch({
  proxy: {
    server: 'http://proxy-server:port',
    username: 'user',
    password: 'pass'
  }
});
```

---

## Network Debugging

### Enable Request Logging
Set environment variable:
```bash
DEBUG_ECI=true npm start
```

This logs all requests/responses:
```
ECI Request: POST /api/getPollingParts
Payload: {"stateCode":"S11","acCode":"102"}
ECI Response: 200 /api/getPollingParts
```

### Inspect in Browser DevTools
For manual testing, use Playwright in headed mode:
```javascript
const browser = await chromium.launch({ 
  headless: false,
  devtools: true 
});
```

---

## Alternative: Direct API Approach

If you can reverse-engineer all API endpoints:

```javascript
// Instead of browser automation, use direct HTTP
const axios = require('axios');

// 1. Get session cookie
const { headers } = await axios.get('https://voters.eci.gov.in/download-eroll?stateCode=S11');
const sessionCookie = headers['set-cookie'];

// 2. Get captcha
const captchaResp = await axios.get('https://voters.eci.gov.in/captcha/generate', {
  headers: { Cookie: sessionCookie }
});

// 3. Solve captcha (manually or with OCR)
const captcha = await solveCaptcha(captchaResp.data);

// 4. Download PDF
const pdfResp = await axios.post('https://voters.eci.gov.in/api/downloadSelectedParts', {
  stateCode: 'S11',
  district: 'ALAPPUZHA',
  acCode: '102',
  captcha,
  selectAll: true
}, {
  headers: { 
    Cookie: sessionCookie,
    'Content-Type': 'application/json'
  },
  responseType: 'arraybuffer'
});

fs.writeFileSync('output.pdf', pdfResp.data);
```

**Pros**: Faster, less resource-intensive
**Cons**: Requires finding exact endpoints, may break if portal changes

---

## Current Implementation Status

✅ **Completed**:
- Browser automation with Playwright
- React form handling (dropdowns + autocomplete)
- Captcha screenshot capture
- Session management
- Polling parts "Select All" support
- PDF download
- PDF parsing with multiple strategies
- Error handling for common issues

⏳ **To Do**:
- Automated captcha solving (OCR/2Captcha)
- Direct API endpoint discovery
- Bulk batch processing
- Proxy rotation for scaling
- Advanced PDF parsing for edge cases

---

## Testing

### Manual Test Flow
1. Start server: `npm start`
2. Open: http://localhost:3000/assembly.html
3. Select: Kerala → 2026 → SIR FinalRoll → District → AC
4. Click "Load Captcha"
5. Enter captcha code
6. Click "Extract Voter Data"
7. Verify: Table shows voters, export works

### Automated Testing
```javascript
// Test captcha capture
const { sessionId, captchaPath } = await captureECICaptcha({
  stateCode: 'S11',
  year: '2026',
  rollType: 'SIR FinalRoll - 2026',
  district: 'ALAPPUZHA',
  constituency: 'AROOR',
  language: 'MALAYALAM'
});

// Manually solve captcha
const captcha = '33hmk'; // from screenshot

// Test extraction
const pdfPath = await fillECIForm({
  sessionId,
  captcha,
  selectAll: true
});

// Test parsing
const voters = await parsePDFVoterData(pdfPath);
console.log(`Extracted ${voters.length} voters`);
```

---

## Production Deployment

### Environment Variables
```bash
DEBUG_ECI=false              # Disable request logging
NODE_ENV=production
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright  # For Docker
```

### Docker Considerations
```dockerfile
# Install Playwright dependencies
RUN npx playwright install-deps chromium
RUN npx playwright install chromium

# Set browser path
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
```

### Memory Requirements
- **Chromium**: ~200-300 MB per browser instance
- **PDF Processing**: ~50-100 MB per PDF
- **Recommended**: 1 GB RAM minimum, 2 GB preferred

### Monitoring
- Track browser instances (prevent leaks)
- Monitor session cleanup
- Log captcha failure rates
- Alert on download timeouts

---

## Compliance & Ethics

⚠️ **Important**:
- Respect JSESSIONID timeout (30 min)
- Don't bypass captcha with automated solvers (unless permitted)
- Add delays between requests (rate limiting)
- Don't overload ECI servers
- Use data responsibly and legally
- Comply with ECI terms of service

---

**Last Updated**: March 1, 2026
**Implementation Version**: 2.0 (React-aware)
