import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dropdownRoutes from './controllers/dropdownController.js';
import voterRoutes from './controllers/voterController.js';
import captchaRoutes from './controllers/captchaController.js';
import { requestLogger, logger } from './utils/logger.js';

// ES Module imports for new modules
import connectDB from './config/database.js';
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payment.js';
import slipRoutes from './routes/slips.js';
import systemRoutes from './routes/system.js';
import { closeBrowser } from './controllers/slipController.js';
import { cleanupExpiredPDFs } from './utils/pdfGenerator.js';

// Initialize environment variables
dotenv.config();

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to database
connectDB();

// Log browser automation setup
console.log('\n🎭 Browser Automation Setup:');
try {
  const { execSync } = await import('child_process');
  
  // Check Playwright
  try {
    const playwrightVersion = execSync('npx playwright --version', { encoding: 'utf8' }).trim();
    console.log(`  ✅ Playwright: ${playwrightVersion}`);
  } catch (e) {
    console.log('  ⚠️ Playwright: Not installed or not in PATH');
  }
  
  // Check Puppeteer
  try {
    const puppeteer = await import('puppeteer');
    console.log(`  ✅ Puppeteer: v${puppeteer.default._launcher?._preferredRevision || 'installed'}`);
  } catch (e) {
    console.log('  ⚠️ Puppeteer: Not available');
  }
  
  // Check Chromium browser
  try {
    const browserCheck = execSync('which chromium || which chromium-browser || which google-chrome || echo "checking..."', { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    if (browserCheck && browserCheck !== 'checking...') {
      console.log(`  ✅ Chromium browser: Found at ${browserCheck}`);
    } else {
      console.log('  📦 Chromium browser: Using Playwright bundled version');
    }
  } catch (e) {
    console.log('  📦 Chromium browser: Using Playwright bundled version');
  }
  
  console.log('  🌐 Proxy configured:', process.env.USE_PROXY === 'true' ? process.env.PROXY_SERVER : 'disabled');
} catch (error) {
  console.log('  ⚠️ Could not check browser automation tools');
}
console.log('');

// Ensure required directories exist on startup (important for Railway)
const requiredDirs = [
  path.join(__dirname, 'public', 'captcha-cache'),
  path.join(__dirname, 'public', 'debug-screenshots'),
  path.join(__dirname, 'public', 'temp-pdfs')
];

requiredDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${path.relative(__dirname, dir)}`);
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Handle client request aborts gracefully
app.use((req, res, next) => {
  req.on('aborted', () => {
    logger.info(`Client aborted request: ${req.method} ${req.path}`);
  });
  next();
});

// Request logging middleware (throttled based on LOG_LEVEL and REQUEST_LOG_INTERVAL)
app.use(requestLogger);

// Serve static files (frontend) with cache control
// Use protected frontend if available, otherwise fallback to original
const frontendDir = fs.existsSync(path.join(__dirname, 'frontend-protected')) && process.env.USE_PROTECTED === 'true'
    ? 'frontend-protected'
    : 'frontend';

console.log(`📁 Serving frontend from: ${frontendDir}`);

app.use(express.static(path.join(__dirname, frontendDir), {
    setHeaders: (res, filePath) => {
        // Disable caching for all files to ensure users always get latest version
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        // Add development-friendly CSP for HTML files
        if (filePath.endsWith('.html')) {
            // Add development-friendly CSP for DevTools and external resources
            if (process.env.NODE_ENV !== 'production') {
                res.setHeader('Content-Security-Policy', 
                    "default-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
                    
                    // Allow connections to external services and blob URLs
                    "connect-src 'self' ws: wss: http: https: blob: data: *.tawk.to *.google-analytics.com *.googletagmanager.com *.cashfree.com *.razorpay.com; " +
                    
                    // Allow scripts from payment gateways and external services
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: " +
                    "https://www.googletagmanager.com " +
                    "https://embed.tawk.to " +
                    "https://cdnjs.cloudflare.com " +
                    "https://cdn.jsdelivr.net " +
                    "https://unpkg.com " +
                    "https://sdk.cashfree.com " +
                    "https://checkout.razorpay.com " +
                    "https://static.cloudflareinsights.com; " +
                    
                    // Allow stylesheets from external services
                    "style-src 'self' 'unsafe-inline' " +
                    "https://fonts.googleapis.com " +
                    "https://cdnjs.cloudflare.com " +
                    "https://embed.tawk.to; " +
                    
                    // Allow fonts from external sources and blob URLs
                    "font-src 'self' blob: data: " +
                    "https://fonts.gstatic.com " +
                    "https://cdnjs.cloudflare.com " +
                    "https://embed.tawk.to; " +
                    
                    // Allow images from any source
                    "img-src 'self' data: blob: https: http:; " +
                    
                    // Allow frames/iframes including blob URLs for PDF viewer
                    "frame-src 'self' blob: data: https:; " +
                    
                    // Allow web workers for PDF.js
                    "worker-src 'self' blob: data:;"
                );
            }
        }
    }
}));

// Serve SEO files from the active frontend directory
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(__dirname, frontendDir, 'robots.txt'));
});

app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml');
    res.sendFile(path.join(__dirname, frontendDir, 'sitemap.xml'));
});

// Serve captcha cache directory - Allow public access without authentication
// Add logging middleware to debug captcha access
app.use('/captcha-cache', (req, res, next) => {
  console.log(`[CAPTCHA ACCESS] Request: ${req.path} from ${req.ip}`);
  
  // CORS headers - allow from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Completely disable caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  next();
});

app.use('/captcha-cache', express.static(path.join(__dirname, 'public', 'captcha-cache'), {
  maxAge: 0,
  etag: false,
  lastModified: false
}));

// Serve debug screenshots directory
app.use('/debug-screenshots', express.static(path.join(__dirname, 'public', 'debug-screenshots')));

// REMOVED: temp-pdfs is now protected through API routes only
// Access PDFs through /api/slips/preview-pdf/:filename with authentication

// API Routes - Authentication & SaaS
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/slips', slipRoutes);

// Admin Routes
import adminRoutes from './routes/admin.js';
app.use('/api/admin', adminRoutes);

// Activity Tracking Routes
import activityRoutes from './routes/activity.js';
import { cleanupInactiveSessions } from './middleware/activityTracker.js';
app.use('/api/activity', activityRoutes);

// Media Routes (Admin only)
import mediaRoutes from './routes/media.js';
app.use('/api/admin/media', mediaRoutes);

// Settings Routes (Admin only)
import settingsRoutes from './routes/settings.js';
// Settings API routes
app.use('/api/settings', settingsRoutes);

// System monitoring routes
app.use('/api/system', systemRoutes);

// Public Symbols Routes (for users)
import symbolRoutes from './routes/symbols.js';
app.use('/api', symbolRoutes);

// Serve symbols directory with fallback for missing images
app.use('/symbols', express.static(path.join(__dirname, 'public', 'symbols')));

// Fallback route for missing symbol images - serve a placeholder
app.get('/symbols/*', (req, res) => {
    const requestedSymbol = req.params[0];
    logger.warn(`Symbol image not found: ${requestedSymbol}`);
    console.log(`⚠️ Missing symbol: /symbols/${requestedSymbol}`);
    
    const placeholderPath = path.join(__dirname, 'public', 'placeholder-symbol.png');
    if (fs.existsSync(placeholderPath)) {
        res.sendFile(placeholderPath);
    } else {
        // Create a simple SVG placeholder on-the-fly
        const svg = `
            <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
                <rect width="100" height="100" fill="#f0f0f0"/>
                <text x="50" y="50" text-anchor="middle" dominant-baseline="middle" 
                      font-family="Arial" font-size="12" fill="#666">
                    Symbol Missing
                </text>
            </svg>
        `;
        res.type('image/svg+xml').send(svg);
    }
});

// Serve lottie animations directory
app.use('/lottie', express.static(path.join(__dirname, 'public', 'lottie')));

// Serve voter slip examples
app.use('/voter-slip-examples', express.static(path.join(__dirname, 'voter-slip-examples')));

// Serve Razorpay verification page
app.get('/razorpay-verification.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'razorpay-verification.html'));
});

// API Routes - Existing voter extraction
app.use('/api', dropdownRoutes);
app.use('/api', voterRoutes);
app.use('/api', captchaRoutes);

// Playwright Stations Route (Malayalam polling stations)
import playwrightStationsRoutes from './controllers/playwrightStationsController.js';
app.use('/api', playwrightStationsRoutes);

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Kerala SEC Voter Slip SaaS is running' });
});

// Debug endpoint to check captcha directory status
app.get('/api/debug/captcha-status', (req, res) => {
  try {
    const captchaDir = path.join(__dirname, 'public', 'captcha-cache');
    const exists = fs.existsSync(captchaDir);
    
    let files = [];
    let fileDetails = [];
    let isWritable = false;
    
    if (exists) {
      files = fs.readdirSync(captchaDir);
      
      // Get details of first 5 files
      fileDetails = files.slice(0, 5).map(file => {
        const filePath = path.join(captchaDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      });
      
      // Check if directory is writable
      try {
        fs.accessSync(captchaDir, fs.constants.W_OK);
        isWritable = true;
      } catch (err) {
        isWritable = false;
      }
    }
    
    res.json({
      success: true,
      directory: captchaDir,
      exists,
      writable: isWritable,
      fileCount: files.length,
      recentFiles: fileDetails,
      nodeEnv: process.env.NODE_ENV || 'development',
      platform: process.platform,
      cwd: process.cwd()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  // Ignore client-side aborted requests (user navigated away or canceled)
  if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET' || err.type === 'request.aborted') {
    logger.info(`Client aborted request: ${req.method} ${req.path}`);
    return; // Don't send response, connection is already closed
  }

  // Log other errors normally
  console.error(err.stack);
  
  // Only send response if connection is still open
  if (!res.headersSent) {
    res.status(500).json({ 
      status: 'error', 
      message: err.message || 'Internal server error' 
    });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Log level: ${process.env.LOG_LEVEL || 'info'}`);
  logger.info(`Request logging: Every ${process.env.REQUEST_LOG_INTERVAL || 10}th request`);
  
  // Cleanup expired PDFs on startup
  logger.info('Running initial PDF cleanup...');
  cleanupExpiredPDFs();
  
  // Periodic cleanup every 10 minutes
  setInterval(() => {
    cleanupExpiredPDFs();
  }, 10 * 60 * 1000);
  
  // Cleanup inactive sessions every 5 minutes
  setInterval(() => {
    cleanupInactiveSessions();
  }, 5 * 60 * 1000);
  
  // Run initial session cleanup
  cleanupInactiveSessions();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  await closeBrowser();
  process.exit(0);
});

