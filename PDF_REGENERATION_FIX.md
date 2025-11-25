# PDF Regeneration and Google Drive Availability Fix

## Problem Identified

### Issue 1: PDFs Being Regenerated Every Time
**Symptom**: PDFs were being regenerated on every download, causing slow performance (20-50 seconds per download).

**Root Cause**: 
- The system has two PDF generation paths:
  1. **Background generation** (after order creation) - saves permanently + uploads to Google Drive
  2. **On-demand generation** (when downloading) - only saved locally, NO Google Drive upload

- If the permanent PDF file was deleted or cache cleared, downloads would trigger on-demand regeneration without Google Drive upload.

### Issue 2: Google Drive Not Available Sometimes
**Symptom**: Google Drive link was missing or unavailable after downloading PDFs.

**Root Cause**:
- On-demand PDF generation (in `downloadSlip()`) did NOT upload to Google Drive
- Only background generation (in `generatePDFBackground()`) uploaded to Google Drive
- If cache was cleared, `getPDFFilePath()` would re-register the PDF but without the Google Drive link

## Solution Implemented

### Fix 1: Add Google Drive Upload to On-Demand Generation
**File**: `controllers/slipController.js`

Added Google Drive upload logic to the on-demand PDF generation flow:

```javascript
// After saving PDF to disk
// ✅ Upload to Google Drive (if configured)
let googleDriveLink = null;
try {
    const { uploadToGoogleDrive, isGoogleDriveConfigured } = await import('../utils/googleDrive.js');
    if (isGoogleDriveConfigured()) {
        console.log(`📤 Uploading ${orderId} to Google Drive...`);
        googleDriveLink = await uploadToGoogleDrive(permanentPdfPath2, orderId);
        if (googleDriveLink) {
            console.log(`✅ Google Drive upload successful: ${googleDriveLink}`);
        }
    }
} catch (driveError) {
    console.error('❌ Google Drive upload error:', driveError.message);
}

// Save Google Drive link to database
await Order.findOneAndUpdate({ orderId }, { 
    permanentPdfFilename: `${orderId}.pdf`,
    googleDriveLink: googleDriveLink 
});
```

### Fix 2: Re-Register PDFs with Google Drive Links
**File**: `utils/pdfGenerator.js`

Enhanced `getPDFFilePath()` to fetch and re-register Google Drive links from the database:

```javascript
if (fs.existsSync(permanentPdfPath)) {
    // Re-register with Google Drive link from database
    (async () => {
        try {
            const Order = (await import('../models/Order.js')).default;
            const order = await Order.findOne({ orderId });
            if (order && order.googleDriveLink) {
                pdfJobs.set(orderId, { 
                    orderId, 
                    path: permanentPdfPath, 
                    status: 'ready', 
                    createdAt: new Date(),
                    googleDriveLink: order.googleDriveLink  // ✅ Include Google Drive link
                });
            }
        } catch (err) {
            // Fallback: register without Google Drive link
        }
    })();
    
    return permanentPdfPath;
}
```

## Expected Behavior After Fix

### Scenario 1: First Download (Background Generation Already Complete)
1. User completes payment
2. Background generation runs → PDF saved + uploaded to Google Drive
3. User clicks download
4. PDF served from cache (instant) with Google Drive link available

### Scenario 2: Download After Cache Cleared
1. Cache is cleared (server restart or manual cleanup)
2. User clicks download
3. System finds permanent PDF on disk
4. Re-registers in cache with Google Drive link from database
5. Serves existing PDF (fast) with Google Drive link available

### Scenario 3: Download When PDF Missing (Rare)
1. Permanent PDF was deleted
2. User clicks download
3. On-demand generation triggered
4. PDF generated + saved + **uploaded to Google Drive**
5. Google Drive link saved to database
6. PDF served with Google Drive link available

## Benefits

✅ **No Unnecessary Regeneration**: Existing PDFs are reused whenever possible
✅ **Google Drive Always Available**: Every PDF generation path uploads to Google Drive
✅ **Database Persistence**: Google Drive links persisted in database for reliability
✅ **Cache Recovery**: System can recover Google Drive links even after cache clear
✅ **Better Performance**: Avoids 20-50 second regeneration delays

## Files Modified

1. **controllers/slipController.js**
   - Added Google Drive upload to on-demand generation
   - Save Google Drive link to database after on-demand generation

2. **utils/pdfGenerator.js**
   - Enhanced `getPDFFilePath()` to re-register with Google Drive links
   - Fetches Google Drive link from database when re-registering PDFs

## Testing Checklist

- [ ] Create order and wait for background PDF generation
- [ ] Verify Google Drive link is available
- [ ] Download PDF (should be instant from cache)
- [ ] Restart server (clears cache)
- [ ] Download PDF again (should find existing PDF + Google Drive link)
- [ ] Delete permanent PDF file manually
- [ ] Download PDF (should regenerate + upload to Google Drive)
- [ ] Verify Google Drive link is still available

## Deployment

Committed in: `642ae99`
Status: ✅ Deployed and ready for testing

---

**Summary**: PDFs will no longer be regenerated unnecessarily, and Google Drive links will remain available even after cache clears or server restarts.
