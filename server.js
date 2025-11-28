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

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
        // Disable caching for HTML files to ensure users get latest access control fixes
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            
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

// Serve captcha cache directory
app.use('/captcha-cache', express.static(path.join(__dirname, 'public', 'captcha-cache')));

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

// Serve symbols directory
app.use('/symbols', express.static(path.join(__dirname, 'public', 'symbols')));

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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    status: 'error', 
    message: err.message || 'Internal server error' 
  });
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
