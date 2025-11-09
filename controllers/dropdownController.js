import express from 'express';
import axios from 'axios';

const router = express.Router();

const SEC_BASE_URL = process.env.SEC_BASE_URL || 'https://sec.kerala.gov.in';

// Simple in-memory cache for polling stations per ward
const POLLING_STATION_CACHE_TTL_MS = parseInt(process.env.POLLING_STATION_CACHE_TTL_MS || '300000', 10); // 5 minutes default
const POLLING_STATION_CACHE_MAX = parseInt(process.env.POLLING_STATION_CACHE_MAX || '500', 10);

const pollingStationCache = new Map(); // ward_id -> { data, expiresAt, lastUsed }
const pendingWardRequests = new Map(); // ward_id -> Promise

function getFromPollingStationCache(wardId) {
  const entry = pollingStationCache.get(wardId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    pollingStationCache.delete(wardId);
    return null;
  }
  entry.lastUsed = Date.now();
  return entry.data;
}

function setPollingStationCache(wardId, data) {
  if (pollingStationCache.size >= POLLING_STATION_CACHE_MAX) {
    // naive LRU: remove oldest lastUsed
    let oldestKey = null;
    let oldestVal = null;
    for (const [k, v] of pollingStationCache.entries()) {
      if (!oldestVal || v.lastUsed < oldestVal.lastUsed) {
        oldestKey = k;
        oldestVal = v;
      }
    }
    if (oldestKey) pollingStationCache.delete(oldestKey);
  }
  pollingStationCache.set(wardId, {
    data,
    expiresAt: Date.now() + POLLING_STATION_CACHE_TTL_MS,
    lastUsed: Date.now(),
  });
}

// District data (static - matches SEC Kerala exactly)
const DISTRICTS = [
  { value: '1', text: 'Kasaragod / കാസറഗോഡ്' },
  { value: '2', text: 'Kannur / കണ്ണൂര്‍' },
  { value: '3', text: 'Wayanad / വയനാട്' },
  { value: '4', text: 'Kozhikode / കോഴിക്കോട്' },
  { value: '5', text: 'Malappuram / മലപ്പുറം' },
  { value: '6', text: 'Palakkad / പാലക്കാട്' },
  { value: '7', text: 'Thrissur / തൃശ്ശൂര്‍' },
  { value: '8', text: 'Ernakulam / എറണാകുളം' },
  { value: '9', text: 'Idukki / ഇടുക്കി' },
  { value: '10', text: 'Kottayam / കോട്ടയം' },
  { value: '11', text: 'Alappuzha / ആലപ്പുഴ' },
  { value: '12', text: 'Pathanamthitta / പത്തനംതിട്ട' },
  { value: '13', text: 'Kollam / കൊല്ലം' },
  { value: '14', text: 'Thiruvananthapuram / തിരുവനന്തപുരം' }
];

/**
 * GET /api/getDistricts
 * Returns list of all districts in Kerala
 */
router.get('/getDistricts', (req, res) => {
  try {
    res.json({ 
      status: 'success',
      districts: DISTRICTS 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

/**
 * POST /api/getLocalBodies
 * Returns local bodies for a given district
 * Body: { district_id: "3" }
 */
router.post('/getLocalBodies', async (req, res) => {
  try {
    const { district_id } = req.body;

    if (!district_id) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'district_id is required' 
      });
    }

    // SEC Kerala expects form-urlencoded with parameter name "objid"
    const formData = new URLSearchParams();
    formData.append('objid', district_id);

    const response = await axios.post(
      `${SEC_BASE_URL}/public/getalllbcmp/byd`,
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          'Referer': `${SEC_BASE_URL}/public/voters/list`,
          'Cookie': 'set_locale=ml; device_view=full'
        }
      }
    );

    res.json({ 
      status: 'success',
      local_bodies: response.data.ops1 || []
    });
  } catch (error) {
    console.error('Error fetching local bodies:', error.message);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch local bodies',
      error: error.message 
    });
  }
});

/**
 * POST /api/getWards
 * Returns wards for a given local body
 * Body: { local_body_id: "pnNXD5bL4J" }
 */
