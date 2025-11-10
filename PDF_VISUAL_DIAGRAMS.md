# PDF Generation System - Visual Diagrams

## 📊 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (HTML/JS)                                 │
│                                                                              │
│  ┌─ Form ─────────────────┐  ┌─ Payment ──────────┐  ┌─ Download ───────┐ │
│  │ 1. Extract voters      │  │ 2. Razorpay        │  │ 3. Get PDF       │ │
│  │ 2. Select symbol       │  │    confirmation    │  │ 4. Stream file   │ │
│  │ 3. Choose location     │  └────────────────────┘  └──────────────────┘ │
│  └────────────────────────┘                                                │
│           │                          │                         │           │
│           ▼                          ▼                         ▼           │
└─ POST ────────────────────────────────────────── GET ─────────────────────┘
        /api/orders/create      /api/payment          /api/slips/download

┌─────────────────────────────────────────────────────────────────────────────┐
│                       EXPRESS API SERVER (Node.js)                          │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                       ROUTE HANDLERS                                 │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │                                                                      │  │
│  │  POST /api/orders/create                                            │  │
│  │  └─ orderController.createOrder()                                   │  │
│  │     ├─ Validate input                                               │  │
│  │     ├─ Save Order to MongoDB                                        │  │
│  │     └─ 🚀 generatePDFBackground(order) [ASYNC, NON-BLOCKING]       │  │
│  │                                                                      │  │
│  │  GET /api/slips/download/{orderId}                                  │  │
│  │  └─ slipController.downloadSlip()                                   │  │
│  │     ├─ Verify payment                                               │  │
│  │     ├─ Check cache: getPDFFilePath()                                │  │
│  │     ├─ If cached → Stream from disk (~50ms)                        │  │
│  │     └─ If not → Generate on-demand (~11s)                          │  │
│  │                                                                      │  │
│  │  GET /api/slips/pdf-status/{orderId}                                │  │
│  │  └─ slipController.getPDFStatus()                                   │  │
│  │     └─ Return: { status, progress, canDownload }                    │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    BACKGROUND SERVICES                              │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │                                                                      │  │
│  │  pdfGenerator.js → generatePDFBackground()                           │  │
│  │  ├─ Generate 1181-voter HTML (150 MB)                              │  │
│  │  ├─ Detect: voters > 1000?                                         │  │
│  │  ├─ Launch FRESH browser (isolated memory)                         │  │
│  │  ├─ Render HTML → PDF (8-12 seconds)                               │  │
│  │  ├─ Save to: public/temp-pdfs/cache-ORD-xxx.pdf                   │  │
│  │  ├─ Update: pdfJobs.status = 'ready'                               │  │
│  │  ├─ Close browser (cleanup)                                        │  │
│  │  └─ Schedule delete (30 min timeout)                               │  │
│  │                                                                      │  │
│  │  pdfGenerator.js → cleanupExpiredPDFs()                             │  │
│  │  ├─ Run every 10 minutes                                            │  │
│  │  ├─ Check: expiredAt < now?                                        │  │
│  │  ├─ Delete file from disk                                          │  │
│  │  └─ Remove from pdfJobs Map                                        │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         BROWSER MANAGEMENT                                  │
│                                                                              │
│  ┌─ PERSISTENT BROWSER ──────────┐  ┌─ FRESH BROWSER ──────────────────┐  │
│  │ Used for: small PDFs (≤1000)  │  │ Used for: large PDFs (>1000)     │  │
│  │ Lifetime: entire server life  │  │ Lifetime: single PDF generation  │  │
│  │ Reuse: YES                    │  │ Reuse: NO (always fresh)         │  │
│  │ Memory: accumulates slowly    │  │ Memory: fully released after use  │  │
│  │ Startup: 2s (first), 0s (re)  │  │ Startup: 2s                      │  │
│  │ Keeps: 1 instance per server  │  │ Creates: 1 instance per order    │  │
│  └───────────────────────────────┘  └──────────────────────────────────┘  │
│                                                                              │
│  getBrowser()              createFreshBrowser()                             │
│  └─ if disconnected:       └─ Always launches new:                         │
│     ├─ Launch new           ├─ puppeteer.launch()                          │
│     └─ Cache in browserInstance   ├─ 18 optimization flags                 │
│                             └─ Returns ready browser                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA STORAGE                                      │
│                                                                              │
│  ┌─ MongoDB (Persistent) ────────────┐  ┌─ File System (Temporary) ──────┐ │
│  │                                   │  │                                 │ │
│  │  Orders Collection:               │  │  public/temp-pdfs/              │ │
│  │  ├─ _id (unique)                 │  │  ├─ cache-ORD-xxx-ts.pdf (30m)  │ │
│  │  ├─ orderId                      │  │  ├─ preview-ORD-xxx-ts.pdf (5m) │ │
│  │  ├─ userId                       │  │  └─ Auto-cleanup every 10 min   │ │
│  │  ├─ voters[] (1181 records)      │  │                                 │ │
│  │  ├─ customization                │  │  Max files: Limited by disk     │ │
│  │  ├─ location                     │  │  Typical size per PDF: 300 MB   │ │
│  │  ├─ paymentStatus                │  │                                 │ │
│  │  ├─ razorpayPaymentId            │  │                                 │ │
│  │  ├─ downloadCount                │  │                                 │ │
│  │  └─ lastDownloadAt               │  │                                 │ │
│  │                                   │  │                                 │ │
│  │  Symbols Collection:              │  │                                 │ │
│  │  ├─ _id                          │  │                                 │ │
│  │  ├─ name (English)               │  │                                 │ │
│  │  ├─ nameMalayalam                │  │                                 │ │
│  │  └─ partyLogo (base64)           │  │                                 │ │
│  │                                   │  │                                 │ │
│  │  Users Collection:                │  │                                 │ │
│  │  ├─ _id                          │  │                                 │ │
│  │  ├─ email                        │  │                                 │ │
│  │  └─ orders[] (ref)               │  │                                 │ │
│  │                                   │  │                                 │ │
│  └───────────────────────────────────┘  └─────────────────────────────────┘ │
│                                                                              │
│  ┌─ In-Memory (Runtime) ─────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  pdfJobs Map (utils/pdfGenerator.js):                                │  │
│  │  ├─ Key: orderId (e.g., "ORD-20251109-6L2O81")                      │  │
│  │  ├─ Value: {                                                         │  │
│  │  │   status: 'generating' | 'ready' | 'failed'                      │  │
│  │  │   path: 'public/temp-pdfs/cache-xxx.pdf'                         │  │
│  │  │   size: 314572800                                                │  │
│  │  │   progress: 0-100                                                │  │
│  │  │   createdAt: Date                                                │  │
│  │  │   expiresAt: Date (now + 30 min)                                 │  │
│  │  │   error: null | 'error message'                                  │  │
│  │  │ }                                                                 │  │
│  │  ├─ Max entries: Depends on server memory                           │  │
│  │  └─ Lifetime: From creation to 30min expiry or cleanup              │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔀 Request Flow Diagram

