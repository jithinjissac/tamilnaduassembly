# Quick Fix: Download "Access Denied" Error

## TL;DR
When users get **"Access denied. No token provided"** error on download:

### Quick Diagnosis
1. Open DevTools (F12)
2. Go to Application → Local Storage
3. Look for `token` key
   - **Missing?** → User not logged in
   - **Present?** → Token expired or invalid

### Quick Fix
**User-side:**
```
Click "Logout" → Click "Login" → Try download again
```

**For developers:**
```bash
# Check server
node server.js

# Verify JWT_SECRET is set
echo $JWT_SECRET

# Check logs for auth errors
grep -i "auth\|token" server.log
```

## Improved Features Added

### 1. Better Error Messages
Dashboard now shows:
- ❌ "Session expired. Please login again" → 401
- ❌ "Payment not completed. Please complete payment to download" → 403
- ❌ "Order not found" → 404
- ❌ "Network error. Please try again" → Network issues

### 2. Token Diagnostic Tool
**New file:** `frontend/token-diagnostic.html`

Shows:
- ✅ Token exists?
- ✅ Token format valid?
- ✅ Token expired?
- ✅ Server accepts token?

**Access:** Click "Token Diagnostic" link or visit:
```
http://localhost:3000/token-diagnostic.html
```

## What Changed

| File | Change |
|------|--------|
| `frontend/dashboard.html` | Enhanced error handling, shows actual error messages |
| `frontend/token-diagnostic.html` | NEW - Diagnostic tool to check auth token status |
| `AUTH_TOKEN_FIX_GUIDE.md` | NEW - Complete troubleshooting guide |

## Testing

```javascript
// In browser console while on dashboard:
const token = localStorage.getItem('token');
console.log('Token stored:', !!token);
console.log('Token length:', token?.length);

// Test download
const response = await fetch('/api/slips/download/{orderId}', {
    headers: {
        'Authorization': `Bearer ${token}`
    }
});
console.log('Response:', response.status, response.statusText);
```

## Error Resolution Map

| Error | Cause | Fix |
|-------|-------|-----|
| "No token provided" | Not logged in | Login again |
| Token not in localStorage | Session lost | Login again |
| Token format invalid | Corrupted token | Clear localStorage & login |
| "Token expired" | Session timeout | Login again |
| "User not found" | Account deleted | Contact support |
| "Invalid token" | Tampering detected | Clear localStorage & login |
| 403 Forbidden | Payment incomplete | Go to payment page |
| 404 Not Found | Order deleted | Check order history |

## Prevention

Add this to login flow:
```javascript
// After successful login
localStorage.setItem('token', response.data.token);
localStorage.setItem('tokenExpiry', new Date().getTime() + 7*24*60*60*1000); // 7 days
```

Before showing download button:
```javascript
function canDownload() {
    const token = localStorage.getItem('token');
    const expiry = localStorage.getItem('tokenExpiry');
    
    if (!token) return false; // Not logged in
    if (Date.now() > expiry) return false; // Expired
    return true;
}
```

## Support Template

```
User reported: "Access denied. No token provided" on download

Step 1: Run diagnostics
→ https://domain.com/token-diagnostic.html

Step 2: Check result
→ If token missing: Ask user to login again
→ If token expired: Ask user to login again
→ If server rejects: Check server is running

Step 3: Try download again

Result: ✅ Fixed | ❌ Still failing → Escalate
```
