# Admin Settings API Documentation

## Overview
The Settings API allows administrators to configure various system settings across four categories:
- **PDF Generation Settings** - Control PDF preview, generation, and quality
- **Email & Notifications** - Configure SMTP and email templates
- **Security & Rate Limiting** - Manage authentication, passwords, and rate limits
- **Analytics & Monitoring** - Track usage and configure logging

All settings endpoints require **admin authentication**.

## Base URL
```
/api/settings
```

## Authentication
All endpoints require a JWT token with admin privileges:
```
Authorization: Bearer <admin-token>
```

---

## Endpoints

### 1. Get All Settings
**GET** `/api/settings/`

Returns all settings across all categories.

**Response:**
```json
{
  "status": "success",
  "settings": {
    "pdf": { ... },
    "email": { ... },
    "security": { ... },
    "analytics": { ... }
  }
}
```

---

### 2. Get Settings by Category
**GET** `/api/settings/:category`

Get settings for a specific category.

**Parameters:**
- `category` - one of: `pdf`, `email`, `security`, `analytics`

**Example:**
```bash
GET /api/settings/pdf
```

**Response:**
```json
{
  "status": "success",
  "category": "pdf",
  "settings": {
    "previewVoterLimit": 10,
    "previewCleanupMinutes": 5,
    "backgroundPDFThreshold": 1000,
    "maxConcurrentPDFJobs": 3,
    "pdfQuality": "high",
    "browserTimeout": 30000,
    "maxRetryAttempts": 3
  }
}
```

---

### 3. Update Settings
**PUT** `/api/settings/:category`

Update settings for a specific category.

**Parameters:**
- `category` - one of: `pdf`, `email`, `security`, `analytics`

**Request Body:**
```json
{
  "previewVoterLimit": 15,
  "previewCleanupMinutes": 10,
  "backgroundPDFThreshold": 1500
}
```

**Response:**
```json
{
  "status": "success",
  "message": "pdf settings updated successfully",
  "category": "pdf",
  "settings": { ... }
}
```

---

### 4. Reset Settings to Defaults
**POST** `/api/settings/reset/:category`

Reset a category's settings to default values.

**Parameters:**
- `category` - one of: `pdf`, `email`, `security`, `analytics`

**Example:**
```bash
POST /api/settings/reset/pdf
```

**Response:**
```json
{
  "status": "success",
  "message": "pdf settings reset to defaults",
  "category": "pdf",
  "settings": { ... }
}
```

---

### 5. Get Default Settings
**GET** `/api/settings/defaults/:category?`

Get the default settings for reference (without category returns all defaults).

**Response:**
```json
{
  "status": "success",
  "category": "pdf",
  "defaults": { ... }
}
```

---

### 6. Get Settings History
**GET** `/api/settings/history/:category?`

Get change history for settings (last 50 changes).

**Response:**
```json
{
  "status": "success",
  "history": [
    {
      "category": "pdf",
      "settings": { ... },
      "updatedBy": {
        "_id": "...",
        "email": "admin@example.com"
      },
      "lastModified": "2025-11-10T10:00:00.000Z"
    }
  ]
}
```

---

## Settings Categories

### 1. PDF Settings (`pdf`)
```javascript
{
  previewVoterLimit: 10,              // Voters in preview (5-50)
  previewCleanupMinutes: 5,           // Auto-delete time (1-60)
  backgroundPDFThreshold: 1000,       // Voter count for background gen (100-10000)
  maxConcurrentPDFJobs: 3,            // Max simultaneous jobs (1-10)
  pdfQuality: 'high',                 // 'low', 'medium', 'high'
  browserTimeout: 30000,              // Browser timeout ms (10000-120000)
  maxRetryAttempts: 3,                // Retry count (1-5)
  enablePDFCompression: false,
  pdfMargin: '10mm'
}
```

