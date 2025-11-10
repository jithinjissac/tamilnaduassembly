# Code-Level Workflow Trace

## 🔍 Step-by-Step Code Execution

### **PHASE 1: Order Creation**

**User Action:** POST `/api/orders/create`
```
controllers/orderController.js → createOrder()
│
├─ Line 33-37: Validation
│  └─ customization, location, voters required
│
├─ Line 40-60: Check for duplicate order
│  └─ Query: { userId, symbolId, location }
│  └─ Prevent duplicate symbol + location combo
│
├─ Line 67-73: Calculate pricing
│  ├─ totalVoters = voters.length (1181)
│  ├─ pricePerVoter = 0.50
│  └─ amount = 1181 * 0.50 = 590.50
│
├─ Line 75: Generate unique orderId
│  └─ Format: ORD-YYYYMMDD-RANDOM
│  └─ Example: ORD-20251109-6L2O81
│
├─ Line 77-87: Create Order document
│  ├─ userId, orderId, customization, location, voters
│  ├─ totalVoters: 1181
│  ├─ amount: 590.50
│  └─ paymentStatus: 'pending' (default)
│
├─ Line 89: await order.save()
│  └─ ✅ Order saved to MongoDB
│
└─ Line 91-93: 🚀 TRIGGER BACKGROUND PDF GENERATION
   │
   ├─ generatePDFBackground(order, order.orderId)
   ├─ .catch(err => console.error(...))  // Error handling
   │
   └─ NOTE: Non-blocking! Function called but NOT awaited
      └─ Request returns immediately
      └─ Background task continues in parallel
│
└─ Line 95-104: Return success response
   └─ {
        orderId: 'ORD-20251109-6L2O81',
        totalVoters: 1181,
        amount: 590.50,
        pdfStatus: 'generating'  ← Background task status
      }
```

---

### **PHASE 1.5: Background PDF Generation (Async)**

**Location:** `utils/pdfGenerator.js → generatePDFBackground()`
**Runs in background** (not blocking the user request)

```
generatePDFBackground(order, orderId)
│
├─ Line 22-30: Mark job as in-progress
│  └─ pdfJobs.set(orderId, { status: 'generating' })
│  └─ Store in in-memory Map for status tracking
│
├─ Line 37-39: Generate HTML
│  ├─ Call: generateSlipHTML(order)
│  ├─ Parameters: order object with 1181 voters
│  ├─ Returns: Complete HTML for all slips (150 MB)
│  └─ Includes: Base64 symbol image, CSS, all voter names
│
├─ Line 42-45: Determine browser strategy
│  ├─ Check: order.totalVoters (1181)
│  ├─ Condition: 1181 > 1000
│  ├─ Decision: useFreshBrowser = true
│  └─ Reason: Prevent memory exhaustion
│
├─ Line 49-56: Launch fresh browser
│  ├─ Call: createFreshBrowser()
│  ├─ Puppeteer.launch() with optimized args
│  ├─ Flags:
│  │  ├─ --no-sandbox (disable security sandbox)
│  │  ├─ --disable-dev-shm-usage (use disk instead of /dev/shm)
│  │  ├─ --single-process=false (separate processes)
│  │  └─ ... (18 optimization flags)
│  └─ Result: Fresh browser instance launched
│
├─ Line 62-67: Create new page
│  ├─ page = await browser.newPage()
│  ├─ Settings:
│  │  ├─ setBypassCSP(true) - Bypass Content Security Policy
│  │  ├─ setJavaScriptEnabled(false) - No JS needed for PDF
│  │  └─ setCacheEnabled(true) - Enable cache
│  └─ Result: Optimized page for PDF generation
│
├─ Line 69-75: Set HTML content
│  ├─ await page.setContent(html, {
│  │   waitUntil: 'domcontentloaded',
│  │   timeout: 120000
│  │ })
│  ├─ Browser renders HTML to DOM
│  ├─ Waits for: DOM ready (not full page load)
│  └─ Reason: No external resources to load (base64 embedded)
│
├─ Line 77-84: Generate PDF
│  ├─ await page.pdf({
│  │   format: 'A4',
│  │   printBackground: true,
│  │   margin: { top: 0, bottom: 0, left: 0, right: 0 }
│  │ })
│  ├─ Chromium renders all DOM elements to PDF
│  ├─ Result: Buffer containing full PDF binary data
│  └─ Size: ~300 MB
│
├─ Line 85-92: Cleanup resources
│  ├─ await page.close() - Close page
│  ├─ if (useFreshBrowser) await browser.close()
│  ├─ Result: Fresh browser fully closed + memory released
│  └─ Reason: Only fresh browsers close (persistent stays alive)
│
├─ Line 94-102: Save to disk
│  ├─ tempDir = 'public/temp-pdfs/'
│  ├─ filename = `cache-ORD-20251109-6L2O81-${Date.now()}.pdf`
│  ├─ filePath = path.join(tempDir, filename)
│  └─ fs.writeFileSync(filePath, pdf) - Write 300 MB to disk
│
├─ Line 104-113: Update job status to 'ready'
│  └─ pdfJobs.set(orderId, {
│       status: 'ready',
│       path: filePath,
│       size: 300000000,
│       expiresAt: Date.now() + 30*60*1000  // 30 minutes
│     })
│
├─ Line 115-118: Schedule deletion
│  ├─ schedulePDFDeletion(orderId, filePath, 30*60*1000)
│  ├─ After 30 minutes: File deleted from disk
│  ├─ And: Removed from pdfJobs Map
│  └─ Reason: Auto-cleanup to prevent disk bloat
│
├─ ✅ SUCCESS: PDF ready for download
│
└─ [Line 120-130: If any error above]
   ├─ Catch error
   ├─ pdfJobs.set(orderId, { status: 'failed', error: message })
   ├─ Log full stack trace
   └─ User can retry or check status
```

