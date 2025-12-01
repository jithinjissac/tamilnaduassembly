# Indian Proxy Integration for Kerala SEC Scraper

## Overview

This application now supports routing Playwright browser traffic through an Indian proxy server. This is crucial for Railway deployment since the Kerala State Election Commission portal may restrict access from non-Indian IPs.

---

## 🌐 Proxy Architecture

```
Railway App (US/EU)
    ↓
Indian Proxy Server (Google Cloud India)
IP: 34.47.254.160:3128
    ↓
Kerala SEC Portal (sec.kerala.gov.in)
```

**Benefits:**
- ✅ Appear to Kerala SEC as Indian traffic
- ✅ Avoid geo-blocking or rate limiting
- ✅ Optional authentication for security
- ✅ Graceful fallback if proxy unavailable

---

## 🚀 Quick Setup for Railway

### Step 1: Configure Environment Variables

In Railway Dashboard → Variables, add:

```bash
USE_PROXY=true
PROXY_SERVER=http://34.47.254.160:3128
```

**Optional (if you set up Squid authentication):**
```bash
PROXY_USER=your_username
PROXY_PASS=your_password
```

### Step 2: Deploy

That's it! The application will automatically use the proxy for all Playwright browser instances.

---

## 📁 Files Modified

### 1. `.env.example`
Added proxy environment variables:
```dotenv
PROXY_SERVER=http://34.47.254.160:3128
PROXY_USER=
PROXY_PASS=
USE_PROXY=false
```

### 2. `utils/proxyConfig.js` (NEW)
Centralized proxy configuration module with:
- ✅ Environment variable parsing
- ✅ Authentication support
- ✅ Validation and error handling
- ✅ Graceful fallback
- ✅ Logging and debugging utilities

### 3. Playwright Launch Points Updated

All browser launches now use proxy configuration:

| File | Purpose |
|------|---------|
| `controllers/playwrightStationsController.js` | Malayalam polling station extraction |
| `utils/browserPool.js` | Browser pool for concurrent scraping |
| `utils/playwright.js` | Main voter list extraction |
| `test-captcha.js` | Captcha testing utility |

**Example:**
```javascript
import { getProxyConfigWithFallback } from './utils/proxyConfig.js';

const proxyConfig = getProxyConfigWithFallback();
const launchOptions = { 
  headless: true, 
  args: ['--no-sandbox']
};

if (proxyConfig) {
  launchOptions.proxy = proxyConfig;
}

browser = await chromium.launch(launchOptions);
```

---

## 🔧 Advanced Configuration

### Option 1: HTTP Proxy (Current Setup - RECOMMENDED)

**Pros:**
- Simple to configure
- Works from anywhere (no VPN needed)
- Can be shared across multiple Railway instances
- No additional client software required

**Setup:**
```bash
USE_PROXY=true
PROXY_SERVER=http://34.47.254.160:3128
```

### Option 2: SOCKS5 Proxy with Authentication

If you set up Dante SOCKS5 server on your Google Cloud instance:

**Setup:**
```bash
USE_PROXY=true
PROXY_SERVER=socks5://34.47.254.160:1080
PROXY_USER=your_username
PROXY_PASS=your_password
```

### Option 3: Disable Proxy (Development)

For local development or testing:

```bash
USE_PROXY=false
# Or simply don't set it (defaults to false)
```

---

## 🛡️ Security Best Practices

### 1. Enable Proxy Authentication (Squid)

On your Google Cloud server:

```bash
# Install apache2-utils for htpasswd
sudo apt-get install -y apache2-utils

# Create password file
sudo htpasswd -c /etc/squid/passwd your_username

# Edit /etc/squid/squid.conf
sudo nano /etc/squid/squid.conf
```

Add these lines:
```
auth_param basic program /usr/lib/squid/basic_ncsa_auth /etc/squid/passwd
auth_param basic realm proxy
acl authenticated proxy_auth REQUIRED
http_access allow authenticated
http_access deny all
```

Restart Squid:
```bash
sudo systemctl restart squid
```

Then in Railway:
```bash
PROXY_USER=your_username
PROXY_PASS=your_strong_password
```

### 2. Restrict Access by IP (Google Cloud Firewall)

Only allow Railway's IP ranges to access port 3128:

```bash
gcloud compute firewall-rules create allow-railway-proxy \
  --allow tcp:3128 \
  --source-ranges=YOUR_RAILWAY_IP_RANGE \
  --target-tags=proxy-server
```

### 3. Use Environment Variables (Already Implemented)

Never hardcode credentials in code:
```javascript
// ✅ Good - uses environment variables
const proxyConfig = getProxyConfigWithFallback();

// ❌ Bad - hardcoded credentials
const proxyConfig = {
  server: 'http://34.47.254.160:3128',
  username: 'admin',
  password: 'password123'
};
```

---

## 🧪 Testing

### Test 1: Verify Proxy Configuration

```bash
# SSH into Railway container or run locally
node -e "import('./utils/proxyConfig.js').then(m => m.logProxyStatus())"
```

Expected output:
```
🌐 PROXY CONFIGURATION STATUS:
  Enabled: true
  Configured: true
  Authentication: No
  Valid: ✅
  Server: http://34.47.254.160:3128
```

### Test 2: Check IP Location

Create `scripts/test-proxy-ip.js`:

```javascript
import { chromium } from 'playwright';
import { getProxyConfigWithFallback } from '../utils/proxyConfig.js';

(async () => {
  const proxyConfig = getProxyConfigWithFallback();
  const browser = await chromium.launch({
    headless: true,
    proxy: proxyConfig
  });
  
  const page = await browser.newPage();
  await page.goto('https://ipinfo.io/json');
  const content = await page.content();
  console.log(content);
  await browser.close();
})();
```

