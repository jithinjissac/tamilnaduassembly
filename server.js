import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import dropdownRoutes from './controllers/dropdownController.js';
import voterRoutes from './controllers/voterController.js';
import captchaRoutes from './controllers/captchaController.js';

// ES Module imports for new modules
import connectDB from './config/database.js';
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payment.js';
import slipRoutes from './routes/slips.js';
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

// Serve static files (frontend) with cache control
app.use(express.static(path.join(__dirname, 'frontend'), {
    setHeaders: (res, filePath) => {
        // Disable caching for HTML files to ensure users get latest access control fixes
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Serve SEO files
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(__dirname, 'frontend', 'robots.txt'));
});

app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml');
    res.sendFile(path.join(__dirname, 'frontend', 'sitemap.xml'));
});

// Serve captcha cache directory
app.use('/captcha-cache', express.static(path.join(__dirname, 'public', 'captcha-cache')));

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
app.use('/api/activity', activityRoutes);

// Media Routes (Admin only)
import mediaRoutes from './routes/media.js';
app.use('/api/admin/media', mediaRoutes);

// Settings Routes (Admin only)
import settingsRoutes from './routes/settings.js';
app.use('/api/settings', settingsRoutes);

// Public Symbols Routes (for users)
import symbolRoutes from './routes/symbols.js';
app.use('/api', symbolRoutes);

// Serve symbols directory
app.use('/symbols', express.static(path.join(__dirname, 'public', 'symbols')));

// Serve lottie animations directory
app.use('/lottie', express.static(path.join(__dirname, 'public', 'lottie')));

// Serve voter slip examples
app.use('/voter-slip-examples', express.static(path.join(__dirname, 'voter-slip-examples')));

// API Routes - Existing voter extraction
app.use('/api', dropdownRoutes);
app.use('/api', voterRoutes);
app.use('/api', captchaRoutes);

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
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Frontend available at http://localhost:${PORT}`);
  console.log(`💵 Auth API: /api/auth/*`);
  console.log(`📦 Orders API: /api/orders/*`);
  console.log(`💳 Payment API: /api/payment/*`);
  console.log(`📄 Slips API: /api/slips/*`);
  console.log(`⚙️  Settings API: /api/settings/*`);
  
  // Cleanup expired PDFs on startup
  console.log('🧹 Running initial PDF cleanup...');
  cleanupExpiredPDFs();
  
  // Periodic cleanup every 10 minutes
  setInterval(() => {
    cleanupExpiredPDFs();
  }, 10 * 60 * 1000);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await closeBrowser();
  process.exit(0);
});
