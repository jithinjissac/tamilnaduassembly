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

export default router;