```
                           START
                            │
                            ▼
        ┌──────────────────────────────────┐
        │   User creates order with 1181   │
        │           voters                 │
        └──────────────────┬────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────┐
        │ POST /api/orders/create          │
        └──────────────────┬────────────────┘
                           │
        ┌──────────────────▼────────────────┐
        │ Validate input + Save to MongoDB  │
        └──────────────────┬────────────────┘
                           │
        ┌──────────────────▼────────────────────────────────────┐
        │ 🚀 generatePDFBackground() triggered (ASYNC)          │
        │ ├─ Generate 1181-voter HTML                          │
        │ ├─ Detect: 1181 > 1000 → Use FRESH browser          │
        │ ├─ Render HTML → PDF (~8-12s)                        │
        │ ├─ Save to public/temp-pdfs/cache-ORD-xxx.pdf        │
        │ └─ Update: pdfJobs[ORD-xxx] = { status: 'ready' }    │
        └──────────────────┬────────────────────────────────────┘
                           │
        ┌──────────────────▼────────────────┐
        │ Return to user immediately        │
        │ { orderId, pdfStatus: 'generating' } ←─ User sees this
        └──────────────────┬────────────────┘    while PDF generates
                           │                      in background
                    [User flow continues...]
                           │
                           ▼
        ┌──────────────────────────────────┐
        │   User completes payment         │
        │   (Razorpay confirmation)        │
        └──────────────────┬────────────────┘
                           │
        ┌──────────────────▼────────────────────────────┐
        │ paymentStatus = 'completed'                   │
        │ razorpayPaymentId = 'pay_Rdja...'            │
        └──────────────────┬────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────┐
        │  User clicks "Download PDF"      │
        └──────────────────┬────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────┐
        │  GET /api/slips/download/ORD-xxx │
        └──────────────────┬────────────────┘
                           │
        ┌──────────────────▼──────────────────────────┐
        │ Verify: Order exists + User owns it + Paid  │
        └──────────────────┬──────────────────────────┘
                           │
                    ┌──────▼───────┐
                    │ Is cached?   │
                    └──┬───────┬──┘
         ┌────────YES──┘       └──NO─────────┐
         │                                   │
         ▼                                   ▼
    ┌─────────────┐              ┌─────────────────────┐
    │ Read cache  │              │ Generate on-demand  │
    │ from disk   │              │ ├─ Fresh browser    │
    │ (~50ms)     │              │ ├─ Render HTML→PDF  │
    │             │              │ └─ (~11 seconds)    │
    └──────┬──────┘              └────────┬────────────┘
           │                              │
           └──────────┬───────────────────┘
                      │
                      ▼
    ┌─────────────────────────────────┐
    │ Send PDF to user                │
    │ ├─ Content-Type: application/pdf│
    │ ├─ Content-Length: 314572800    │
    │ └─ Content-Disposition: attach  │
    └──────────────┬──────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────┐
    │ Update: downloadCount += 1      │
    │ Update: lastDownloadAt = now    │
    └──────────────┬──────────────────┘
                   │
                   ▼
    ┌─────────────────────────────────┐
    │ ✅ PDF Download Complete        │
    └─────────────────────────────────┘
```

