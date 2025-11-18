import express from 'express';
import { browserPool } from '../utils/browserPool.js';
import { sessionManager } from '../utils/sessionManager.js';
import { getAllQueueStats } from '../utils/requestQueue.js';

const router = express.Router();

/**
 * GET /api/system/stats
 * Get system statistics for monitoring
 * - Browser pool status
 * - Active sessions
 * - Request queue status
 */
router.get('/stats', (req, res) => {
  try {
    const stats = {
      browserPool: browserPool.getStats(),
      sessions: sessionManager.getStats(),
      queues: getAllQueueStats(),
      timestamp: new Date().toISOString()
    };

    res.json({
      status: 'success',
      stats
    });
  } catch (error) {
    console.error('Error getting system stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get system stats',
      error: error.message
    });
  }
});

/**
 * GET /api/system/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  try {
    const browserStats = browserPool.getStats();
    const sessionStats = sessionManager.getStats();
    const queueStats = getAllQueueStats();

    const healthy = browserStats.connectedBrowsers > 0;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'unhealthy',
      browsers: `${browserStats.connectedBrowsers}/${browserStats.totalBrowsers}`,
      sessions: sessionStats.active,
      queues: {
        captcha: queueStats.captcha.running,
        pdf: queueStats.pdf.running,
        slip: queueStats.slip.running
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/system/captcha-timings
 * Get detailed captcha session timing information
 * Shows how long SEC website takes to load
 */
router.get('/captcha-timings', (req, res) => {
  try {
    const sessions = sessionManager.getAllSessions();
    
    const captchaSessions = sessions
      .filter(s => s.metadata?.createdFor === 'captcha')
      .map(s => ({
        sessionId: s.sessionId,
        userId: s.metadata?.userId || 'anonymous',
        createdAt: s.createdAt,
        age: Math.floor((Date.now() - s.createdAt) / 1000) + 's',
        timings: s.metadata?.timings || null
      }));

    // Calculate averages if we have timing data
    const timingsData = captchaSessions
      .filter(s => s.timings)
      .map(s => s.timings);

    let averages = null;
    if (timingsData.length > 0) {
      averages = {
        total: Math.round(timingsData.reduce((sum, t) => sum + t.total, 0) / timingsData.length),
        context: Math.round(timingsData.reduce((sum, t) => sum + (t.context || 0), 0) / timingsData.length),
        pageLoad: Math.round(timingsData.reduce((sum, t) => sum + (t.pageLoad || 0), 0) / timingsData.length),
        captchaSearch: Math.round(timingsData.reduce((sum, t) => sum + (t.captchaSearch || 0), 0) / timingsData.length),
        screenshot: Math.round(timingsData.reduce((sum, t) => sum + (t.screenshot || 0), 0) / timingsData.length),
        sampleSize: timingsData.length
      };
    }

    res.json({
      status: 'success',
      summary: {
        activeCaptchaSessions: captchaSessions.length,
        averageTimings: averages
      },
      sessions: captchaSessions,
      note: 'Timings in milliseconds. Page load shows how long SEC website takes to respond.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting captcha timings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get captcha timings',
      error: error.message
    });
  }
});

export default router;
