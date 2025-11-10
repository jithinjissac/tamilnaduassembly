# Authentication Token Download Issue - Fix Guide

## Problem
Users are getting **"Access denied. No token provided"** error when trying to download old orders from the dashboard.

## Root Cause Analysis

The error occurs when:
1. User clicks "Download" button on a previous order
2. Frontend sends request to `/api/slips/download/{orderId}`
3. Auth middleware checks for `Authorization: Bearer {token}` header
4. Token is missing or invalid
5. Server rejects with 401 Unauthorized

## Diagnostics

### Check 1: Is Token Stored?
Open browser DevTools (F12) → Application → Local Storage → Look for `token` key

**If NOT present:**
- User needs to login again
- Have them click "Logout" then "Login"

**If present:**
- Copy the token value
- Continue to Check 2

### Check 2: Is Token Valid?
Use the **Token Diagnostic Tool**: `frontend/token-diagnostic.html`

Navigate to: `http://localhost:3000/token-diagnostic.html` (or your domain)

This tool will:
- ✅ Verify token exists
- ✅ Check token format (JWT structure)
- ✅ Decode token payload
- ✅ Check if token is expired
- ✅ Test with server

### Check 3: Manual Token Verification

In browser console, run:
```javascript
const token = localStorage.getItem('token');
console.log('Token:', token);

// Decode token manually
const parts = token.split('.');
const payload = JSON.parse(atob(parts[1]));
console.log('Payload:', payload);
console.log('Expires at:', new Date(payload.exp * 1000));
console.log('Is expired?', payload.exp * 1000 < Date.now());
```

## Solutions

### Solution 1: Session Expired (Most Common)
**Error:** Token expiration date in the past

**Fix:** User needs to login again
```
1. Click "Logout" button
2. Click "Login"
3. Enter credentials
4. Try download again
```

### Solution 2: Token Not Stored
**Error:** No token in localStorage

**Fix:** Login again
```
1. Go to http://localhost:3000/login.html
2. Enter email and password
3. Should redirect to dashboard
4. Try download again
```

### Solution 3: Corrupted Token
**Error:** Token format invalid or decode fails

**Fix:** Clear localStorage and login
```javascript
// In browser console:
localStorage.clear();
// Then login again via http://localhost:3000/login.html
```

### Solution 4: Server-Side Issue
**Error:** Server rejects valid token

**Checks:**
1. Verify JWT_SECRET environment variable is set
2. Restart server: `npm start`
3. Check server logs for token verification errors

## Code Changes Made

### 1. Enhanced Error Messages (dashboard.html)
**File:** `frontend/dashboard.html` (lines 596-648)

Added:
- Token existence check before request
- Detailed error response parsing
- Session expiration detection
- Payment status checking
- Specific error messages for each HTTP status

**Before:**
```javascript
} else {
    alert('Download failed. Please try again.');
}
```

**After:**
```javascript
} else {
    try {
        const errorData = await response.json();
        if (response.status === 401) {
            alert('Session expired. Please login again.');
            window.location.href = 'login.html';
        } else if (response.status === 403) {
            alert(errorData.message || 'Download not allowed. Please complete payment.');
        } else if (response.status === 404) {
            alert('Order not found.');
        } else {
            alert(errorData.message || 'Download failed. Please try again.');
        }
    } catch (parseError) {
        alert(`Download failed (${response.status}). Please try again.`);
    }
}
```

### 2. Diagnostic Tool (token-diagnostic.html)
**File:** `frontend/token-diagnostic.html` (NEW)

Features:
- Checks if token exists in localStorage
- Validates JWT structure
- Decodes token payload
- Checks expiration time
- Tests with server
- Shows helpful error messages
- Direct links to login

**Access:** `http://localhost:3000/token-diagnostic.html`

## Testing Checklist

- [ ] Login to dashboard
- [ ] Navigate to "My Orders" section
- [ ] For a completed order with payment, click "Download"
- [ ] PDF should download (or meaningful error shown)
- [ ] Try token diagnostic tool
- [ ] Check localStorage has token after login
- [ ] Logout and verify token removed
- [ ] Login again and verify token restored

## Environment Variables Check

Ensure these are set in `.env`:
```
JWT_SECRET=your-secret-key-change-this
MONGODB_URI=your-mongo-url
NODE_ENV=development
PORT=3000
```

If JWT_SECRET changed recently:
1. All existing tokens become invalid
2. Users must login again
3. Old orders can still be downloaded if PDF cached

## Preventive Measures

1. **Token Refresh:** Consider implementing token refresh mechanism for better UX
2. **Token Validation:** Add token validation before showing download button
3. **Auto-Login:** Could auto-refresh token on page load if close to expiration
4. **Error Boundary:** Catch auth errors globally and redirect to login

## For Developers

### Auth Middleware (middleware/auth.js)
- Extracts token from `Authorization: Bearer {token}` header
- Verifies JWT signature using JWT_SECRET
- Returns 401 if token missing, invalid, or expired

### Download Route (routes/slips.js)
- Protected with `auth` middleware
- Route: `GET /api/slips/download/:orderId`
- Only allows download if payment completed

### Error Codes
- **401 Unauthorized:** No token, invalid token, or expired token
- **403 Forbidden:** Payment not completed
- **404 Not Found:** Order not found
- **500 Server Error:** PDF generation failed

## Support Steps

1. Have user run token diagnostic tool
2. Share screenshot or output
3. Check error message indicates:
   - Token issue → Have them login again
   - Payment issue → Direct to payment page
   - Server error → Check server logs
4. If still failing, check:
   - Server logs: `node server.js 2>&1 | grep -i "auth\|token"`
   - MongoDB connection
   - JWT_SECRET setting
   - Firewall/proxy blocking auth header

## Resources

- JWT Documentation: https://jwt.io
- Node.js JWT: https://github.com/auth0/node-jsonwebtoken
- Express Middleware: https://expressjs.com/en/guide/using-middleware.html
