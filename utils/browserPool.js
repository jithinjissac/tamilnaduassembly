import { chromium } from 'playwright';

/**
 * Browser Pool Manager
 * Manages a pool of browser instances with context isolation for concurrent users
 * - Reuses browsers efficiently (20 browsers can handle 80+ users)
 * - Each user gets isolated context (no data mixing)
 * - Automatic cleanup and health checks
 */
class BrowserPool {
  constructor(maxBrowsers = 20) {
    this.maxBrowsers = maxBrowsers;
    this.browsers = [];
    this.contextCount = new Map(); // Track contexts per browser
    this.launching = false;
    this.launchPromise = null;
    
    console.log(`🏊 Browser Pool initialized (max: ${maxBrowsers} browsers)`);
  }

  /**
   * Get an isolated browser context for a user
   * @param {string} userId - Unique identifier for this request
   * @returns {Object} { context, browserId }
   */
  async getBrowserContext(userId) {
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

    // If all browsers are heavily loaded and we can add more, do so
    if (minContexts > 3 && this.browsers.length < this.maxBrowsers) {
      selectedBrowser = await this.ensureBrowser();
    }

    // If still no browser (shouldn't happen), create one
    if (!selectedBrowser || !selectedBrowser.isConnected()) {
      selectedBrowser = await this.ensureBrowser();
    }

    // Create isolated context with caching enabled (like normal browser)
    const context = await selectedBrowser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      // Enable caching for faster loads (like normal browser)
      acceptDownloads: false,
      // Enable JavaScript and CSS caching
      javaScriptEnabled: true,
      // Allow cookies for session reuse
      storageState: undefined
    });

    // Track context count
    const currentCount = this.contextCount.get(selectedBrowser) || 0;
    this.contextCount.set(selectedBrowser, currentCount + 1);

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
        this.contextCount.set(browser, Math.max(0, currentCount - 1));
        console.log(`♻️ Context released for user ${userId} from browser #${browserId} (${currentCount - 1} remaining)`);
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
      const browser = await chromium.launch({
        headless: true, // Headless mode for production
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-sync'
        ],
        timeout: 30000
      });

      // Handle browser disconnection
      browser.on('disconnected', () => {
        console.log(`⚠️ Browser #${browserIndex} disconnected, removing from pool`);
        this.browsers = this.browsers.filter(b => b !== browser);
        this.contextCount.delete(browser);
      });

      this.browsers.push(browser);
      this.contextCount.set(browser, 0);
      
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
    const stats = {
      totalBrowsers: this.browsers.length,
      connectedBrowsers: this.browsers.filter(b => b.isConnected()).length,
      totalContexts: 0,
      browsers: []
    };

    for (let i = 0; i < this.browsers.length; i++) {
      const browser = this.browsers[i];
      const contexts = this.contextCount.get(browser) || 0;
      stats.totalContexts += contexts;
      stats.browsers.push({
        id: i,
        connected: browser.isConnected(),
        contexts
      });
    }

    return stats;
  }

  /**
   * Cleanup: Close all browsers
   */
  async shutdown() {
    console.log('🛑 Shutting down browser pool...');
    
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
    console.log('✅ Browser pool shutdown complete');
  }
}

// Singleton instance
export const browserPool = new BrowserPool(20);

// Graceful shutdown
process.on('SIGTERM', () => browserPool.shutdown());
process.on('SIGINT', () => browserPool.shutdown());