---

## 🔄 Voter Count Decision Tree

```
                         Start Download
                              │
                              ▼
                   ┌──────────────────────┐
                   │ Total Voters = 1181  │
                   └─────────┬────────────┘
                             │
                      ┌──────▼──────┐
                      │ > 1000?      │
                      └──┬───────┬──┘
                    YES  │       │  NO
        ┌─────────────────┘       └────────────────┐
        │                                          │
        ▼                                          ▼
    ┌──────────────────────┐           ┌──────────────────────┐
    │ FRESH BROWSER        │           │ PERSISTENT BROWSER   │
    ├──────────────────────┤           ├──────────────────────┤
    │ ✓ Independent memory │           │ ✓ Instant reuse (0ms)│
    │ ✓ No crashes         │           │ ✓ Lower overhead     │
    │ ✗ 2s startup         │           │ ✗ Accumulates memory │
    │ ✗ Cleanup needed     │           │ ✗ Risk if crashed    │
    └──────────────────────┘           └──────────────────────┘
        │                                   │
        ├─ Launch browser                   ├─ Get cached instance
        ├─ Create page                      ├─ Create page
        ├─ Set content                      ├─ Set content
        ├─ Generate PDF (~8s)               ├─ Generate PDF (~2s)
        ├─ Close page                       ├─ Close page
        ├─ Close browser ← KEY DIFFERENCE   └─ Keep browser alive
        └─ Result: Memory freed
```

---

## ⏱️ Timeline Visualization (1181-Voter Order)

