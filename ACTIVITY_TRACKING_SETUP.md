# Activity Tracking - IP & Location Setup

## Current Behavior

### In Development (localhost)
- IP shows as `127.0.0.1`, `::1`, or `192.168.x.x`
- Location displays as "Local Development"
- This is **EXPECTED** and correct for local testing

### In Production (with real users)
The system will automatically detect real user IPs and locations **IF** your reverse proxy is configured correctly.

## Production Setup Required

### If using Nginx (Recommended)

Add these lines to your Nginx configuration:

```nginx
location / {
    proxy_pass http://localhost:3000;
    
    # Forward real client IP
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
}
```

### If using Cloudflare

No additional configuration needed - Cloudflare automatically adds the `CF-Connecting-IP` header with the real client IP.

### If using Apache

```apache
<VirtualHost *:80>
    ProxyPreserveHost On
    
    # Forward real client IP
    RequestHeader set X-Forwarded-For "%{REMOTE_ADDR}s"
    RequestHeader set X-Real-IP "%{REMOTE_ADDR}s"
    
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
</VirtualHost>
```

## How It Works

1. **Development**: Shows "Local Development" for localhost IPs
2. **Production**: 
   - Extracts real client IP from proxy headers
   - Calls ipapi.co for geolocation (free tier: 1000 requests/day)
   - Stores: Country, Region, City, ISP, Timezone, Coordinates

## IP Detection Priority

The system checks headers in this order:
1. `CF-Connecting-IP` (Cloudflare)
2. `X-Real-IP` (Nginx)
3. `X-Forwarded-For` (Standard proxy)
4. `remoteAddress` (Direct connection)

## Testing in Production

After deployment, check the terminal logs:
- ✅ `🌍 Looking up location for IP: xxx.xxx.xxx.xxx`
- ✅ `✅ Location found: Mumbai, Maharashtra, India`

If you see:
- ⚠️ `⚠️ Local IP detected: 127.0.0.1`
- Your reverse proxy is not forwarding the real IP correctly

## Free Tier Limits

**ipapi.co free tier**: 1000 requests/day
- Each new user session = 1 request
- Subsequent requests from same session = 0 requests (cached)

**If you exceed the limit**:
- Location will show as "Unknown"
- All other tracking continues to work
- Consider upgrading to paid tier or using alternative service

## Alternative IP Geolocation Services

If you need more requests, consider:
- **ipapi.co Pro**: $10/month for 30K requests
- **ip-api.com**: 45 requests/minute (free)
- **ipinfo.io**: 50K requests/month (free)

To switch service, edit `middleware/activityTracker.js` → `getLocationFromIP()` function.

## Privacy Note

All IP geolocation is done server-side. User IPs are stored in the database for admin analytics only. No third-party tracking scripts are loaded on the frontend.
