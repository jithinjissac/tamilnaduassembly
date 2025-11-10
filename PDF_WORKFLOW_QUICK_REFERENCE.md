# Quick Reference: PDF Generation Workflow

## 🟢 Happy Path (Ideal Flow)

```
1. USER EXTRACTION
   └─→ Extract voter data from SEC portal

2. ORDER CREATION
   ├─→ POST /api/orders/create
   ├─→ Save Order to MongoDB
   └─→ 🚀 Background PDF generation STARTS (async)
       ├─ Detect: 1181 voters > 1000 threshold
       ├─ Create FRESH browser instance
       ├─ Generate HTML + PDF
       ├─ Save to: public/temp-pdfs/cache-ORD-xxx.pdf
       ├─ Update status: 'ready'
       └─ Close browser (cleanup)
   
   Response to user: ✅ Order created, PDF generating...

3. PREVIEW (Optional)
   └─→ POST /api/slips/preview (first 10 voters)
       ├─ Use PERSISTENT browser (small)
       ├─ Stream preview to UI
       └─ User sees what slips look like

4. PAYMENT
   └─→ User pays via Razorpay
       └─ paymentStatus = 'completed'

5. DOWNLOAD - FAST PATH ⚡
   └─→ GET /api/slips/download/ORD-xxx
       ├─ Check: Is PDF cached?
       ├─ ✅ YES → Stream from disk (~50ms)
       └─ Done!
```

---

## 🟡 Fallback Path (If Cache Missing)

```
DOWNLOAD - SLOW PATH 🐢
└─→ GET /api/slips/download/ORD-xxx
    ├─ Check: Is PDF cached?
    ├─ ❌ NO → Generate on-demand
    │
    ├─ Detect: 1181 voters > 1000 threshold
    ├─ Create FRESH browser instance
    ├─ Generate HTML + PDF (~11 seconds)
    ├─ Stream directly to user
    └─ Close browser (cleanup)

Why this happens:
├─ Cache file expired (30 min timeout)
├─ Background generation failed
├─ OR user requested before background finished
```

---

## 🔴 Error Scenarios

```
SCENARIO 1: Background generation fails
├─ pdfJobs.status = 'failed'
├─ Log error message
└─ User can still download
    └─ Triggers on-demand generation (Fallback Path)

SCENARIO 2: Payment not completed
├─ Return 403 Forbidden
└─ Prompt user to complete payment first

SCENARIO 3: Browser disconnects
├─ OLD CODE: 500 error ❌
├─ NEW CODE: Detect via voter count
│   └─ Create fresh browser for large PDFs
│   └─ No disconnection possible
└─ FIXED ✅
```

---

## 📊 Decision Tree

```
User requests download
├─ Is order paid?
│  ├─ NO → Return 403 Forbidden
│  └─ YES → Continue
│
├─ Is PDF cached?
│  ├─ YES → FAST PATH (~50ms)
│  │   └─ Stream from disk
│  │
│  └─ NO → SLOW PATH (~11s)
│      ├─ Voter count > 1000?
│      │  ├─ YES → Create FRESH browser
│      │  └─ NO → Use PERSISTENT browser
│      └─ Generate + Stream PDF
│
└─ Update download count + timestamp
```

---

## 🎯 Key Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| **Cached Download** | ~50ms | Instant |
| **Small PDF (50 voters)** | ~1s | Persistent browser |
| **Large PDF (1181 voters)** | ~11s | Fresh browser |
| **Cache lifetime** | 30 min | Then auto-deleted |
| **Background gen** | Non-blocking | User gets instant response |
| **Cleanup interval** | 10 min | Prevents disk bloat |

---

## 🔧 Browser Instance Strategy

```
PERSISTENT BROWSER
├─ Use for: Small PDFs (≤1000 voters)
├─ Lifetime: Entire server session
├─ Reuse: Yes
├─ Startup time: 2s (first time), 0s (reuse)
└─ Memory: Accumulates over time but acceptable for small PDFs

FRESH BROWSER
├─ Use for: Large PDFs (>1000 voters)
├─ Lifetime: Single PDF generation only
├─ Reuse: No
├─ Startup time: 2s
├─ Memory: Released completely after close
└─ Prevents: Memory exhaustion + disconnection
```

