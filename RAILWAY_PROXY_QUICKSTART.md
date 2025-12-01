# 🚀 Railway Deployment - Proxy Quick Setup

## Copy-Paste Environment Variables

Add these to your Railway Dashboard → Variables:

```bash
# Enable Indian Proxy
USE_PROXY=true
PROXY_SERVER=http://34.47.254.160:3128

# Optional: Add authentication if you configured Squid with passwords
# PROXY_USER=your_username
# PROXY_PASS=your_password
```

---

## ✅ That's It!

Your Kerala SEC scraper will now:
- Route all browser traffic through Google Cloud India
- Appear to Kerala SEC as Indian traffic
- Bypass geo-blocking automatically
- Fall back to direct connection if proxy fails

---

## 🧪 Test After Deployment

### Option 1: Check Railway Logs

Look for these log messages:

```
🌐 Proxy configured without authentication: http://34.47.254.160:3128
✅ Browser will use proxy
```

### Option 2: Run Test Script

If you have SSH access to Railway container:

```bash
node scripts/test-proxy-ip.js
```

Should show:
```
IP Address: 34.47.254.160
Country: IN
✅ SUCCESS: IP appears to be from India!
```

---

## 🔧 Disable Proxy (If Needed)

```bash
USE_PROXY=false
```

Or simply remove the `USE_PROXY` variable from Railway.

---

## 📚 Full Documentation

- [PROXY_INTEGRATION_GUIDE.md](./PROXY_INTEGRATION_GUIDE.md) - Complete setup guide
- [PROXY_IMPLEMENTATION_SUMMARY.md](./PROXY_IMPLEMENTATION_SUMMARY.md) - What changed

---

**Last Updated:** December 1, 2025
