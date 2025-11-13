# Access Control & Email Notification Fixes

## Issues Fixed

### 1. ❌ Old Orders Getting "PDF Ready" Emails
**Problem**: When the system found existing PDFs on disk (from previous generations), it would send "PDF Ready" emails even though the PDF wasn't newly generated.

**Root Cause**: `pdfGenerator.js` line 185-197 sent emails whenever it registered a PDF in cache, including when finding old PDFs.

**Solution**: Track whether PDF already existed before updating the database:
```javascript
const orderBefore = await Order.findOne({ orderId });
const hadPdfBefore = orderBefore?.permanentPdfFilename;

// Only send email if this is a NEW PDF generation
if (!hadPdfBefore) {
    // Send email...
} else {
    console.log(`ℹ️ PDF already existed for ${orderId}, skipping email notification`);
}
```

**Files Changed**: `utils/pdfGenerator.js`

---

### 2. ❌ Order Owners Getting "Access Denied"
**Problem**: Legitimate order owners couldn't access their own orders despite being logged in.

**Root Cause**: Type mismatch when comparing userIds:
- `order.userId` from MongoDB was ObjectId type
- `currentUserId` from profile API was string
- Direct comparison (`===`) failed even when IDs matched

**Solution**: Convert both to strings before comparison:
```javascript
if (String(order.userId) !== String(currentUserId) && !isAdminUser) {
    throw new Error('UNAUTHORIZED');
}
```

**Additional Debugging**: Added detailed console logging:
```javascript
console.log('🔍 Access Verification:');
console.log('   Current User ID:', currentUserId, typeof currentUserId);
console.log('   Order User ID:', order.userId, typeof order.userId);
console.log('   Match:', String(order.userId) === String(currentUserId));
```

**Files Changed**: 
- `frontend/preview.html`
- `frontend/order-success.html`

---

### 3. 🔄 Browser Cache Issues
**Problem**: Users might still see "Access Denied" due to cached old JavaScript code.

**Solution**: Disabled caching for HTML files in Express:
```javascript
app.use(express.static(path.join(__dirname, 'frontend'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));
```

**Files Changed**: `server.js`

---

## Testing Instructions

### Test 1: Verify No Duplicate Emails
1. Create a new order and complete payment
2. Wait for PDF generation
3. Check email - should receive ONE "PDF Ready" email
4. Restart server (this triggers PDF cache refresh)
5. Access the order again
6. Check email - should NOT receive another "PDF Ready" email

### Test 2: Verify Owner Access
1. Login as regular user (not admin)
2. Create an order
3. Access preview page with the order ID
4. Open browser console (F12)
5. Should see:
   ```
   🔍 Access Verification:
      Current User ID: 673...
      Order User ID: 673...
      Match: true
   ✅ Access verification passed
   ```
6. Page should load normally (NO access denied overlay)

### Test 3: Verify Admin Access
1. Login as admin
2. Access ANY order's preview page
3. Should see order details without access denied
4. Try accessing non-existent order
5. Should see alert "Order not found" and redirect to admin panel

### Test 4: Verify Unauthorized Access Blocked
1. Login as User A
2. Create order (note the order ID)
3. Logout and login as User B
4. Try to access User A's order
5. Should see green "Access Denied" overlay

---

## Browser Console Debugging

If users still report access issues, ask them to:

1. **Hard refresh the page**: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
2. **Open browser console**: Press F12
3. **Look for access verification logs**:
   ```
   🔍 Access Verification:
      Current User ID: ...
      Order User ID: ...
      Match: true/false
   ```
4. **Check for errors**:
   - Red errors indicate auth failure
   - Green ✅ indicates success

---

## Summary of Changes

| File | Lines Changed | Purpose |
|------|---------------|---------|
| `utils/pdfGenerator.js` | 185-210 | Prevent duplicate PDF ready emails |
| `frontend/preview.html` | 680-700 | Fix access verification with String() conversion + logging |
| `frontend/order-success.html` | 490-510 | Same fix as preview.html |
| `server.js` | 37-47 | Disable HTML caching for immediate updates |

---

## Related Issues Resolved

- ✅ Admin can access all orders
- ✅ Order owners can access their own orders
- ✅ Unauthorized users blocked with Kerala theme overlay
- ✅ PDF ready emails sent only once per generation
- ✅ Browser cache doesn't prevent security updates

---

## Technical Notes

### ObjectId vs String Comparison
MongoDB ObjectIds are special objects that need `.toString()` or `String()` conversion:
```javascript
// ❌ This fails even when IDs match
order.userId === currentUserId

// ✅ This works
String(order.userId) === String(currentUserId)
```

### Email Notification Logic
Emails should ONLY be sent when:
1. PDF is **newly generated** (not found on disk)
2. Payment status is **"completed"**
3. Order has a valid **userId** (populated user object)

### Cache Control Headers
Critical for security updates to reach users immediately:
- `no-cache`: Must revalidate with server
- `no-store`: Don't store in cache
- `must-revalidate`: Always check with server before using cached copy

---

**Date**: November 13, 2025  
**Status**: ✅ Resolved
