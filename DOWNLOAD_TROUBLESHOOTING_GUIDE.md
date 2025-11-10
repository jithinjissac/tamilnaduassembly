# Download Failed - Troubleshooting Guide

## Status: Server Running ✅
- **Server:** http://localhost:3000
- **Status:** Online and accepting requests
- **Database:** MongoDB connected

## Why "Download Failed" May Appear

The error "Please try again" in the dashboard can have several root causes. Let's diagnose each one:

---

## 🔍 Diagnosis Steps

### Step 1: Check Browser Console for Details
1. Go to `http://localhost:3000/dashboard.html`
2. Open DevTools: **F12**
3. Go to **Console** tab
4. Try downloading an order
5. Look for error messages in red
6. Note the exact error and share it

**What to look for:**
- `NetworkError`
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`
- `500 Internal Server Error`
- `CORS error`

### Step 2: Check Network Tab
1. Open DevTools: **F12**
2. Go to **Network** tab
3. Click a Download button
4. Look for request: `/api/slips/download/ORD-...`
5. Check **Status Code** (should be 200 OK)
6. Check **Response** (should be PDF blob, not JSON)

**What to look for:**
- Status: Should be **200 OK** ✅
- Type: Should be **application/pdf** ✅
- Response: Should show PDF header bytes ✅

---

## 🛠️ Common Issues & Solutions

### Issue 1: 404 Not Found
```
Status: 404 Not Found
Message: "Order not found"
```

**Possible Causes:**
- Order ID mismatch (frontend passing wrong ID)
- Order doesn't exist in database
- Order belongs to different user

**Solution:**
- Verify order exists in dashboard table
- Check order payment status is "Completed"
- Try viewing order first (should work)

### Issue 2: 403 Forbidden
```
Status: 403 Forbidden
Message: "Payment not completed"
```

**Possible Causes:**
- Order payment is not marked as completed
- Order marked as unpaid or pending

**Solution:**
- Go to `/preview.html?orderId=...` to complete payment
- Verify payment status shows "Completed" in table
- Try again after payment is done

### Issue 3: 401 Unauthorized
```
Status: 401 Unauthorized
Message: "Session expired"
```

**Possible Causes:**
- Auth token is missing
- Auth token is expired
- Auth token is invalid

**Solution:**
- Go to `login.html` and login again
- Dashboard redirects to login automatically
- Try download again after login

### Issue 4: Network/CORS Error
```
NetworkError / CORS error
Message: "Network error"
```

**Possible Causes:**
- Server not running
- Wrong server address
- CORS misconfigured

**Solution:**
```bash
# 1. Check server status
curl http://localhost:3000

# 2. Verify server is running
npm start

# 3. Clear browser cache
Ctrl + F5 (hard refresh)
```

### Issue 5: 500 Internal Server Error
```
Status: 500 Internal Server Error
Message: "Server error"
```

**Possible Causes:**
- PDF generation failed
- Database query error
- File system error
- Puppeteer/Chromium issue

**Solution:**
- Check server logs for error details
- Verify MongoDB is running
- Verify Chromium/Puppeteer is installed
- Restart server: `npm start`

---

## 📋 Pre-Download Checklist

Before downloading, verify:

### ✅ Login Status
```javascript
// In browser console:
localStorage.getItem('token')
localStorage.getItem('user')
```

Should return non-empty values. If empty → **login first**

### ✅ Order in Database
Orders should have:
- ✅ `orderId` (custom ID like "ORD-20251109-001")
- ✅ `paymentStatus: 'completed'`
- ✅ `userId` (your user ID)
- ✅ `customization` (symbol and voter data)

### ✅ Server is Running
```bash
# Test in any terminal:
curl http://localhost:3000
# Should return HTML response
```

### ✅ MongoDB is Running
```bash
# Check MongoDB
docker ps | grep mongodb
# Should show running container
```

---

## 🧪 Manual Download Test

### Method 1: Browser Console
```javascript
// In browser console while logged in:
const token = localStorage.getItem('token');
const orderId = 'ORD-20251109-001'; // Replace with actual order ID

fetch(`/api/slips/download/${orderId}`, {
    headers: {
        'Authorization': `Bearer ${token}`
    }
})
.then(r => {
    console.log('Status:', r.status);
    console.log('Headers:', r.headers);
    return r.blob();
})
.then(blob => {
    console.log('Blob size:', blob.size, 'bytes');
    console.log('Blob type:', blob.type);
})
.catch(e => console.error('Error:', e));
```

### Method 2: Terminal (PowerShell)
```powershell
# Get a valid token first (login via browser)
$token = "your_token_from_localStorage"
$orderId = "ORD-20251109-001"

curl -H "Authorization: Bearer $token" `
     http://localhost:3000/api/slips/download/$orderId `
     -o test.pdf

# Check file size
Get-Item test.pdf | Select-Object Length
```

---

## 📊 Debugging Information to Collect

If download fails, please provide:

1. **Browser Console Error:**
   - Open F12 → Console → Try download → Copy error

2. **Network Response:**
   - F12 → Network → Click request → Copy Response

3. **Order Details:**
   - What is the order ID?
   - What is the payment status?
   - Is order visible in dashboard table?

4. **Server Logs:**
   - Terminal output when download is attempted
   - Any error messages shown?

5. **Token Status:**
   ```javascript
   // In console:
   console.log('Token:', localStorage.getItem('token'));
   console.log('User:', localStorage.getItem('user'));
   ```

---

## 🚀 Quick Recovery Steps

### If Download Never Worked:
1. Clear all browser cache: `Ctrl+Shift+Delete`
2. Hard refresh: `Ctrl+F5`
3. Login again
4. Try downloading

### If Download Worked Before But Now Broken:
1. Check server is running: `npm start`
2. Check MongoDB is running: `docker ps | grep mongodb`
3. Clear browser cache: `Ctrl+Shift+Delete`
4. Hard refresh dashboard: `Ctrl+F5`
5. Try downloading

### If Download Times Out:
1. Server may be slow generating PDF
2. Wait 10-15 seconds before trying again
3. Try viewing order first (faster)
4. Check server console for generation progress

---

## 📞 Next Steps

1. **Try the steps above** to identify which error you're seeing
2. **Collect diagnostic information** from browser console and network tab
3. **Share the specific error message** (not just "failed")
4. **Include order ID** and **payment status**
5. **Check server logs** for any error details

---

## ✨ Expected Behavior

### ✅ Successful Download:
1. Click Download button
2. Button shows loading state
3. PDF downloads automatically
4. File named: `voter-slips-ORD-XXXXX.pdf`
5. No error messages

### ❌ Failed Download:
1. Click Download button
2. Alert appears with specific error
3. Error explains why (401, 403, 404, 500, etc.)
4. Actionable next steps shown

---

## 🔗 Related Endpoints

- **View Order:** `/api/orders/:orderId` (GET)
- **Download Slip:** `/api/slips/download/:orderId` (GET)
- **List Orders:** `/api/orders` (GET)
- **Complete Payment:** `/api/payment/verify` (POST)

All protected endpoints require:
```
Authorization: Bearer {token}
```

---

**Server Status:** ✅ RUNNING  
**Last Updated:** November 9, 2025  
**Ready to troubleshoot!**
