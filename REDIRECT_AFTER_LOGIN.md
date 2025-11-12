# Redirect After Login Feature

## Overview
Implemented a redirect system that saves the intended destination URL when a user tries to access a protected page without being logged in, then redirects them back to that page after successful login.

## How It Works

### 1. Protected Pages Save Redirect URL
When a user tries to access a protected page without authentication, the page:
1. Saves the current URL to `sessionStorage` with key `redirectAfterLogin`
2. Redirects to `login.html`

### 2. Login/Register Pages Check for Redirect URL
After successful login or registration, the pages:
1. Check if `redirectAfterLogin` exists in `sessionStorage`
2. If it exists, redirect to that URL and clear the session storage
3. If it doesn't exist, use default behavior (redirect based on role)

## Updated Files

### Protected Pages (Save Redirect Before Login)
All these pages now save `window.location.pathname` (or pathname + search params) before redirecting to login:

1. ✅ **frontend/dashboard.html** - User dashboard
2. ✅ **frontend/create-slip.html** - Slip creation page
3. ✅ **frontend/preview.html** - Preview page (saves with query params)
4. ✅ **frontend/order-success.html** - Order success page (saves with query params)
5. ✅ **frontend/admin.html** - Admin panel
6. ✅ **frontend/admin-settings.html** - Admin settings
7. ✅ **frontend/email-settings.html** - Email settings
8. ✅ **frontend/slip-settings.html** - Slip settings

### Authentication Pages (Redirect After Login)
1. ✅ **frontend/login.html** - Checks for saved redirect URL after login
2. ✅ **frontend/register.html** - Checks for saved redirect URL after registration

## Code Example

### On Protected Page (e.g., dashboard.html)
```javascript
const token = localStorage.getItem('token');
if (!token) {
    // Save the intended destination before redirecting to login
    sessionStorage.setItem('redirectAfterLogin', window.location.pathname);
    window.location.href = 'login.html';
}
```

### On Pages with Query Params (e.g., preview.html)
```javascript
if (!token) {
    // Save the intended destination with query params before redirecting to login
    sessionStorage.setItem('redirectAfterLogin', window.location.pathname + window.location.search);
    window.location.href = 'login.html';
}
```

### On Login Page
```javascript
if (response.ok) {
    // Store token and user info
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    
    // Check if there's a saved redirect URL
    const redirectUrl = sessionStorage.getItem('redirectAfterLogin');
    if (redirectUrl) {
        sessionStorage.removeItem('redirectAfterLogin');
        window.location.href = redirectUrl;
        return;
    }
    
    // Default redirect based on user role
    if (data.user.role === 'admin') {
        window.location.href = 'admin.html';
    } else {
        window.location.href = 'dashboard.html';
    }
}
```

## User Flow Examples

### Example 1: User Clicks Email Link to Specific Order
1. User clicks link to `preview.html?orderId=ORD-123456`
2. Not logged in → redirected to `login.html` (saves `/preview.html?orderId=ORD-123456`)
3. User logs in successfully
4. Redirected back to `preview.html?orderId=ORD-123456` ✅

### Example 2: User Bookmarks Dashboard
1. User tries to access `dashboard.html` directly
2. Not logged in → redirected to `login.html` (saves `/dashboard.html`)
3. User logs in successfully
4. Redirected back to `dashboard.html` ✅

### Example 3: User Navigates to Login Normally
1. User clicks "Login" button from landing page
2. No saved redirect URL
3. User logs in successfully
4. Default redirect → `dashboard.html` (or `admin.html` for admins) ✅

## Technical Details

### Why sessionStorage?
- **Persists across page navigations** (unlike variables)
- **Clears when tab closes** (better security than localStorage)
- **Tab-specific** (doesn't interfere with other tabs)

### Security Considerations
- ✅ Only saves relative paths (pathname), not full URLs
- ✅ Clears redirect URL immediately after use
- ✅ Validates token on protected pages before allowing access
- ✅ Only redirects to paths within the application

### Browser Compatibility
- sessionStorage is supported in all modern browsers (IE 8+)
- Falls back to default behavior if sessionStorage is not available

## Testing Checklist

### Manual Testing
- [ ] Access `dashboard.html` without login → should redirect back after login
- [ ] Access `preview.html?orderId=XXX` without login → should redirect back with query params
- [ ] Access `create-slip.html` without login → should redirect back after login
- [ ] Login normally from landing page → should go to dashboard (no redirect)
- [ ] Register new account → should follow redirect if one was saved
- [ ] Admin login without prior redirect → should go to admin panel
- [ ] Regular user login without prior redirect → should go to dashboard

### Edge Cases
- [ ] User logs out then tries to access protected page → redirect works
- [ ] User has expired token, tries to access page → redirect works
- [ ] User opens multiple tabs with different protected pages → each tab has own redirect
- [ ] User closes tab before logging in → redirect is cleared (sessionStorage)

## Benefits

1. **Better User Experience** - Users don't lose their place when forced to login
2. **Email Links Work** - Direct links from emails work properly after login
3. **Bookmarks Work** - Users can bookmark any page and login when needed
4. **Share Links** - Users can share links to specific pages/orders
5. **Natural Flow** - Seamless continuation of user intent after authentication

## Notes

- The redirect is saved in `sessionStorage`, not `localStorage`, so it clears when the tab is closed
- Query parameters are preserved for pages that need them (preview, order-success)
- Admin users still go to admin panel if no redirect is saved
- Regular users still go to dashboard if no redirect is saved
