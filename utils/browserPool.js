import { chromium } from 'playwright';
import { getProxyConfigWithFallback } from './proxyConfig.js';

/**
 * Browser Pool Manager
 * Manages a pool of browser instances with context isolation for concurrent users
 * - Reuses browsers efficiently (20 browsers can handle 80+ users)
 * - Each user gets isolated context (no data mixing)
 * - Automatic cleanup and health checks
 * - Closes idle browsers after 5 minutes of inactivity to save memory
 */
class BrowserPool {
  constructor(maxBrowsers = 30, idleTimeout = 5 * 60 * 1000) {
    this.maxBrowsers = maxBrowsers;
    this.idleTimeout = idleTimeout; // 5 minutes default
    this.browsers = [];
    this.contextCount = new Map(); // Track contexts per browser
    this.lastActivityTime = new Map(); // Track last activity per browser
    this.idleCheckInterval = null; // Interval for checking idle browsers
    this.launching = false;
    this.launchPromise = null;
    this.shuttingDown = false; // Flag to prevent new contexts during shutdown
    
    console.log(`🏊 Browser Pool initialized (max: ${maxBrowsers} browsers, idle timeout: ${idleTimeout/1000}s)`);
    
    // Start idle browser cleanup checker (runs every minute)
    this.startIdleChecker();
  }

  /**
   * Start idle browser checker
   * Runs every minute to close browsers with no active contexts for more than idleTimeout
   */
  startIdleChecker() {
    this.idleCheckInterval = setInterval(() => {
      if (this.shuttingDown) return;
      
      const now = Date.now();
      const browsersToClose = [];
      
      for (let i = 0; i < this.browsers.length; i++) {
        const browser = this.browsers[i];
        const contextCount = this.contextCount.get(browser) || 0;
        const lastActivity = this.lastActivityTime.get(browser) || now;
        
        // If browser has no contexts and has been idle for longer than idleTimeout
        if (contextCount === 0 && (now - lastActivity) > this.idleTimeout) {
          browsersToClose.push({ browser, index: i, idleTime: now - lastActivity });
        }
      }
      
      // Close idle browsers
      for (const { browser, index, idleTime } of browsersToClose) {
        this.closeIdleBrowser(browser, index, idleTime);
      }
    }, 60000); // Check every minute
    
    console.log('✅ Idle browser checker started (checking every 60 seconds)');
  }

  /**
   * Close an idle browser
   */
  async closeIdleBrowser(browser, index, idleTime) {
    try {
      if (browser.isConnected()) {
        await browser.close();
        console.log(`🧹 Closed idle browser #${index} (idle for ${Math.round(idleTime/1000)}s, freed memory)`);
      }
      
      // Remove from pool
      this.browsers = this.browsers.filter(b => b !== browser);
      this.contextCount.delete(browser);
      this.lastActivityTime.delete(browser);
      
    } catch (error) {
      console.error(`❌ Error closing idle browser #${index}:`, error.message);
    }
  }

  /**
   * Get an isolated browser context for a user
   * @param {string} userId - Unique identifier for this request
   * @returns {Object} { context, browserId }
   */
  async getBrowserContext(userId) {
    // Check if shutting down
    if (this.shuttingDown) {
      throw new Error('Browser pool is shutting down. Please try again later.');
    }
    
    // Ensure we have at least one browser
    if (this.browsers.length === 0) {
      await this.ensureBrowser();
    }

    // Find browser with least contexts (load balancing)
    let selectedBrowser = null;
    let minContexts = Infinity;

    for (const browser of this.browsers) {
      if (browser.isConnected()) {
        const count = this.contextCount.get(browser) || 0;
        if (count < minContexts) {
          minContexts = count;
          selectedBrowser = browser;
        }
      }
    }

    // Better load balancing: Create new browser if existing ones are getting full
    // Max 4 contexts per browser, but allow up to 20 browsers
    const shouldCreateNewBrowser = (
      this.browsers.length < this.maxBrowsers && // Not at max limit
      minContexts >= 4 // Least loaded browser already has 4+ contexts
    );
    
    if (shouldCreateNewBrowser) {
      console.log(`⚖️ Load balancing: All browsers have ${minContexts}+ contexts, launching new browser #${this.browsers.length} (total: ${this.browsers.length + 1}/${this.maxBrowsers})`);
      selectedBrowser = await this.ensureBrowser();
      minContexts = 0; // New browser has 0 contexts
    }

    // If still no browser (shouldn't happen), create one
    if (!selectedBrowser || !selectedBrowser.isConnected()) {
      // Double-check we're not shutting down
      if (this.shuttingDown) {
        throw new Error('Browser pool is shutting down. No browsers available.');
      }
      selectedBrowser = await this.ensureBrowser();
    }

    // Create isolated context with caching enabled (like normal browser)
    const context = await selectedBrowser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'Asia/Kolkata',
      // Enable caching for faster loads (like normal browser)
      acceptDownloads: false,
      // Enable JavaScript and CSS caching
      javaScriptEnabled: true,
      // Allow cookies for session reuse
      storageState: undefined,
      permissions: [],
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    // Track context count
    const currentCount = this.contextCount.get(selectedBrowser) || 0;
    this.contextCount.set(selectedBrowser, currentCount + 1);
    
    // Update last activity time (browser is now active)
    this.lastActivityTime.set(selectedBrowser, Date.now());

    // Store metadata
    context._poolMetadata = {
      userId,
      browserId: this.browsers.indexOf(selectedBrowser),
      createdAt: Date.now()
    };

    console.log(`✅ Context created for user ${userId} on browser #${context._poolMetadata.browserId} (${currentCount + 1} active contexts)`);

    return context;
  }

