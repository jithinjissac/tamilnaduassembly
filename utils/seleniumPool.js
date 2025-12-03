import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Selenium WebDriver Pool with Undetected ChromeDriver
 * 
 * This pool manages Selenium WebDriver instances with stealth configurations
 * to bypass bot detection on the Kerala SEC website.
 */

class SeleniumPool {
  constructor(config = {}) {
    this.maxBrowsers = config.maxBrowsers || 30;
    this.idleTimeout = config.idleTimeout || 5 * 60 * 1000; // 5 minutes
    this.activeBrowsers = new Map(); // sessionId -> driver
    this.idleBrowsers = []; // Available drivers
    this.creationQueue = [];
    this.stats = {
      created: 0,
      destroyed: 0,
      reused: 0,
      active: 0
    };
    
    console.log(`🚗 [SELENIUM] Pool initialized (max: ${this.maxBrowsers} browsers, idle timeout: ${this.idleTimeout / 1000}s)`);
  }

  /**
   * Get Chrome options with stealth configuration
   */
  getChromeOptions() {
    const options = new chrome.Options();
    
    // Headless mode
    options.addArguments('--headless=new');
    options.addArguments('--disable-gpu');
    
    // Stealth arguments
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-setuid-sandbox');
    options.addArguments('--disable-web-security');
    options.addArguments('--disable-features=IsolateOrigins,site-per-process');
    
    // User agent (real Chrome on Linux)
    options.addArguments('--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Window size
    options.addArguments('--window-size=1920,1080');
    options.addArguments('--start-maximized');
    
    // Disable automation flags
    options.excludeSwitches(['enable-automation']);
    options.addArguments('--disable-blink-features=AutomationControlled');
    
    // Performance optimizations
    options.addArguments('--disable-extensions');
    options.addArguments('--disable-plugins');
    options.addArguments('--disable-images'); // Faster loading
    options.addArguments('--blink-settings=imagesEnabled=false');
    
    // Proxy configuration
    const proxyServer = process.env.PROXY_SERVER;
    if (proxyServer && process.env.USE_PROXY === 'true') {
      console.log(`🌐 [SELENIUM] Configuring proxy: ${proxyServer}`);
      options.addArguments(`--proxy-server=${proxyServer}`);
    }
    
    // Preferences
    const prefs = {
      'profile.default_content_setting_values': {
        'images': 2, // Disable images
        'plugins': 2,
        'popups': 2,
        'geolocation': 2,
        'notifications': 2,
        'media_stream': 2
      },
      'profile.managed_default_content_settings': {
        'images': 2
      }
    };
    options.setUserPreferences(prefs);
    
    return options;
  }

  /**
   * Create a new WebDriver instance
   */
  async createDriver() {
    const startTime = Date.now();
    
    try {
      const options = this.getChromeOptions();
      
      const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();
      
      // Execute CDP commands to hide automation
      await driver.executeScript(`
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined
        });
        
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en', 'ml']
        });
        
        window.chrome = {
          runtime: {}
        };
        
        Object.defineProperty(navigator, 'permissions', {
          get: () => ({
            query: () => Promise.resolve({ state: 'granted' })
          })
        });
      `);
      
      this.stats.created++;
      this.stats.active++;
      
      const duration = Date.now() - startTime;
      console.log(`🚗 [SELENIUM] ✅ Driver created in ${duration}ms (total: ${this.stats.active}/${this.maxBrowsers})`);
      
      return driver;
      
    } catch (error) {
      console.error(`🚗 [SELENIUM] ❌ Failed to create driver:`, error.message);
      throw error;
    }
  }

  /**
   * Get a driver for a session
   */
  async getDriver(sessionId) {
    // Check if session already has a driver
    if (this.activeBrowsers.has(sessionId)) {
      console.log(`🚗 [SELENIUM] ♻️ Reusing driver for session ${sessionId}`);
      this.stats.reused++;
      return this.activeBrowsers.get(sessionId);
    }
    
    // Try to get idle driver
    let driver;
    if (this.idleBrowsers.length > 0) {
      driver = this.idleBrowsers.pop();
      console.log(`🚗 [SELENIUM] ♻️ Reused idle driver (${this.idleBrowsers.length} remaining)`);
      this.stats.reused++;
    } else if (this.stats.active < this.maxBrowsers) {
      driver = await this.createDriver();
    } else {
      throw new Error('Browser pool limit reached. Please wait and try again.');
    }
    
    // Store driver for session
    this.activeBrowsers.set(sessionId, driver);
    
    return driver;
  }

  /**
   * Release a driver back to the pool
   */
  async releaseDriver(sessionId) {
    const driver = this.activeBrowsers.get(sessionId);
    if (!driver) {
      console.log(`🚗 [SELENIUM] ⚠️ No driver found for session ${sessionId}`);
      return;
    }
    
    this.activeBrowsers.delete(sessionId);
    
    // Close the driver instead of reusing (safer for captcha sessions)
    try {
      await driver.quit();
      this.stats.active--;
      this.stats.destroyed++;
      console.log(`🚗 [SELENIUM] 🗑️ Driver closed for session ${sessionId} (active: ${this.stats.active})`);
    } catch (error) {
      console.error(`🚗 [SELENIUM] Error closing driver:`, error.message);
    }
  }

  /**
   * Cleanup all drivers
   */
  async cleanup() {
    console.log(`🚗 [SELENIUM] 🧹 Cleaning up all drivers...`);
    
    // Close active drivers
    for (const [sessionId, driver] of this.activeBrowsers.entries()) {
      try {
        await driver.quit();
        this.stats.destroyed++;
      } catch (error) {
        console.error(`🚗 [SELENIUM] Error closing driver for ${sessionId}:`, error.message);
      }
    }
    
    // Close idle drivers
    for (const driver of this.idleBrowsers) {
      try {
        await driver.quit();
        this.stats.destroyed++;
      } catch (error) {
        console.error(`🚗 [SELENIUM] Error closing idle driver:`, error.message);
      }
    }
    
    this.activeBrowsers.clear();
    this.idleBrowsers = [];
    this.stats.active = 0;
    
    console.log(`🚗 [SELENIUM] ✅ Cleanup complete`);
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
export const seleniumPool = new SeleniumPool({
  maxBrowsers: parseInt(process.env.MAX_BROWSERS) || 30,
  idleTimeout: 5 * 60 * 1000
});

// Cleanup on process exit
process.on('SIGINT', async () => {
  console.log('\n🛑 [SELENIUM] Received SIGINT, cleaning up...');
  await seleniumPool.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 [SELENIUM] Received SIGTERM, cleaning up...');
  await seleniumPool.cleanup();
  process.exit(0);
});