---

### **PHASE 2: User Payment**

**User Action:** Razorpay payment callback
```
paymentController.js → verifyPayment()
│
├─ Verify Razorpay signature
├─ Find Order by orderId
├─ Update: order.paymentStatus = 'completed'
├─ Update: order.razorpayPaymentId = 'pay_xxx'
├─ await order.save()
│
└─ ✅ Order now eligible for download
```

---

### **PHASE 3: Download Preparation**

**User Action:** GET `/api/slips/pdf-status/{orderId}`
```
controllers/slipController.js → getPDFStatus()
│
├─ Line 715: Find order
│  └─ const order = await Order.findOne({ orderId, userId })
│
├─ Line 722: Get PDF job status
│  └─ const jobStatus = getPDFJobStatus(orderId)
│  └─ Query pdfJobs Map for this orderId
│
├─ Line 724-728: Check download eligibility
│  ├─ canDownload = (status === 'ready' && paid)
│  └─ isPaid = (paymentStatus === 'completed')
│
└─ Line 730: Return status info
   └─ {
        status: 'ready',           // or 'generating'
        progress: 100,
        isPaid: true,
        canDownload: true,
        message: 'PDF ready for download'
      }
```

---

### **PHASE 4: Download - FAST PATH (Cached)**

**User Action:** GET `/api/slips/download/{orderId}`
```
controllers/slipController.js → downloadSlip()
│
├─ Line 751: Verify order exists
│  └─ const order = await Order.findOne({ orderId, userId })
│
├─ Line 753-757: Verify payment completed
│  ├─ if (order.paymentStatus !== 'completed')
│  └─ return 403 Forbidden
│
├─ Line 759: 🔍 Try to get cached PDF
│  ├─ let pdfPath = getPDFFilePath(orderId)
│  ├─ Query: Look for file matching cache-{orderId}-* pattern
│  ├─ Query pdfJobs.get(orderId)
│  ├─ if (job.status === 'ready' && fs.exists(job.path))
│  └─ Result: pdfPath = full file path
│
├─ ✅ CACHE HIT: PDF file exists!
│  │
│  ├─ Line 762-773: Serve cached file
│  │  ├─ const pdf = fs.readFileSync(pdfPath) - Read from disk
│  │  ├─ Update: order.downloadCount += 1
│  │  ├─ Update: order.lastDownloadAt = new Date()
│  │  ├─ await order.save()
│  │  │
│  │  ├─ Set response headers:
│  │  │  ├─ Content-Type: application/pdf
│  │  │  ├─ Content-Disposition: attachment; filename="voter-slips-ORD-xxx.pdf"
│  │  │  ├─ Content-Length: 300000000
│  │  │  └─ Cache-Control: private, max-age=3600
│  │  │
│  │  └─ res.end(pdf) - Stream buffer directly to user
│  │
│  └─ ⚡ Response time: ~50ms (disk I/O only)
│
└─ ❌ CACHE MISS: Go to SLOW PATH (see next phase)
```