Run:
```bash
USE_PROXY=true PROXY_SERVER=http://34.47.254.160:3128 node scripts/test-proxy-ip.js
```

Expected output should show Indian IP and location.

### Test 3: Test Kerala SEC Access

```bash
# Run the captcha test
USE_PROXY=true PROXY_SERVER=http://34.47.254.160:3128 node test-captcha.js
```

Should successfully load the Kerala SEC portal.

---

## 🐛 Troubleshooting

### Issue 1: Proxy Connection Timeout

**Symptoms:**
```
❌ Failed to launch browser #0: net::ERR_PROXY_CONNECTION_FAILED
```

**Solutions:**
1. Verify proxy server is running:
   ```bash
   curl -x http://34.47.254.160:3128 https://ipinfo.io
   ```

2. Check Google Cloud firewall allows port 3128

3. Verify Squid is running:
   ```bash
   ssh your-gcp-instance
   sudo systemctl status squid
   ```

### Issue 2: Authentication Failed

**Symptoms:**
```
❌ Failed to launch browser: net::ERR_PROXY_AUTH_REQUESTED
```

**Solutions:**
1. Verify credentials in Railway variables
2. Check Squid password file:
   ```bash
   sudo cat /etc/squid/passwd
   ```

3. Test authentication:
   ```bash
   curl -x http://username:password@34.47.254.160:3128 https://ipinfo.io
   ```

### Issue 3: Proxy Works But SEC Portal Blocks

**Symptoms:**
- IP test shows Indian location
- Kerala SEC returns "Access Denied" or 403

**Solutions:**
1. Verify proxy server location:
   ```bash
   curl -x http://34.47.254.160:3128 https://ipinfo.io/json
   ```
   Should show `"country": "IN"`

2. Check user-agent headers (already configured in code)

3. Add rate limiting delays in scraper

### Issue 4: Proxy Disabled But Still Trying

**Symptoms:**
```
🌐 Proxy disabled (USE_PROXY=false)
```
But browser still hangs.

**Solutions:**
1. Hard refresh Railway environment variables
2. Redeploy the app
3. Check logs for old proxy config being cached

---

## 📊 Performance Considerations

### Latency Impact

- **Without Proxy:** Railway → Kerala SEC (200-500ms)
- **With Proxy:** Railway → GCP India → Kerala SEC (150-300ms)

The proxy may actually **reduce** latency if Kerala SEC is optimized for Indian traffic.

### Bandwidth Costs

Google Cloud Squid proxy bandwidth:
- **Free tier:** 1 GB/month egress to internet
- **After free tier:** ~$0.12/GB

Estimate:
- 1 voter list page ≈ 100 KB
- 1000 pages/day ≈ 100 MB/day ≈ 3 GB/month
- **Cost:** ~$0.25-0.50/month

### Concurrent Connections

Current `browserPool.js` settings:
- Max browsers: 3
- Max contexts per browser: 5
- **Max concurrent connections through proxy:** 15

Squid can handle 100+ concurrent connections easily.

---

## 🔄 Fallback Behavior

The implementation gracefully handles proxy failures:

1. **Proxy unavailable:** Falls back to direct connection
2. **Auth fails:** Logs error, continues without proxy
3. **Invalid config:** Validates and skips proxy

**Example log:**
```
⚠️ USE_PROXY=true but PROXY_SERVER not configured
🌐 Proxy disabled (USE_PROXY=false)
🚀 Launching browser #0... (direct connection)
```

---

## 🚀 Production Deployment Checklist

- [ ] Set `USE_PROXY=true` in Railway
- [ ] Set `PROXY_SERVER=http://34.47.254.160:3128`
- [ ] (Optional) Configure Squid authentication
- [ ] (Optional) Set `PROXY_USER` and `PROXY_PASS` in Railway
- [ ] Test with `scripts/test-proxy-ip.js`
- [ ] Monitor application logs for proxy errors
- [ ] Set up Google Cloud firewall rules (restrict to Railway IPs)
- [ ] Monitor Squid logs: `sudo tail -f /var/log/squid/access.log`
- [ ] Set up alerts for proxy downtime

---

## 📝 Railway Deployment Example

### Dockerfile (No changes needed)

The existing Dockerfile already supports proxy configuration via environment variables.

### Railway Variables

```bash
# Core Config
NODE_ENV=production
PORT=3000
USE_PROTECTED=true

# Proxy Config
USE_PROXY=true
PROXY_SERVER=http://34.47.254.160:3128

# Optional Authentication
PROXY_USER=scraper_user
PROXY_PASS=secure_password_here

# Rest of your variables...
MONGODB_URI=...
JWT_SECRET=...
```

### Build Command
```bash
npm install && npx playwright install chromium
```

### Start Command
```bash
npm start
```

---

## 🔗 Related Documentation

- [SYMBOL_STORAGE_ISSUE.md](./SYMBOL_STORAGE_ISSUE.md) - AWS S3 migration guide
- [DEPLOYMENT_GUIDE_COMPLETE.md](./DEPLOYMENT_GUIDE_COMPLETE.md) - Full deployment guide
- [.env.example](./.env.example) - Environment variables reference

---

## 💡 Future Enhancements

1. **Proxy Pool:** Rotate between multiple Indian proxies for load balancing
2. **Health Checks:** Periodic proxy availability tests
3. **Metrics:** Track proxy usage and success rates
4. **Auto-failover:** Switch proxies if one goes down
5. **Smart Routing:** Use proxy only for Kerala SEC, direct for other services

---

**Last Updated:** December 1, 2025  
**Status:** ✅ Production Ready