router.post('/getWards', async (req, res) => {
  try {
    const { local_body_id } = req.body;

    if (!local_body_id) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'local_body_id is required' 
      });
    }

    // SEC Kerala expects form-urlencoded with parameter name "objid"
    const formData = new URLSearchParams();
    formData.append('objid', local_body_id);

    const response = await axios.post(
      `${SEC_BASE_URL}/public/getwardSbox`,
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          'Referer': `${SEC_BASE_URL}/public/voters/list`,
          'Cookie': 'set_locale=ml; device_view=full'
        }
      }
    );

    res.json({ 
      status: 'success',
      wards: response.data.ops1 || []
    });
  } catch (error) {
    console.error('Error fetching wards:', error.message);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch wards',
      error: error.message 
    });
  }
});

/**
 * POST /api/getPollingStations
 * Returns polling stations for a given ward
 * Body: { ward_id: "MOZ4EKJBAD" }
 */
router.post('/getPollingStations', async (req, res) => {
  let wardIdForFinally;
  try {
    const { ward_id, force_refresh } = req.body;
    wardIdForFinally = ward_id;

    if (!ward_id) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'ward_id is required' 
      });
    }

    const allowCache = !force_refresh;

    if (allowCache) {
      const cached = getFromPollingStationCache(ward_id);
      if (cached) {
        console.log(`[PollingStations] cache HIT for ward ${ward_id} (items=${cached.length})`);
        return res.json({ 
          status: 'success',
          polling_stations: cached,
          cached: true
        });
      }
    }

    // If another request is already fetching this ward, dedupe
    if (pendingWardRequests.has(ward_id)) {
      console.log(`[PollingStations] pending fetch dedup for ward ${ward_id}`);
      const data = await pendingWardRequests.get(ward_id);
      return res.json({
        status: 'success',
        polling_stations: data,
        cached: true,
        deduped: true
      });
    }

    // SEC Kerala expects form-urlencoded with parameter name "objid"
    const formData = new URLSearchParams();
    formData.append('objid', ward_id);

    const fetchPromise = (async () => {
      const response = await axios.post(
        `${SEC_BASE_URL}/public/getps/byward`,
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
            'Referer': `${SEC_BASE_URL}/public/voters/list`,
            'Cookie': 'set_locale=ml; device_view=full'
          }
        }
      );
      return response?.data?.ops1 || [];
    })();

    pendingWardRequests.set(ward_id, fetchPromise);

    const stations = await fetchPromise;
    console.log(`[PollingStations] cache MISS for ward ${ward_id} (fetched items=${stations.length})`);
    setPollingStationCache(ward_id, stations);

    res.json({ 
      status: 'success',
      polling_stations: stations,
      cached: false
    });
  } catch (error) {
    console.error('Error fetching polling stations:', error.message);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch polling stations',
      error: error.message 
    });
  } finally {
    if (wardIdForFinally) pendingWardRequests.delete(wardIdForFinally);
  }
});

/**
 * GET /api/getCaptcha
 * Proxies the captcha image from SEC Kerala to avoid CORS issues
 * Note: We need to establish a session first by visiting the voters list page
 */
router.get('/getCaptcha', async (req, res) => {
  try {
    // First, create a session by visiting the voters list page
    const sessionResponse = await axios.get(`${SEC_BASE_URL}/public/voters/list`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
      }
    });

    // Extract session cookies
    const cookies = sessionResponse.headers['set-cookie'];
    let sessionCookie = 'set_locale=ml; device_view=full';
    
    if (cookies) {
      // Extract PHPSESSID from cookies
      const phpSessId = cookies.find(c => c.startsWith('PHPSESSID='));
      if (phpSessId) {
        sessionCookie += `; ${phpSessId.split(';')[0]}`;
      }
    }

    // Now fetch the captcha with the session cookie
    const timestamp = Date.now();
    const captchaUrl = `${SEC_BASE_URL}/generate-captcha/_captcha_captcha?n=${timestamp}`;

    const response = await axios.get(captchaUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
        'Referer': `${SEC_BASE_URL}/public/voters/list`,
        'Cookie': sessionCookie
      }
    });

    // Set proper headers for image
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(Buffer.from(response.data, 'binary'));
  } catch (error) {
    console.error('Error fetching captcha:', error.message);
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to fetch captcha',
      error: error.message 
    });
  }
});

export default router;
