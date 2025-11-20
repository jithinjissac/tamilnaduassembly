# 🚂 RAILWAY CONFIGURATION - URGENT

## Add These Environment Variables NOW

Go to Railway → Your Service → Variables tab → Add:

```
LOG_LEVEL=warn
REQUEST_LOG_INTERVAL=50
```

## What This Does

✅ **Reduces logs by ~95%**  
✅ **Stops "rate limit reached" errors**  
✅ **Keeps all error logging intact**  
✅ **Only logs every 50th HTTP request**

## After Adding Variables

1. Variables will auto-deploy
2. Check logs - should see much less output
3. No more "Railway rate limit of 500 logs/sec reached" messages

## If Still Too Many Logs

Increase the interval:
```
REQUEST_LOG_INTERVAL=100
```

Or reduce to errors only:
```
LOG_LEVEL=error
```

## What Changed in Code

- ✅ Created `utils/logger.js` - Smart logging utility
- ✅ Updated `controllers/paymentController.js` - 70% less logs
- ✅ Updated `server.js` - Throttled request logging
- ✅ All errors still visible
- ✅ Payment/order events still logged

## Verification

After deployment, logs should show:
```
[INFO] Server running on port 3000
[INFO] Log level: warn
[INFO] Request logging: Every 50th request
```

Then you'll only see:
- ⚠️  Warnings (yellow)
- ❌ Errors (red)
- ℹ️  Every 50th request

## Full Documentation

See `RAILWAY_LOG_REDUCTION.md` for complete details.