```
Time  │ Background Task        │ Main Request                │ File System
──────┼────────────────────────┼─────────────────────────────┼──────────────
0s    │ generatePDFBackground()│ Return orderId to user ✅   │
      │ start                  │                             │
──────┼────────────────────────┼─────────────────────────────┼──────────────
1s    │ ├─ Generating HTML     │                             │
      │ │  (1181 voters)       │                             │
──────┼────────────────────────┼─────────────────────────────┼──────────────
2s    │ ├─ HTML ready          │                             │
      │ ├─ Launch fresh browser│                             │
──────┼────────────────────────┼─────────────────────────────┼──────────────
3s    │ ├─ Create page         │                             │
      │ ├─ Set content         │                             │
──────┼────────────────────────┼─────────────────────────────┼──────────────
4s    │ ├─ DOM loaded          │                             │
──────┼────────────────────────┼─────────────────────────────┼──────────────
5s    │ ├─ Rendering...        │                             │
──────┼────────────────────────┼─────────────────────────────┼──────────────
8s    │ ├─ PDF generated       │                             │
──────┼────────────────────────┼─────────────────────────────┼──────────────
10s   │ ├─ Save to disk        │                             │ WRITING FILE
      │ ├─ Update status ready │                             │
──────┼────────────────────────┼─────────────────────────────┼──────────────
11s   │ ├─ Close browser       │                             │ File ready ✅
      │ └─ DONE ✅             │                             │
──────┼────────────────────────┼─────────────────────────────┼──────────────
      │                        │   User pays...             │
      │                        │   ...                      │
30s   │                        │ GET /download              │
      │                        │   ├─ Check cache ✓         │ READ FILE
      │                        │   ├─ Stream to user        │
      │                        │   └─ Done! ✅              │
──────┼────────────────────────┼─────────────────────────────┼──────────────
1800s │                        │                             │ Cleanup:
      │                        │                             │ Delete file ✅
      │                        │                             │ (30 min expiry)
```

---

## 🔀 Browser Instance Lifecycle

```
PERSISTENT BROWSER
┌────────────────────────────────────────────────────────────┐
│ Server Starts                                              │
│ └─ browserInstance = null                                  │
│                                                            │
│ First Request (50 voters):                                │
│ ├─ getBrowser() called                                    │
│ ├─ browserInstance is null → Launch new                   │
│ ├─ Store in global browserInstance                        │
│ └─ Use for this request                                   │
│                                                            │
│ Second Request (30 voters):                               │
│ ├─ getBrowser() called                                    │
│ ├─ browserInstance exists + connected → Reuse             │
│ ├─ Create new page                                        │
│ └─ Use same browser                                       │
│                                                            │
│ Browser Disconnects (unlikely for small PDFs):            │
│ ├─ Event 'disconnected' fired                             │
│ ├─ Set browserInstance = null                             │
│ └─ Next request will launch new                           │
│                                                            │
│ Server Shutdown:                                          │
│ └─ browser.close() called (cleanup)                       │
└────────────────────────────────────────────────────────────┘

FRESH BROWSER (for each large PDF)
┌────────────────────────────────────────────────────────────┐
│ Request 1: 1181 voters                                     │
│ ├─ createFreshBrowser()                                    │
│ ├─ puppeteer.launch() → NEW instance                       │
│ ├─ Use for PDF generation                                  │
│ ├─ await browser.close() → CLOSED & memory freed          │
│ └─ Instance destroyed                                      │
│                                                            │
│ Request 2: 2000 voters                                     │
│ ├─ createFreshBrowser()                                    │
│ ├─ puppeteer.launch() → NEW instance (independent)        │
│ ├─ Use for PDF generation                                  │
│ ├─ await browser.close() → CLOSED & memory freed          │
│ └─ Instance destroyed                                      │
│                                                            │
│ Key Difference: Never shares state, always fresh           │
│ No memory accumulation, no crashes from previous use       │
└────────────────────────────────────────────────────────────┘
```

---

## 📈 Memory Usage Over Time

```
BEFORE FIX (Problematic)
Memory
│     ┌─ First request (10 voters, preview)
│     │┌─ Browser launches
│ 500 ││ Preview PDF generated
│ MB  ││┌─ Second request (1181 voters)
│    │││ Reuse browser (MISTAKE)
│ 300││  Browser memory bloated
│    │││ Renders large HTML
│    │││ Runs out of memory
│ 100│││ Browser CRASHES 💥
│    │└┘ Memory freed (abnormally)
└──────────────────────────────────────
      Time →

AFTER FIX (Optimal)
Memory
│    ┌─ First request (10 voters, preview)
│    │┌─ Use PERSISTENT browser
│ 300││ Create + close page
│ MB ││ Memory ~100 MB
│    │└─ Page closed, browser alive
│    │
│    │  Second request (1181 voters)
│    │┌─ Create FRESH browser
│ 200││ Isolated, separate memory space
│    ││ Generate large PDF
│    ││ Close browser completely ← KEY
│    │└─ Memory freed back to system
│ 100│
│    └─ Persistent still ~50 MB
└──────────────────────────────────────
      Time →
```
