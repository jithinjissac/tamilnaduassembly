import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import dropdownRoutes from './controllers/dropdownController.js';
import voterRoutes from './controllers/voterController.js';
import captchaRoutes from './controllers/captchaController.js';

// Initialize environment variables
dotenv.config();

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (frontend)
app.use(express.static(path.join(__dirname, 'frontend')));

// Serve captcha cache directory
app.use('/captcha-cache', express.static(path.join(__dirname, 'public', 'captcha-cache')));

// API Routes
app.use('/api', dropdownRoutes);
app.use('/api', voterRoutes);
app.use('/api', captchaRoutes);

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Kerala SEC Voter API is running' });
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
  console.log(`🔍 API endpoints: /api/getDistricts, /api/getLocalBodies, /api/getWards, /api/getPollingStations, /api/extractVoters`);
});