// Auto-restart on uncaught exceptions (browser crashes, etc.)
process.on('uncaughtException', async (error) => {
  // Ignore client-side aborted requests (BadRequestError: request aborted)
  if (error.type === 'request.aborted' || error.message?.includes('request aborted')) {
    return; // Silent ignore - this is normal when users navigate away
  }

  logger.error('❌ Uncaught Exception:', error);
  
  // Check if it's a browser-related error
  const isBrowserError = error.message?.toLowerCase().includes('browser') ||
                         error.message?.toLowerCase().includes('playwright') ||
                         error.message?.toLowerCase().includes('puppeteer') ||
                         error.message?.toLowerCase().includes('chromium') ||
                         error.message?.toLowerCase().includes('target closed');
  
  if (isBrowserError) {
    logger.error('🔄 Browser error detected - attempting cleanup and restart...');
    try {
      await closeBrowser();
    } catch (cleanupError) {
      logger.error('Cleanup error:', cleanupError);
    }
    
    // In production (Railway), exit with code 1 to trigger restart
    if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
      logger.info('🔄 Exiting to trigger Railway auto-restart...');
      process.exit(1);
    }
  } else {
    logger.error('Non-browser error - logging but continuing...');
  }
});

// Auto-restart on unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  // Ignore client-side aborted requests
  if (reason?.type === 'request.aborted' || reason?.message?.includes('request aborted')) {
    return; // Silent ignore
  }

  logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Check if it's a browser-related error
  const isBrowserError = reason?.message?.toLowerCase().includes('browser') ||
                         reason?.message?.toLowerCase().includes('playwright') ||
                         reason?.message?.toLowerCase().includes('puppeteer') ||
                         reason?.message?.toLowerCase().includes('chromium') ||
                         reason?.message?.toLowerCase().includes('target closed') ||
                         reason?.message?.toLowerCase().includes('session closed');
  
  if (isBrowserError) {
    logger.error('🔄 Browser error in promise rejection - attempting cleanup and restart...');
    try {
      await closeBrowser();
    } catch (cleanupError) {
      logger.error('Cleanup error:', cleanupError);
    }
    
    // In production (Railway), exit with code 1 to trigger restart
    if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
      logger.info('🔄 Exiting to trigger Railway auto-restart...');
      process.exit(1);
    }
  }
});
