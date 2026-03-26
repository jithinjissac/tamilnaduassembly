import express from 'express';
// NEW: Direct API Controllers (faster, more reliable)
import assemblyDropdownController from '../controllers/assemblyDropdownController_v2.js';
import assemblyVoterController from '../controllers/assemblyVoterController_v2.js';
import { generateSlipsWithCandidates } from '../controllers/assemblySlipController.js';
import * as assemblyOrderController from '../controllers/assemblyOrderController.js';
import { getExtractionProgress } from '../controllers/assemblyVoterController_v2.js';
// OLD: Playwright-based controllers (kept for fallback)
// import assemblyDropdownControllerOld from '../controllers/assemblyDropdownController.js';
// import assemblyVoterControllerOld from '../controllers/assemblyVoterController.js';
import { debugConstituencyFetch } from '../utils/debugECIConstituencies.js';
import { monitorECINetworkTraffic, getDiscoveredAPIs } from '../utils/eciNetworkMonitor.js';
import { logger } from '../utils/logger.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Health check
router.get('/health', assemblyVoterController.healthCheck);

// Dropdown endpoints (now using Direct API)
router.get('/getStates', assemblyDropdownController.getStates);
router.post('/getYears', assemblyDropdownController.getYears);
router.post('/getRollTypes', assemblyDropdownController.getRollTypes);
router.post('/getDistricts', assemblyDropdownController.getDistricts);
router.post('/getConstituencies', assemblyDropdownController.getAssemblyConstituencies);
router.post('/getLanguages', assemblyDropdownController.getLanguages);
router.post('/getPollingParts', assemblyDropdownController.getPollingParts);

// Data extraction endpoints (now using Direct API)
router.post('/getCaptcha', assemblyVoterController.getCaptcha);
router.post('/extractVoters', assemblyVoterController.extractVoters);
router.get('/extractionProgress/:progressId', (req, res) => {
    const progress = getExtractionProgress(req.params.progressId);
    if (!progress) {
        return res.json({ status: 'not_found' });
    }
    res.json({ status: 'ok', progress });
});
router.post('/preview/store', assemblyVoterController.storePreviewData);
router.get('/preview/:previewId', assemblyVoterController.getPreviewData);

// NEW: Slip generation with candidates
router.post('/generateSlipsWithCandidates', generateSlipsWithCandidates);

// Assembly Order Management (mirrors local body order flow)
router.post('/orders/create', auth, assemblyOrderController.createOrder);
router.get('/orders', auth, assemblyOrderController.getUserOrders);
router.get('/orders/stats/summary', auth, assemblyOrderController.getOrderStats);
router.get('/orders/:orderId', auth, assemblyOrderController.getOrder);
router.get('/orders/:orderId/download', auth, assemblyOrderController.downloadPDF);
router.patch('/orders/:orderId/complete', auth, assemblyOrderController.completeFreeOrder);

// Debug endpoint - Check constituency discrepancy
router.post('/debugConstituencies', async (req, res) => {
    try {
        const { stateCode, district } = req.body;
        
        if (!stateCode || !district) {
            return res.status(400).json({
                status: 'error',
                message: 'stateCode and district are required'
            });
        }
        
        logger.info(`Debug request for state: ${stateCode}, district: ${district}`);
        
        // This will open browser in non-headless mode for visual inspection
        const constituencies = await debugConstituencyFetch(stateCode, district);
        
        res.json({
            status: 'success',
            stateCode,
            district,
            count: constituencies.length,
            constituencies,
            message: 'Check server console for detailed logs and screenshots'
        });
    } catch (error) {
        logger.error('Debug constituencies error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Network monitoring endpoint - Discover API endpoints
router.post('/monitorNetwork', async (req, res) => {
    try {
        const { stateCode = 'S11' } = req.body;
        
        logger.info(`Network monitoring request for state: ${stateCode}`);
        logger.info('⚠️  This will open a visible browser window for 30 seconds');
        
        // This will open browser and capture all network traffic
        const results = await monitorECINetworkTraffic(stateCode);
        
        res.json({
            status: 'success',
            stateCode,
            requestsCaptured: results.requests.length,
            responsesCaptured: results.responses.length,
            endpoints: Object.keys(results.endpoints),
            message: 'Network traffic captured. Check server console for detailed logs.',
            results: {
                requests: results.requests.map(r => ({
                    url: r.url,
                    method: r.method,
                    hasPayload: !!r.postData
                })),
                responses: results.responses.map(r => ({
                    url: r.url,
                    method: r.method,
                    status: r.status,
                    hasData: !!r.responseData
                }))
            }
        });
    } catch (error) {
        logger.error('Network monitoring error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Get discovered APIs endpoint
router.get('/discoveredAPIs', (req, res) => {
    try {
        const apis = getDiscoveredAPIs();
        
        if (!apis.endpoints || Object.keys(apis.endpoints).length === 0) {
            return res.json({
                status: 'no_data',
                message: 'No APIs discovered yet. Call /monitorNetwork first.',
                endpoints: {}
            });
        }
        
        res.json({
            status: 'success',
            lastDiscovered: apis.lastDiscovered,
            endpointCount: Object.keys(apis.endpoints).length,
            endpoints: Object.keys(apis.endpoints),
            message: 'Use these endpoints for direct API calls'
        });
    } catch (error) {
        logger.error('Get discovered APIs error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

export default router;