  /**
   * Release a context back to the pool
   * @param {Object} context - Browser context to release
   */
  async releaseContext(context) {
    if (!context || !context._poolMetadata) {
      console.warn('⚠️ Attempted to release context without metadata');
      return;
    }

    const { userId, browserId } = context._poolMetadata;

    try {
      await context.close();
      
      // Decrement context count
      const browser = this.browsers[browserId];
      if (browser) {
        const currentCount = this.contextCount.get(browser) || 0;
        const newCount = Math.max(0, currentCount - 1);
        this.contextCount.set(browser, newCount);
        
        // Update last activity time (for idle tracking)
        this.lastActivityTime.set(browser, Date.now());
        
        console.log(`♻️ Context released for user ${userId} from browser #${browserId} (${newCount} remaining)`);
      }
    } catch (error) {
      console.error(`❌ Error releasing context for user ${userId}:`, error.message);
    }
  }

  /**
   * Ensure at least one browser is available
   * @returns {Object} Browser instance
   */
  async ensureBrowser() {
    // If already launching, wait for it
    if (this.launching && this.launchPromise) {
      console.log('⏳ Browser launch in progress, waiting...');
      return await this.launchPromise;
    }

    // Check for healthy existing browsers
    for (const browser of this.browsers) {
      if (browser.isConnected()) {
        return browser;
      }
    }

    // Need to launch a new browser
    this.launching = true;
    this.launchPromise = this._launchBrowser();

    try {
      const browser = await this.launchPromise;
      return browser;
    } finally {
      this.launching = false;
      this.launchPromise = null;
    }
  }

  /**
   * Launch a new browser instance
   * @private
   */
  async _launchBrowser() {
    const browserIndex = this.browsers.length;
    console.log(`🚀 Launching browser #${browserIndex}...`);

    try {
      const proxyConfig = getProxyConfigWithFallback();
      const launchOptions = {
        headless: true, // Must be true for production servers without display
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-sync',
          '--disable-gpu' // Required for headless mode on Linux
        ],
        timeout: 30000
      };
      
      if (proxyConfig) {
        launchOptions.proxy = proxyConfig;
      }
      
      const browser = await chromium.launch(launchOptions);

      // Handle browser disconnection
      browser.on('disconnected', () => {
        console.log(`⚠️ Browser #${browserIndex} disconnected, removing from pool`);
        this.browsers = this.browsers.filter(b => b !== browser);
        this.contextCount.delete(browser);
        this.lastActivityTime.delete(browser);
      });

      this.browsers.push(browser);
      this.contextCount.set(browser, 0);
      this.lastActivityTime.set(browser, Date.now()); // Initialize activity time
      
      console.log(`✅ Browser #${browserIndex} launched (total: ${this.browsers.length}/${this.maxBrowsers})`);
      return browser;
      
    } catch (error) {
      console.error(`❌ Failed to launch browser #${browserIndex}:`, error.message);
      throw error;
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const now = Date.now();
    const stats = {
      totalBrowsers: this.browsers.length,
      connectedBrowsers: this.browsers.filter(b => b.isConnected()).length,
      totalContexts: 0,
      idleTimeout: this.idleTimeout,
      browsers: []
    };

    for (let i = 0; i < this.browsers.length; i++) {
      const browser = this.browsers[i];
      const contexts = this.contextCount.get(browser) || 0;
      const lastActivity = this.lastActivityTime.get(browser) || now;
      const idleTime = now - lastActivity;
      const willCloseIn = contexts === 0 ? Math.max(0, this.idleTimeout - idleTime) : null;
      
      stats.totalContexts += contexts;
      stats.browsers.push({
        id: i,
        connected: browser.isConnected(),
        contexts,
        idleTime: Math.round(idleTime / 1000), // seconds
        willCloseIn: willCloseIn ? Math.round(willCloseIn / 1000) : null // seconds until auto-close
      });
    }

    return stats;
  }

  /**
   * Cleanup: Close all browsers
   */
  async shutdown() {
    console.log('🛑 Shutting down browser pool...');
    
    // Stop idle checker
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
      console.log('✅ Stopped idle browser checker');
    }
    
    // Set shutdown flag to prevent new contexts
    this.shuttingDown = true;
    
    // Wait a moment for in-flight requests to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    for (let i = 0; i < this.browsers.length; i++) {
      const browser = this.browsers[i];
      try {
        if (browser.isConnected()) {
          await browser.close();
          console.log(`✅ Browser #${i} closed`);
        }
      } catch (error) {
        console.error(`❌ Error closing browser #${i}:`, error.message);
      }
    }

    this.browsers = [];
    this.contextCount.clear();
    this.lastActivityTime.clear();
    console.log('✅ Browser pool shutdown complete');
  }
}

// Singleton instance
// Optimized for 32 vCPU / 32 GB RAM server
// Each browser uses ~400-500 MB RAM, 30 browsers = ~15 GB
// Reduced from 50 to prevent EAGAIN (process limit) errors
export const browserPool = new BrowserPool(30);

// Graceful shutdown
process.on('SIGTERM', () => browserPool.shutdown());
process.on('SIGINT', () => browserPool.shutdown());