---

### **PHASE 5: Download - SLOW PATH (On-Demand)**

**Condition:** Cache miss (background generation failed OR expired)
```
controllers/slipController.js → downloadSlip() [continued]
│
├─ Line 795: pdfPath is null
│  └─ No cached PDF found
│
├─ Line 805-811: Fetch symbol Malayalam name
│  ├─ if (!order.customization.symbolNameMalayalam)
│  ├─ Query Symbol collection
│  ├─ Update order with Malayalam name if needed
│  └─ Reason: Needed for cover page in multi-station orders
│
├─ Line 820: Generate HTML for ALL voters
│  ├─ const html = generateSlipHTML(order)
│  ├─ Parameters: Full order (1181 voters)
│  ├─ Returns: 150 MB HTML
│  └─ Includes: All voter slips + cutting guides
│
├─ Line 824-826: Determine browser strategy
│  ├─ Check: order.totalVoters (1181)
│  ├─ Condition: 1181 > 1000
│  ├─ Decision: useFreshBrowser = true
│  └─ Reason: Same as background - prevent memory issues
│
├─ Line 830-846: Launch fresh browser (if needed)
│  ├─ Call: createFreshBrowser()
│  ├─ Result: Fresh browser instance
│  └─ Reason: Large PDF needs isolated memory
│
├─ Line 848-880: PDF generation (same as background)
│  ├─ Create page with optimizations
│  ├─ Set HTML content (wait for DOM)
│  ├─ Generate PDF from HTML
│  ├─ Close page
│  ├─ Close fresh browser if used
│  └─ Result: PDF buffer in memory
│
├─ Line 882-896: Error handling
│  ├─ try-catch wrapping all above
│  ├─ Ensure page.close() on error
│  ├─ Ensure browser.close() on error
│  └─ Proper cleanup on failure
│
├─ Line 898-909: Stream PDF to user
│  ├─ Verify PDF header: %PDF
│  ├─ Set same response headers
│  ├─ res.end(pdf) - Stream buffer directly
│  └─ No file I/O (faster than writing + reading)
│
├─ Line 911-913: Update metadata
│  ├─ order.downloadCount += 1
│  ├─ order.lastDownloadAt = new Date()
│  └─ await order.save()
│
└─ ⏱️ Response time: ~11 seconds (full PDF generation)
```

---

### **PHASE 6: Scheduled Cleanup**

**Trigger:** Every 10 minutes (background interval)
```
server.js → cleanupExpiredPDFs()
│
├─ Line 99: Scheduled via setInterval(cleanupExpiredPDFs, 10*60*1000)
│
├─ utils/pdfGenerator.js → cleanupExpiredPDFs()
│  │
│  ├─ Iterate: All entries in pdfJobs Map
│  ├─ For each: Check if expiresAt < now
│  │
│  ├─ If expired:
│  │  ├─ Delete file from disk: fs.unlinkSync(filePath)
│  │  ├─ Remove from Map: pdfJobs.delete(orderId)
│  │  └─ Log: "🗑️ Deleted cache-ORD-xxx.pdf"
│  │
│  └─ Result: Disk space reclaimed
│
└─ Runs every 10 minutes automatically
```

