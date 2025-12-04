import { chromium } from 'playwright';

/**
 * Playwright Browser Pool with Stealth Configuration
 * 
 * This pool manages Playwright browser instances with stealth configurations
 * to bypass bot detection on the Kerala SEC website.
 */

class PlaywrightPool {
  constructor(config = {}) {
    this.maxBrowsers = config.maxBrowsers || 30;
    this.idleTimeout = config.idleTimeout || 5 * 60 * 1000; // 5 minutes
    this.activeBrowsers = new Map(); // sessionId -> { browser, context, page }
    this.idleBrowsers = []; // Available browser instances
    this.creationQueue = [];
    this.stats = {
      created: 0,
      destroyed: 0,
      reused: 0,
      active: 0
    };
    
    console.log(`🎭 [PLAYWRIGHT] Pool initialized (max: ${this.maxBrowsers} browsers, idle timeout: ${this.idleTimeout / 1000}s)`);
  }

  /**
   * Get browser launch options with stealth configuration
   */
  getBrowserOptions() {
    const args = [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080',
      '--start-maximized',
      '--disable-extensions',
      '--disable-plugins'
    ];

    // Proxy configuration
    const proxyServer = process.env.PROXY_SERVER;
    if (proxyServer && process.env.USE_PROXY === 'true') {
      console.log(`🌐 [PLAYWRIGHT] Configuring proxy: ${proxyServer}`);
      args.push(`--proxy-server=${proxyServer}`);
    }

    return {
      headless: true,
      args,
      ignoreDefaultArgs: ['--enable-automation'],
    };
  }

  /**
   * Get browser context options
   */
  getContextOptions() {
    return {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'Asia/Kolkata',
      permissions: [],
      javaScriptEnabled: true,
      // Disable images for faster loading
      ignoreHTTPSErrors: true,
    };
  }

  /**
   * Create a new browser instance
   */
  async createBrowser() {
    const startTime = Date.now();
    
    try {
      const browser = await chromium.launch(this.getBrowserOptions());
      const context = await browser.newContext(this.getContextOptions());
      
      // Add stealth scripts to context
      await context.addInitScript(() => {
        // Remove webdriver property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
        
        // Mock plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        
        // Mock languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en', 'ml']
        });
        
        // Mock chrome object
        window.chrome = {
          runtime: {}
        };
        
        // Mock permissions
        Object.defineProperty(navigator, 'permissions', {
          get: () => ({
            query: () => Promise.resolve({ state: 'granted' })
          })
        });
      });
      
      const page = await context.newPage();
      
      // Block images and other resources for faster loading
      await page.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          route.abort();
        } else {
          route.continue();
        }
      });
      
      this.stats.created++;
      this.stats.active++;
      
      const duration = Date.now() - startTime;
      console.log(`🎭 [PLAYWRIGHT] ✅ Browser created in ${duration}ms (total: ${this.stats.active}/${this.maxBrowsers})`);
      
      return { browser, context, page };
      
    } catch (error) {
      console.error(`🎭 [PLAYWRIGHT] ❌ Failed to create browser:`, error.message);
      throw error;
    }
  }

  /**
   * Get a browser instance for a session
   */
  async getBrowser(sessionId) {
    // Check if session already has a browser
    if (this.activeBrowsers.has(sessionId)) {
      console.log(`🎭 [PLAYWRIGHT] ♻️ Reusing browser for session ${sessionId}`);
      this.stats.reused++;
      return this.activeBrowsers.get(sessionId);
    }
    
    // Try to get idle browser
    let browserInstance;
    if (this.idleBrowsers.length > 0) {
      browserInstance = this.idleBrowsers.pop();
      console.log(`🎭 [PLAYWRIGHT] ♻️ Reused idle browser (${this.idleBrowsers.length} remaining)`);
      this.stats.reused++;
    } else if (this.stats.active < this.maxBrowsers) {
      browserInstance = await this.createBrowser();
    } else {
      throw new Error('Browser pool limit reached. Please wait and try again.');
    }
    
    // Store browser for session
    this.activeBrowsers.set(sessionId, browserInstance);
    
    return browserInstance;
  }

  /**
   * Release a browser back to the pool
   */
  async releaseBrowser(sessionId) {
    const browserInstance = this.activeBrowsers.get(sessionId);
    if (!browserInstance) {
      console.log(`🎭 [PLAYWRIGHT] ⚠️ No browser found for session ${sessionId}`);
      return;
    }
    
    this.activeBrowsers.delete(sessionId);
    
    // Close the browser instead of reusing (safer for captcha sessions)
    try {
      await browserInstance.context.close();
      await browserInstance.browser.close();
      this.stats.active--;
      this.stats.destroyed++;
      console.log(`🎭 [PLAYWRIGHT] 🗑️ Browser closed for session ${sessionId} (active: ${this.stats.active})`);
    } catch (error) {
      console.error(`🎭 [PLAYWRIGHT] Error closing browser:`, error.message);
    }
  }

  /**
   * Cleanup all browsers
   */
  async cleanup() {
    console.log(`🎭 [PLAYWRIGHT] 🧹 Cleaning up all browsers...`);
    
    // Close active browsers
    for (const [sessionId, browserInstance] of this.activeBrowsers.entries()) {
      try {
        await browserInstance.context.close();
        await browserInstance.browser.close();
        this.stats.destroyed++;
      } catch (error) {
        console.error(`🎭 [PLAYWRIGHT] Error closing browser for ${sessionId}:`, error.message);
      }
    }
    
    // Close idle browsers
    for (const browserInstance of this.idleBrowsers) {
      try {
        await browserInstance.context.close();
        await browserInstance.browser.close();
        this.stats.destroyed++;
      } catch (error) {
        console.error(`🎭 [PLAYWRIGHT] Error closing idle browser:`, error.message);
      }
    }
    
    this.activeBrowsers.clear();
    this.idleBrowsers = [];
    this.stats.active = 0;
    
    console.log(`🎭 [PLAYWRIGHT] ✅ Cleanup complete`);
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      ...this.stats,
      idle: this.idleBrowsers.length,
      maxBrowsers: this.maxBrowsers
    };
  }
}

// Create singleton instance
export const playwrightPool = new PlaywrightPool({
  maxBrowsers: parseInt(process.env.MAX_BROWSERS) || 30,
  idleTimeout: 5 * 60 * 1000
});

// Cleanup on process exit
process.on('SIGINT', async () => {
  console.log('\n🛑 [PLAYWRIGHT] Received SIGINT, cleaning up...');
  await playwrightPool.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 [PLAYWRIGHT] Received SIGTERM, cleaning up...');
  await playwrightPool.cleanup();
  process.exit(0);
});
