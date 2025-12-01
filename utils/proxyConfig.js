/**
 * Centralized Proxy Configuration for Playwright
 * 
 * Purpose: Configure Indian proxy for Railway deployment to access Kerala SEC portal
 * The Indian proxy server (Google Cloud India) allows the scraper to appear from India
 * 
 * Usage:
 *   import { getProxyConfig } from './utils/proxyConfig.js';
 *   const browser = await chromium.launch({ proxy: getProxyConfig() });
 */

/**
 * Get proxy configuration from environment variables
 * @returns {Object|null} Proxy config object or null if proxy disabled
 */
export function getProxyConfig() {
  const useProxy = process.env.USE_PROXY === 'true';
  
  if (!useProxy) {
    console.log('🌐 Proxy disabled (USE_PROXY=false)');
    return null;
  }

  const proxyServer = process.env.PROXY_SERVER;
  
  if (!proxyServer) {
    console.warn('⚠️ USE_PROXY=true but PROXY_SERVER not configured');
    return null;
  }

  const config = {
    server: proxyServer
  };

  // Add authentication if configured
  if (process.env.PROXY_USER && process.env.PROXY_PASS) {
    config.username = process.env.PROXY_USER;
    config.password = process.env.PROXY_PASS;
    console.log(`🔐 Proxy configured with authentication: ${proxyServer} (user: ${process.env.PROXY_USER})`);
  } else {
    console.log(`🌐 Proxy configured without authentication: ${proxyServer}`);
  }

  return config;
}

/**
 * Test proxy connection
 * @param {Object} page - Playwright page instance
 * @returns {Promise<Object>} IP info from ipinfo.io
 */
export async function testProxyConnection(page) {
  try {
    await page.goto('https://ipinfo.io/json', { timeout: 15000 });
    const content = await page.content();
    const ipInfo = JSON.parse(content.match(/<pre>(.*?)<\/pre>/s)?.[1] || '{}');
    
    console.log('📍 Current IP Info:', {
      ip: ipInfo.ip,
      city: ipInfo.city,
      region: ipInfo.region,
      country: ipInfo.country,
      org: ipInfo.org
    });
    
    return ipInfo;
  } catch (error) {
    console.error('❌ Failed to test proxy connection:', error.message);
    throw error;
  }
}

/**
 * Get proxy configuration with graceful fallback
 * Returns proxy config if available, otherwise logs warning and returns null
 * @returns {Object|null}
 */
export function getProxyConfigWithFallback() {
  try {
    return getProxyConfig();
  } catch (error) {
    console.error('❌ Failed to load proxy config, continuing without proxy:', error.message);
    return null;
  }
}

/**
 * Validate proxy environment variables
 * @returns {Object} Validation result
 */
export function validateProxyConfig() {
  const useProxy = process.env.USE_PROXY === 'true';
  const server = process.env.PROXY_SERVER;
  const user = process.env.PROXY_USER;
  const pass = process.env.PROXY_PASS;

  const result = {
    enabled: useProxy,
    configured: !!server,
    hasAuth: !!(user && pass),
    valid: false,
    warnings: []
  };

  if (!useProxy) {
    result.valid = true;
    result.warnings.push('Proxy disabled - browser will use direct connection');
    return result;
  }

  if (!server) {
    result.warnings.push('USE_PROXY=true but PROXY_SERVER not set');
    return result;
  }

  // Validate server format
  if (!server.startsWith('http://') && !server.startsWith('https://') && !server.startsWith('socks5://')) {
    result.warnings.push(`Invalid proxy server format: ${server} (should start with http://, https://, or socks5://)`);
    return result;
  }

  // Check auth configuration
  if ((user && !pass) || (!user && pass)) {
    result.warnings.push('Incomplete authentication: both PROXY_USER and PROXY_PASS must be set');
    return result;
  }

  result.valid = true;
  return result;
}

/**
 * Log proxy configuration status
 */
export function logProxyStatus() {
  const validation = validateProxyConfig();
  
  console.log('\n🌐 PROXY CONFIGURATION STATUS:');
  console.log('  Enabled:', validation.enabled);
  console.log('  Configured:', validation.configured);
  console.log('  Authentication:', validation.hasAuth ? 'Yes' : 'No');
  console.log('  Valid:', validation.valid ? '✅' : '❌');
  
  if (validation.warnings.length > 0) {
    console.log('  Warnings:');
    validation.warnings.forEach(w => console.log(`    - ${w}`));
  }
  
  if (validation.valid && validation.configured) {
    console.log('  Server:', process.env.PROXY_SERVER);
    if (validation.hasAuth) {
      console.log('  Username:', process.env.PROXY_USER);
    }
  }
  console.log('');
}
