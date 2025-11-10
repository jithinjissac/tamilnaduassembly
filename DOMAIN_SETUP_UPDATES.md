# Update these after domain is connected

## Frontend URLs (Optional)
If you hardcoded any URLs, update them:

```javascript
// Before:
const API_URL = 'https://kerala-voter-production.up.railway.app';

// After:
const API_URL = 'https://voters.yourdomain.com';
```

## CORS Settings (server.js)
Update allowed origins if needed:

```javascript
const allowedOrigins = [
  'https://voters.yourdomain.com',
  'https://www.yourdomain.com',
  'http://localhost:3000'
];
```

## Email Settings
Update email links to use your domain:

```javascript
fromEmail: 'noreply@yourdomain.com'
websiteUrl: 'https://voters.yourdomain.com'
```

## Razorpay Webhook
Update webhook URL in Razorpay dashboard:

```
Old: https://kerala-voter-production.up.railway.app/api/payment/webhook
New: https://voters.yourdomain.com/api/payment/webhook
```
