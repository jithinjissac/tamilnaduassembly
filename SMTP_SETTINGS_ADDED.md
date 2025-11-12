# SMTP Settings Added to Admin Dashboard

## Overview
Added comprehensive SMTP configuration section to the Email Settings tab in the admin dashboard.

## Changes Made

### 1. SMTP Configuration Section (admin.html)
Added a new section at the top of the Email Settings form with:

**Fields:**
- ✅ **Enable Email Notifications** - Checkbox to turn email sending on/off
- ✅ **SMTP Host** - Server address (e.g., smtp.gmail.com)
- ✅ **SMTP Port** - Port number (587 for TLS, 465 for SSL)
- ✅ **Use SSL/TLS** - Checkbox for secure connection (port 465)
- ✅ **SMTP Username** - Email account username
- ✅ **SMTP Password** - Email account password (type: password)
- ✅ **From Email** - Sender email address
- ✅ **From Name** - Sender display name

**Features:**
- Green gradient header to distinguish from template sections
- Grid layout for Host/Port and FromEmail/FromName
- Helpful hints (Gmail App Password setup link)
- Info box with Gmail setup instructions
- All fields integrated with existing save/load functionality

### 2. JavaScript Updates

**populateEmailForm() Function:**
```javascript
// Now populates SMTP settings from database
if (data.enableEmailNotifications !== undefined) {
    form.querySelector('[name="enableEmailNotifications"]').checked = data.enableEmailNotifications;
}
if (data.smtpHost) form.querySelector('[name="smtpHost"]').value = data.smtpHost;
if (data.smtpPort) form.querySelector('[name="smtpPort"]').value = data.smtpPort;
// ... etc for all SMTP fields
```

**Form Submission:**
```javascript
const settings = {
    // SMTP settings
    enableEmailNotifications: formData.get('enableEmailNotifications') === 'on',
    smtpHost: formData.get('smtpHost') || '',
    smtpPort: parseInt(formData.get('smtpPort')) || 587,
    smtpSecure: formData.get('smtpSecure') === 'on',
    smtpUser: formData.get('smtpUser') || '',
    smtpPassword: formData.get('smtpPassword') || '',
    fromEmail: formData.get('fromEmail') || '',
    fromName: formData.get('fromName') || '',
    // Email templates...
};
```

## How to Use

### Step 1: Navigate to Email Settings
1. Login to admin dashboard
2. Click on "Email Settings" tab

### Step 2: Configure SMTP
1. Check "Enable Email Notifications"
2. Enter SMTP details:
   - **Gmail Example:**
     - Host: `smtp.gmail.com`
     - Port: `587` (uncheck SSL/TLS) or `465` (check SSL/TLS)
     - Username: `your-email@gmail.com`
     - Password: Use App Password (not regular password)
     - From Email: `noreply@easyslip.in` or your Gmail
     - From Name: `EASYSLIP`

3. Click "Save Email Settings"

### Step 3: Gmail App Password Setup
1. Enable 2-step verification on your Google account
2. Go to: https://myaccount.google.com/apppasswords
3. Generate an app password for "Mail"
4. Use that 16-character password in SMTP Password field

## Backend Integration

The settings are saved to the `Settings` model with these fields:
```javascript
{
    enableEmailNotifications: Boolean,
    smtpHost: String,
    smtpPort: Number,
    smtpSecure: Boolean,
    smtpUser: String,
    smtpPassword: String,
    fromEmail: String,
    fromName: String
}
```

The email service (`utils/emailService.js`) already uses these settings when sending emails.

## Visual Design

### SMTP Section Header
- **Color**: Green gradient (#28a745 to #20c997)
- **Icon**: Server icon (fa-server)
- **Purpose**: Distinguishes SMTP config from email templates (purple gradient)

### Layout
```
┌─────────────────────────────────────┐
│ SMTP Configuration (Green Header)  │
├─────────────────────────────────────┤
│ [✓] Enable Email Notifications     │
│ SMTP Host: [         ] Port: [ 587]│
│ [✓] Use SSL/TLS (Port 465)         │
│ Username: [                    ]    │
│ Password: [••••••••••••••••]       │
│ From Email: [      ] Name: [    ]  │
│ ℹ️ Gmail Setup Instructions         │
└─────────────────────────────────────┘
```

## Testing Checklist

- [ ] Navigate to admin dashboard → Email Settings
- [ ] Verify SMTP configuration section appears at top
- [ ] Fill in SMTP details for Gmail/other provider
- [ ] Check "Enable Email Notifications"
- [ ] Click "Save Email Settings"
- [ ] Verify success message appears
- [ ] Reload page and confirm settings are saved
- [ ] Test sending an email (place an order)
- [ ] Verify email is received with correct From address

## Related Files
- `frontend/admin.html` - Admin dashboard with SMTP UI
- `models/Settings.js` - Settings schema with SMTP fields
- `utils/emailService.js` - Email sending service that uses SMTP config
- `controllers/settingsController.js` - API endpoints for settings

## Notes
- Password field is masked (type="password") for security
- SMTP password is stored in database (consider encryption for production)
- Default port is 587 (TLS) - most common for Gmail
- Port 465 requires checking "Use SSL/TLS" checkbox
- Gmail requires App Password when 2FA is enabled
- fromEmail can be different from smtpUser (though some providers require matching)
