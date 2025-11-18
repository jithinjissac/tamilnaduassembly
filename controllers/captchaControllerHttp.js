import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const SEC_BASE_URL = process.env.SEC_BASE_URL || 'https://sec.kerala.gov.in';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store active HTTP sessions with cookies and captcha
const activeSessions = new Map();
const MAX_ACTIVE_SESSIONS = 30;

// Clean up old sessions periodically
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of activeSessions.entries()) {
        if (now - session.timestamp > 300000) { // 5 minutes
            activeSessions.delete(id);
            // Delete old captcha file
            const oldCaptchaPath = path.join(__dirname, '..', 'public', 'captcha-cache', `captcha-${id}.png`);
            if (fs.existsSync(oldCaptchaPath)) {
                fs.unlinkSync(oldCaptchaPath);
            }
        }
    }
}, 60000);

/**
 * GET /api/initCaptchaSessionHttp
 * Uses direct HTTP requests instead of browser automation
 * Much faster and lighter on resources
 */
router.get('/initCaptchaSessionHttp', async (req, res) => {
    try {
        console.log('[CAPTCHA-HTTP] Initializing captcha session via HTTP...');
        
        const sessionId = Date.now().toString();
        
        // Create axios instance with cookie jar
        const axiosInstance = axios.create({
            baseURL: SEC_BASE_URL,
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        // Step 1: Load the main page to get cookies and CSRF tokens
        console.log('[CAPTCHA-HTTP] Loading voter list page...');
        const pageResponse = await axiosInstance.get('/public/voters/list', {
            headers: {
                'Cookie': 'set_locale=ml; device_view=full'
            }
        });

        // Extract cookies from response
        const cookies = pageResponse.headers['set-cookie'] || [];
        const cookieString = cookies.map(cookie => cookie.split(';')[0]).join('; ') + '; set_locale=ml; device_view=full';
        
        console.log('[CAPTCHA-HTTP] Page loaded, parsing HTML...');
        
        // Step 2: Parse HTML to find captcha image URL and form tokens
        const $ = cheerio.load(pageResponse.data);
        
        // Find captcha image
        let captchaImageUrl = null;
        const captchaSelectors = [
            'img[src*="captcha"]',
            'img[alt*="captcha" i]',
            '#view_voters_list_captcha_image',
            '.captcha-image'
        ];
        
        for (const selector of captchaSelectors) {
            const imgSrc = $(selector).attr('src');
            if (imgSrc) {
                captchaImageUrl = imgSrc;
                console.log(`[CAPTCHA-HTTP] Found captcha image: ${selector}`);
                break;
            }
        }
        
        if (!captchaImageUrl) {
            throw new Error('Captcha image not found in page HTML');
        }
        
        // Make captcha URL absolute if it's relative
        if (captchaImageUrl.startsWith('/')) {
            captchaImageUrl = SEC_BASE_URL + captchaImageUrl;
        }
        
        console.log('[CAPTCHA-HTTP] Downloading captcha image...');
        
        // Step 3: Download the captcha image
        const captchaResponse = await axiosInstance.get(captchaImageUrl, {
            responseType: 'arraybuffer',
            headers: {
                'Cookie': cookieString,
                'Referer': `${SEC_BASE_URL}/public/voters/list`
            }
        });
        
        // Update cookies if new ones were set
        const newCookies = captchaResponse.headers['set-cookie'] || [];
        if (newCookies.length > 0) {
            const updatedCookies = newCookies.map(cookie => cookie.split(';')[0]).join('; ') + '; ' + cookieString;
            console.log('[CAPTCHA-HTTP] Updated session cookies');
        }
        
        // Step 4: Save captcha image
        const captchaDir = path.join(__dirname, '..', 'public', 'captcha-cache');
        if (!fs.existsSync(captchaDir)) {
            fs.mkdirSync(captchaDir, { recursive: true });
        }
        
        const captchaPath = path.join(captchaDir, `captcha-${sessionId}.png`);
        fs.writeFileSync(captchaPath, captchaResponse.data);
        console.log(`[CAPTCHA-HTTP] Captcha saved: captcha-${sessionId}.png`);
        
        // Step 5: Extract CSRF token and other form data
        const csrfToken = $('input[name="authenticity_token"]').val() || 
                         $('meta[name="csrf-token"]').attr('content') ||
                         '';
        
        // Store session data
        activeSessions.set(sessionId, {
            cookies: cookieString,
            csrfToken: csrfToken,
            timestamp: Date.now(),
            captchaUrl: captchaImageUrl
        });
        
        console.log('[CAPTCHA-HTTP] Session initialized successfully');
        
        res.json({
            status: 'success',
            sessionId,
            captchaUrl: `/captcha-cache/captcha-${sessionId}.png`,
            message: 'Captcha session initialized via HTTP (fast method)',
            method: 'http'
        });
        
    } catch (error) {
        console.error('[CAPTCHA-HTTP] Error:', error.message);
        
        let errorMessage = 'Failed to load captcha via HTTP method';
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            errorMessage = 'Cannot connect to Kerala SEC website. Please try again later.';
        } else if (error.response?.status === 503) {
            errorMessage = 'Kerala SEC website is temporarily unavailable. Please try again in a few minutes.';
        }
        
        res.status(503).json({
            status: 'error',
            message: errorMessage,
            technicalError: error.message,
            hint: 'Try refreshing the page or use the browser-based method'
        });
    }
});

/**
 * POST /api/submitWithCaptchaHttp
 * Submit form using HTTP session
 */
router.post('/submitWithCaptchaHttp', async (req, res) => {
    try {
        const { sessionId, captcha, district, localBody, ward, pollingStation } = req.body;
        
        console.log('[CAPTCHA-HTTP] Submitting form with HTTP method...');
        console.log('[CAPTCHA-HTTP] Session ID:', sessionId);
        
        const session = activeSessions.get(sessionId);
        if (!session) {
            return res.status(400).json({
                status: 'error',
                message: 'Session expired or invalid. Please reload captcha.'
            });
        }
        
        // Create axios instance with session cookies
        const axiosInstance = axios.create({
            baseURL: SEC_BASE_URL,
            timeout: 45000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cookie': session.cookies,
                'Referer': `${SEC_BASE_URL}/public/voters/list`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        // Build form data
        const formData = new URLSearchParams();
        formData.append('authenticity_token', session.csrfToken);
        formData.append('view_voters_list[district_id]', district);
        formData.append('view_voters_list[local_body_id]', localBody);
        formData.append('view_voters_list[ward_id]', ward);
        formData.append('view_voters_list[polling_station_id]', pollingStation);
        formData.append('view_voters_list[captcha]', captcha);
        formData.append('commit', 'View');
        
        console.log('[CAPTCHA-HTTP] Submitting to SEC website...');
        
        // Submit form
        const response = await axiosInstance.post('/public/voters/list', formData.toString());
        
        console.log('[CAPTCHA-HTTP] Form submitted, parsing response...');
        
        // Clean up session
        activeSessions.delete(sessionId);
        
        // Return HTML response for parsing
        res.json({
            status: 'success',
            html: response.data,
            message: 'Form submitted successfully via HTTP'
        });
        
    } catch (error) {
        console.error('[CAPTCHA-HTTP] Submission error:', error.message);
        
        res.status(500).json({
            status: 'error',
            message: 'Failed to submit form',
            error: error.message
        });
    }
});

export default router;