---

## 🔄 Complete Timeline (1181-Voter Order)

```
t=0s
  └─ POST /api/orders/create
     ├─ Order saved to MongoDB
     └─ generatePDFBackground() called (async)
     └─ Response: {"orderId": "ORD-xxx", "pdfStatus": "generating"}

t=0.5s
  └─ Background task: Generate HTML (1181 voters)

t=1s
  └─ Background task: Launch fresh browser
     └─ Browser startup: ~1-2 seconds

t=3s
  └─ Background task: Create page + set HTML content
     └─ DOM loaded

t=8s
  └─ Background task: Generate PDF
     └─ 1181 slips rendered to PDF

t=10s
  └─ Background task: Save to disk
     └─ File: public/temp-pdfs/cache-ORD-xxx-1762711556758.pdf (300 MB)
     └─ Update status: 'ready'

t=11s
  └─ Background task: Close browser
     └─ Memory released
     └─ ✅ PDF READY FOR DOWNLOAD

t=30s
  └─ User payment completed
     └─ paymentStatus = 'completed'

t=35s
  └─ GET /api/slips/pdf-status/ORD-xxx
     └─ Response: status='ready', canDownload=true

t=36s
  └─ GET /api/slips/download/ORD-xxx
     ├─ Check cache: ✓ Found
     ├─ Read from disk
     └─ Stream to user (~50ms)
     └─ ✅ DOWNLOAD COMPLETE

t=1800s (30 min later)
  └─ Background: cleanupExpiredPDFs() runs
     └─ Delete cache file if not deleted by user
     └─ Disk space freed
```

---

## 🎯 Key Code Locations

| Action | File | Function | Lines |
|--------|------|----------|-------|
| Create order | `orderController.js` | `createOrder()` | 30-104 |
| Trigger background | `orderController.js` | `createOrder()` | 91-93 |
| Background generation | `pdfGenerator.js` | `generatePDFBackground()` | 20-117 |
| Fresh browser | `pdfGenerator.js` | `createFreshBrowser()` | 10-41 |
| Download (cached) | `slipController.js` | `downloadSlip()` | 759-773 |
| Download (on-demand) | `slipController.js` | `downloadSlip()` | 777-910 |
| PDF status | `slipController.js` | `getPDFStatus()` | 697-730 |
| Cleanup | `pdfGenerator.js` | `cleanupExpiredPDFs()` | 162-190 |
| Scheduled cleanup | `server.js` | setup | 98-106 |

---

## ✅ What Happens at Each Decision Point

### **Decision 1: Voter Count Check**
```javascript
if (order.totalVoters > 1000) {
    // Use FRESH browser
    // Reason: Large PDF needs isolated memory to prevent crash
} else {
    // Use PERSISTENT browser
    // Reason: Small PDF is safe, faster reuse
}
```

### **Decision 2: Is PDF Cached?**
```javascript
let pdfPath = getPDFFilePath(orderId);
if (pdfPath) {
    // FAST PATH: Stream from disk (~50ms)
} else {
    // SLOW PATH: Generate on-demand (~11s)
}
```

### **Decision 3: Is Payment Complete?**
```javascript
if (order.paymentStatus !== 'completed') {
    // Return 403 Forbidden
    // Reason: Can't download without payment
} else {
    // Allow download
}
```

---

## 🛡️ Safety Mechanisms

1. **Error Handling**: All async operations wrapped in try-catch
2. **Resource Cleanup**: Fresh browsers always closed (even on error)
3. **File Limits**: Auto-delete after 30 minutes prevents disk bloat
4. **Memory Management**: Fresh browser per large PDF prevents accumulation
5. **Payment Verification**: Users can't download without paying
6. **Browser Health**: Automatic reconnection if disconnected
7. **Logging**: Every step logged for debugging