### 2. Email Settings (`email`)
```javascript
{
  enableEmailNotifications: false,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
  fromEmail: '',
  fromName: 'Kerala Voter Slip',
  emailTemplates: {
    orderConfirmation: true,
    paymentSuccess: true,
    pdfReady: true,
    orderExpiry: false
  },
  smsNotifications: false,
  webhookURL: ''
}
```

### 3. Security Settings (`security`)
```javascript
{
  jwtExpiryHours: 24,                 // JWT lifetime (1-168)
  maxLoginAttempts: 5,                // Login attempts (3-10)
  ipRateLimitPerMinute: 60,           // API calls/min (10-1000)
  enableCORS: true,
  allowedOrigins: ['http://localhost:3000'],
  sessionTimeout: 3600,               // Auto-logout seconds (300-7200)
  requireStrongPasswords: true,
  passwordMinLength: 8,               // Min password length (6-20)
  enable2FA: false,
  lockoutDurationMinutes: 15,         // Lockout duration (5-60)
  enableIPWhitelist: false,
  whitelistedIPs: []
}
```

### 4. Analytics Settings (`analytics`)
```javascript
{
  enableAnalytics: true,
  googleAnalyticsID: '',
  trackPDFDownloads: true,
  trackPayments: true,
  errorLogging: 'verbose',            // 'minimal', 'verbose'
  performanceMonitoring: true,
  dailyReports: false,
  alertOnErrors: true,
  reportEmail: '',
  trackUserActivity: true,
  retentionDays: 90                   // Data retention (30-365)
}
```

---

## Usage in Code

### Import Settings Helper
```javascript
import { 
  getPDFSettings, 
  getEmailSettings,
  getSecuritySettings,
  getAnalyticsSettings,
  getSetting 
} from '../utils/settingsHelper.js';
```

### Get Category Settings
```javascript
// Get all PDF settings
const pdfSettings = await getPDFSettings();
const previewLimit = pdfSettings.previewVoterLimit;

// Get specific setting
const previewLimit = await getSetting('pdf', 'previewVoterLimit');
```

### Update Settings
```javascript
// From frontend (admin panel)
const response = await fetch('/api/settings/pdf', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  },
  body: JSON.stringify({
    previewVoterLimit: 15,
    backgroundPDFThreshold: 1500
  })
});
```

---

## Frontend Admin Panel

Access the settings UI at:
```
http://localhost:3000/admin-settings.html
```

Features:
- ✅ Visual tabs for each category
- ✅ Form inputs for all settings
- ✅ Save/Reset buttons per category
- ✅ Real-time validation
- ✅ Success/error notifications
- ✅ Secure admin-only access

---

## Implementation Notes

1. **Caching**: Settings are cached for 1 minute to reduce database calls
2. **Validation**: Frontend validates input ranges before saving
3. **Defaults**: Each category has default values that can be restored
4. **History**: Change tracking with user and timestamp
5. **Security**: All endpoints require admin JWT authentication

---

## Error Handling

**401 Unauthorized**
```json
{
  "status": "error",
  "message": "Access denied. No token provided."
}
```

**403 Forbidden**
```json
{
  "status": "error",
  "message": "Access denied. Admin privileges required."
}
```

**400 Bad Request**
```json
{
  "status": "error",
  "message": "Invalid category: xyz"
}
```

**500 Internal Server Error**
```json
{
  "status": "error",
  "message": "Failed to update settings",
  "error": "..."
}
```

---

## Testing

### Test Get Settings
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:3000/api/settings/pdf
```

### Test Update Settings
```bash
curl -X PUT \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"previewVoterLimit": 15}' \
  http://localhost:3000/api/settings/pdf
```

### Test Reset Settings
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:3000/api/settings/reset/pdf
```

---

## Future Enhancements

- [ ] Email template editor
- [ ] 2FA implementation
- [ ] SMS notifications
- [ ] Rate limiting per user
- [ ] Custom PDF margins/styling
- [ ] Export/import settings as JSON
- [ ] Settings versioning and rollback
