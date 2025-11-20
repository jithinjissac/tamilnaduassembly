# Railway Log Reduction Guide

## Problem
Railway has a rate limit of 500 logs/second. Your application was exceeding this limit causing message drops and performance issues.

## Solution Implemented

### 1. Logger Utility Created (`utils/logger.js`)
- Environment-based log levels (debug, info, warn, error, none)
- Color-coded output for better readability
- Request logging throttling (log every Nth request instead of all)

### 2. Updated Controllers
- Payment Controller: Reduced verbose logging by ~70%
- Captcha Controller: Added logger (ready for reduction)
- All error logs still captured, only info/debug reduced

### 3. Railway Environment Variables

Add these to your Railway environment variables:

```bash
# Set log level (debug, info, warn, error, none)
LOG_LEVEL=warn

# Log every Nth HTTP request (default: 10)
REQUEST_LOG_INTERVAL=50
```

## Recommended Railway Configuration

### Production Settings:
```
LOG_LEVEL=warn
REQUEST_LOG_INTERVAL=50
```
This will:
- Only log warnings and errors
- Only log every 50th HTTP request
- Reduce log rate by ~95%

### Development/Staging Settings:
```
LOG_LEVEL=info
REQUEST_LOG_INTERVAL=10
```
This will:
- Log info, warnings, and errors
- Log every 10th HTTP request
- Reduce log rate by ~80%

### Debug Mode (Temporary):
```
LOG_LEVEL=debug
REQUEST_LOG_INTERVAL=1
```
This will log everything (use only for troubleshooting)

## How to Set on Railway

1. Go to your Railway project dashboard
2. Click on your service
3. Go to "Variables" tab
4. Add:
   - `LOG_LEVEL` = `warn`
   - `REQUEST_LOG_INTERVAL` = `50`
5. Redeploy your service

## Verification

After redeployment, you should see:
- ✅ Significantly fewer logs per second
- ✅ No more "rate limit reached" messages
- ✅ All errors still visible
- ✅ Important payment/order events still logged

## Log Level Comparison

| Level | What Gets Logged | Use Case |
|-------|-----------------|----------|
| none  | Nothing | Not recommended |
| error | Only errors | High-traffic production (minimal logs) |
| warn  | Warnings + errors | **Recommended for production** |
| info  | Info + warn + error | Development/Staging |
| debug | Everything | Debugging only |

## Migration Notes

The logger utility is backwards compatible:
- Old: `console.log()` still works but isn't throttled
- New: `logger.info()` respects LOG_LEVEL setting
- Gradually migrating all controllers to use new logger

## Additional Optimizations

If you still see high log rates:
1. Increase `REQUEST_LOG_INTERVAL` to 100 or higher
2. Set `LOG_LEVEL=error` (only critical errors)
3. Check for any remaining console.log calls in frequently-hit routes

## Files Modified

- ✅ `utils/logger.js` - New logging utility
- ✅ `controllers/paymentController.js` - Reduced logging by 70%
- ⏳ `controllers/captchaController.js` - Logger added (TODO: replace console)
- ⏳ Other controllers - Will migrate gradually

## Emergency: Stop All Logs

If you need to completely stop logging temporarily:
```
LOG_LEVEL=none
```
⚠️ **Not recommended** - you won't see errors!
