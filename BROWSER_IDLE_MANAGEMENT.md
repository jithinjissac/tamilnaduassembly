# Browser Idle Management - Memory Optimization

## 🎯 Problem Solved
Previously, browser instances in the pool stayed running indefinitely, even when not in use, wasting server memory.

## ✅ Solution Implemented
Added automatic idle browser detection and cleanup to the browser pool:

### How It Works

1. **Idle Detection**
   - Every browser's last activity time is tracked
   - A background checker runs every 60 seconds
   - Browsers with 0 active contexts for more than 5 minutes are closed

2. **Activity Tracking**
   - `lastActivityTime` map tracks when each browser was last used
   - Updated when:
     - Browser is first launched
     - Context is created (getBrowserContext)
     - Context is released (releaseContext)

3. **Automatic Cleanup**
   - Idle browsers are gracefully closed
   - Memory is freed
   - Browser is removed from pool
   - Will be recreated on-demand when needed

### Key Features

- **Default Timeout**: 5 minutes (configurable)
- **Check Interval**: Every 60 seconds
- **Smart Logic**: Only closes browsers with 0 active contexts
- **On-Demand Creation**: New browsers launched automatically when needed
- **Graceful Shutdown**: Stops idle checker during server shutdown

## 📊 Browser Lifecycle

```
Browser Launch
    ↓
Active (contexts > 0)
    ↓
Idle (contexts = 0)
    ↓
[Wait 5 minutes]
    ↓
Auto-Close (if still idle)
    ↓
Freed Memory ✅
    ↓
[On next request]
    ↓
Launch New Browser (on-demand)
```

## 🔍 Statistics Now Include

- `idleTime`: How long each browser has been idle (seconds)
- `willCloseIn`: Countdown to auto-close for idle browsers (seconds, null if active)
- `idleTimeout`: Global timeout setting

Example stats output:
```json
{
  "totalBrowsers": 2,
  "connectedBrowsers": 2,
  "totalContexts": 1,
  "idleTimeout": 300000,
  "browsers": [
    {
      "id": 0,
      "connected": true,
      "contexts": 1,
      "idleTime": 45,
      "willCloseIn": null
    },
    {
      "id": 1,
      "connected": true,
      "contexts": 0,
      "idleTime": 280,
      "willCloseIn": 20
    }
  ]
}
```

## 💡 Benefits

### Memory Savings
- Idle browsers consume ~200-300 MB each
- With 20 max browsers, that's up to 6 GB saved when idle
- Only keeps browsers needed for active requests

### Performance
- No impact on active requests
- Browsers created on-demand within ~1 second
- Pool still handles bursts efficiently

### Reliability
- Prevents memory leaks from idle browsers
- Automatic cleanup of disconnected browsers
- Graceful shutdown handling

## 🎛️ Configuration

Default settings:
```javascript
const browserPool = new BrowserPool(
  20,              // maxBrowsers
  5 * 60 * 1000   // idleTimeout (5 minutes in ms)
);
```

To change idle timeout, modify in `utils/browserPool.js`:
```javascript
export const browserPool = new BrowserPool(20, 3 * 60 * 1000); // 3 minutes
```

## 🔄 Comparison: Before vs After

### Before
```
Server Start → Launch browsers → Keep running → Server Stop
                     ↓
              Memory always used
              (even when idle)
```

### After
```
Server Start → Launch on-demand → Use → Idle → Close after 5min → Free memory
                     ↓                              ↓
              Memory used only         Memory freed automatically
              when needed             when not needed
```

## 📝 Console Logs

When idle browser is closed:
```
🧹 Closed idle browser #1 (idle for 315s, freed memory)
```

When browser pool starts:
```
🏊 Browser Pool initialized (max: 20 browsers, idle timeout: 300s)
✅ Idle browser checker started (checking every 60 seconds)
```

## 🚀 Impact on PDF Generation

**PDF generation is NOT affected** - it uses fresh browsers:
- Fresh browsers are created per-request
- Closed immediately after PDF generation
- Not part of the browser pool
- Already optimized for memory efficiency

The browser pool is only used for:
- Captcha handling (user sessions)
- Other interactive browser operations

## ✨ Summary

Now the system intelligently manages browser memory:
- ✅ Launches browsers only when needed
- ✅ Closes idle browsers after 5 minutes
- ✅ Saves memory without affecting performance
- ✅ Automatic, no manual intervention needed
- ✅ Fully backward compatible
