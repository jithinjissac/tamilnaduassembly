# Scalability Issues & Recommended Fixes for 20+ Concurrent Users

## Current Architecture Problems

### 1. **Browser Instance Management - CRITICAL**
**Problem:** Mixed pattern of browser reuse
- `playwright.js`: Creates NEW browser per request (no reuse)
- `slipController.js`: Single shared browser (causes conflicts)
- `captchaController.js`: New browser per captcha (memory leak)

**Impact with 20+ users:**
- Memory exhaustion (each browser = ~200MB)
- Race conditions when multiple users share same browser
- Session data mixing between users
- No proper cleanup leading to zombie processes

### 2. **Captcha Session Storage - HIGH**
```javascript
const activeSessions = new Map(); // Never cleaned up
```
**Issues:**
- No expiration mechanism
- Sessions accumulate indefinitely
- Browser instances never closed
- Memory grows continuously

### 3. **PDF Generation Bottleneck - MEDIUM**
```javascript
let browserInstance = null; // Single browser for all PDFs
```
**Issues:**
- All users queue on one browser
- No parallelization
- Single point of failure

### 4. **No Connection Pooling - HIGH**
**Problem:** No limit on concurrent browser instances
- Users can spawn unlimited browsers
- No queue management
- Server crashes under load

---

## Recommended Solutions

### Solution 1: Browser Pool with Context Isolation ✅

```javascript
// utils/browserPool.js
import { chromium } from 'playwright';

class BrowserPool {
  constructor(maxBrowsers = 5) {
    this.maxBrowsers = maxBrowsers;
    this.browsers = [];
    this.queue = [];
  }

  async getBrowserContext(userId) {
    // Each user gets isolated context, browsers are reused
    if (this.browsers.length < this.maxBrowsers) {
      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.browsers.push(browser);
    }

    // Round-robin browser selection
    const browser = this.browsers[Math.floor(Math.random() * this.browsers.length)];
    
    // Create isolated context for this user
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0...',
      // Isolated storage
      storageState: undefined
    });

    // Auto-cleanup after use
    context.sessionId = userId;
    return context;
  }

  async closeContext(context) {
    await context.close(); // Only closes context, browser reused
  }
}

export const browserPool = new BrowserPool(5); // 5 browsers for 20+ users
```

**Benefits:**
- ✅ 5 browsers handle 20+ users (context isolation)
- ✅ Each user isolated (no data mixing)
- ✅ Memory efficient (5 × 200MB = 1GB vs 20 × 200MB = 4GB)
- ✅ Proper cleanup

### Solution 2: Session Manager with Expiration ✅

```javascript
// utils/sessionManager.js
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.startCleanup();
  }

  create(sessionId, context, page) {
    this.sessions.set(sessionId, {
      context,
      page,
      createdAt: Date.now(),
      expiresAt: Date.now() + (5 * 60 * 1000) // 5 min expiry
    });
  }

  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    // Check expiration
    if (Date.now() > session.expiresAt) {
      this.cleanup(sessionId);
      return null;
    }
    return session;
  }

  async cleanup(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.context.close(); // Closes context, not browser
      this.sessions.delete(sessionId);
    }
  }

  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions.entries()) {
        if (now > session.expiresAt) {
          this.cleanup(id);
        }
      }
    }, 60000); // Check every minute
  }
}

export const sessionManager = new SessionManager();
```

### Solution 3: Request Queue with Limits ✅

```javascript
// utils/requestQueue.js
class RequestQueue {
  constructor(maxConcurrent = 10) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async add(fn) {
    if (this.running >= this.maxConcurrent) {
      // Wait in queue
      await new Promise(resolve => this.queue.push(resolve));
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

export const captchaQueue = new RequestQueue(10);
export const pdfQueue = new RequestQueue(5);
```

### Solution 4: Updated Controllers

```javascript
// controllers/captchaController.js
import { browserPool } from '../utils/browserPool.js';
import { sessionManager } from '../utils/sessionManager.js';
import { captchaQueue } from '../utils/requestQueue.js';

router.get('/initCaptchaSession', async (req, res) => {
  try {
    const sessionId = Date.now().toString();
    
    // Queue the request (max 10 concurrent)
    await captchaQueue.add(async () => {
      // Get isolated context from pool
      const context = await browserPool.getBrowserContext(sessionId);
      const page = await context.newPage();
      
      // Set cookies and navigate...
      await context.addCookies([...]);
      await page.goto('...');
      
      // Store session
      sessionManager.create(sessionId, context, page);
    });

    res.json({ sessionId, captchaImage: '...' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/submitCaptcha', async (req, res) => {
  const { sessionId, captcha, ...params } = req.body;
  
  // Get session
  const session = sessionManager.get(sessionId);
  if (!session) {
    return res.status(400).json({ error: 'Session expired' });
  }

  try {
    // Use existing session
    const { page } = session;
    
    // Submit form...
    const voters = await extractVoters(page, params);
    
    res.json({ voters });
  } finally {
    // Cleanup session after use
    await sessionManager.cleanup(sessionId);
  }
});
```

---

## Implementation Priority

### Phase 1: Critical (Implement Now) 🔴
1. **Browser Pool** - Prevents memory exhaustion
2. **Session Manager** - Prevents memory leaks
3. **Request Queue** - Prevents server crashes

### Phase 2: High (Next Week) 🟡
1. **Monitoring** - Track browser count, memory usage
2. **Error Recovery** - Auto-restart failed browsers
3. **Load Balancing** - Distribute users across browser pool

### Phase 3: Medium (Future) 🟢
1. **Redis Session Storage** - For multi-server deployments
2. **Browser Farm** - External browser service (e.g., Browserless)
3. **Caching** - Cache captcha images, dropdown data

---

## Expected Performance

### Before (Current):
- **20 concurrent users** → 20 browser instances → 4GB RAM
- **Race conditions** → Data mixing between users
- **No limits** → Server crash under load
- **Memory leaks** → Requires restart daily

### After (With Fixes):
- **20 concurrent users** → 5 browser instances → 1GB RAM
- **Context isolation** → Each user completely isolated
- **Queue limits** → Graceful degradation under load
- **Auto-cleanup** → Stable 24/7 operation

---

## Monitoring Commands

```bash
# Check browser process count
ps aux | grep chromium | wc -l

# Monitor memory usage
watch -n 1 'ps aux | grep node'

# Check open file descriptors
lsof -p $(pgrep node) | wc -l
```

---

## Quick Fix for Production

If you need immediate relief before implementing full solution:

```javascript
// Add to server.js - Limit concurrent browsers
let activeBrowsers = 0;
const MAX_BROWSERS = 10;

app.use((req, res, next) => {
  if (activeBrowsers >= MAX_BROWSERS) {
    return res.status(503).json({ 
      error: 'Server busy, please try again in a moment' 
    });
  }
  next();
});
```

---

## Testing Recommendations

1. **Load Testing**: Use Apache Bench or k6
   ```bash
   ab -n 100 -c 20 http://localhost:3000/api/captcha/initCaptchaSession
   ```

2. **Memory Monitoring**: Check for leaks
   ```bash
   node --expose-gc --inspect server.js
   ```

3. **Concurrent User Simulation**: Test 20+ simultaneous requests

---

## Questions to Answer

1. **What is your server RAM?** (Determines max browsers)
2. **Expected peak concurrent users?** (For queue sizing)
3. **Single server or load balanced?** (Affects session storage)
4. **Budget for external services?** (Browserless.io costs ~$50/mo)