---

## 📁 File Management

```
public/temp-pdfs/
├─ cache-ORD-20251109-6L2O81-1762711556758.pdf
│  ├─ Created: Background generation or first download
│  ├─ Lifetime: 30 minutes
│  └─ Auto-delete: Yes (via scheduler)
│
├─ preview-ORD-20251109-6L2O81-1762711556758.pdf
│  ├─ Created: When user previews
│  ├─ Lifetime: 5 minutes
│  └─ Manual-delete: Yes (after sending to user)
│
└─ Cleanup runs: Every 10 minutes
   └─ Removes files older than 35 minutes

In-Memory (pdfJobs Map):
├─ orderId1 → { status: 'ready', path: '...', expiresAt: ... }
└─ orderId2 → { status: 'generating', progress: 45 }
```

---

## ✨ What Was Fixed

### **Before (Broken ❌)**
```
1181-voter order
    ↓
Background PDF starts
    ├─ Use persistent browser (MISTAKE)
    └─ Browser crashes after preview
        ├─ Runs out of memory
        ├─ WebSocket disconnects
        └─ PDF generation fails silently
    
User clicks download
    ├─ No cached PDF (generation failed)
    └─ Try to generate on-demand
        ├─ Reuse same dead persistent browser (MISTAKE)
        ├─ "Target closed" error
        └─ 500 Internal Server Error
```

### **After (Fixed ✅)**
```
1181-voter order
    ↓
Background PDF starts
    ├─ Detect: 1181 > 1000
    ├─ Create FRESH browser (SMART)
    ├─ Generate PDF successfully
    ├─ Close browser (cleanup)
    └─ Save to cache
    
User clicks download
    ├─ Check cache
    ├─ PDF found (background succeeded)
    ├─ Stream from disk (~50ms)
    └─ ✅ Download works!

If cache missing:
    ├─ Detect: 1181 > 1000
    ├─ Create FRESH browser (SMART)
    ├─ Generate on-demand
    └─ ✅ Download works!
```

---

## 🚀 How to Test

### **Test 1: Small Order (Should be instant)**
```javascript
// Create 50-voter order
// Download should take ~2 seconds (uses persistent browser)
```

### **Test 2: Large Order (Should use fresh browser)**
```javascript
// Create 1181-voter order
// Background gen: ~11 seconds (fresh browser)
// Download after cache ready: ~50ms (stream from disk)
```

### **Test 3: Check Status**
```javascript
GET /api/slips/pdf-status/{orderId}
Response: {
  status: 'ready',      // or 'generating', 'failed', 'not-found'
  progress: 100,
  canDownload: true,
  isPaid: true
}
```

### **Test 4: Force Fallback (Delete cache)**
```bash
rm public/temp-pdfs/cache-*
# Then download again
# Should trigger on-demand generation (~11 seconds)
```

---

## 📞 Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| 500 error on download | Browser crashed | Uses fresh browser for >1000 voters now ✅ |
| Download too slow | Large PDF | Wait for background cache (~11s) ✅ |
| PDF not generating | Background failed | Check logs for error, retry download |
| Disk full | Cache accumulation | Cleanup runs every 10 min |
| Payment required | Not paid yet | Complete payment first |

---

## 📚 Code Reference

| File | Function | Purpose |
|------|----------|---------|
| `orderController.js` | `createOrder()` | Trigger background generation |
| `pdfGenerator.js` | `generatePDFBackground()` | Background PDF generation |
| `pdfGenerator.js` | `createFreshBrowser()` | Launch dedicated browser for large PDFs |
| `slipController.js` | `downloadSlip()` | Download endpoint with cache fallback |
| `slipController.js` | `getPDFStatus()` | Check generation status |
| `server.js` | `cleanupExpiredPDFs()` | Scheduled cleanup task |
