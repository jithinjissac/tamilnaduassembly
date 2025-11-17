import UserActivity from '../models/UserActivity.js';
import UserSession from '../models/UserSession.js';
import { UAParser } from 'ua-parser-js';

// Track user activity
export const trackActivity = async (req, action, details = {}) => {
    try {
        if (!req.user || !req.user._id) return;

        const activity = new UserActivity({
            userId: req.user._id,
            sessionId: req.sessionID || req.headers['x-session-id'] || 'unknown',
            action,
            details,
            page: {
                url: req.originalUrl || req.url,
                title: details.pageTitle || '',
                referrer: req.headers.referer || req.headers.referrer || ''
            },
            timestamp: new Date(),
            metadata: {
                success: details.success !== false,
                errorMessage: details.error || '',
                duration: details.duration || 0
            }
        });

        await activity.save();

        // Update session last activity
        if (req.sessionID) {
            await UserSession.findOneAndUpdate(
                { sessionId: req.sessionID },
                { 
                    lastActivity: new Date(),
                    $inc: { activityCount: 1 }
                }
            );
        }
    } catch (error) {
        console.error('❌ Activity tracking error:', error.message);
        // Don't throw error - tracking shouldn't break the app
    }
};

// Middleware to automatically track page views
export const trackPageView = async (req, res, next) => {
    if (req.user && req.user._id) {
        await trackActivity(req, 'page_view', {
            pageTitle: req.headers['x-page-title'] || '',
            url: req.originalUrl
        });
    }
    next();
};

// Parse device information from user agent
export const parseDeviceInfo = (userAgent) => {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    return {
        userAgent,
        browser: {
            name: result.browser.name || 'Unknown',
            version: result.browser.version || ''
        },
        os: {
            name: result.os.name || 'Unknown',
            version: result.os.version || ''
        },
        device: {
            deviceType: result.device.type || 'Desktop',
            vendor: result.device.vendor || '',
            model: result.device.model || ''
        }
    };
};

// Get location from IP (using ipapi.co free service)
export const getLocationFromIP = async (ip) => {
    try {
        // Skip private/local IPs
        if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
            return {
                ip,
                country: 'Local',
                region: 'Local',
                city: 'Local',
                timezone: 'Asia/Kolkata'
            };
        }

        const response = await fetch(`https://ipapi.co/${ip}/json/`);
        if (!response.ok) throw new Error('IP lookup failed');
        
        const data = await response.json();
        
        return {
            ip,
            country: data.country_name || '',
            region: data.region || '',
            city: data.city || '',
            latitude: data.latitude || null,
            longitude: data.longitude || null,
            timezone: data.timezone || '',
            isp: data.org || ''
        };
    } catch (error) {
        console.error('Location lookup error:', error.message);
        return {
            ip,
            country: 'Unknown',
            region: 'Unknown',
            city: 'Unknown',
            timezone: 'Asia/Kolkata'
        };
    }
};

// Create or update user session
export const trackSession = async (req, res, next) => {
    try {
        if (!req.user || !req.user._id) {
            return next();
        }

        const sessionId = req.sessionID || req.headers['x-session-id'];
        if (!sessionId) {
            return next();
        }

        // Check if session already exists
        let session = await UserSession.findOne({ sessionId, isActive: true });

        if (!session) {
            // Get device info
            const deviceInfo = parseDeviceInfo(req.headers['user-agent'] || '');
            
            // Get client IP
            const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
                       req.headers['x-real-ip'] || 
                       req.connection.remoteAddress || 
                       req.socket.remoteAddress || '';

            // Get location (async, don't wait for it)
            const location = await getLocationFromIP(ip);

            // Get screen info from headers (sent from frontend)
            const screen = {
                width: parseInt(req.headers['x-screen-width']) || null,
                height: parseInt(req.headers['x-screen-height']) || null
            };

            session = new UserSession({
                userId: req.user._id,
                sessionId,
                device: { ...deviceInfo, screen },
                location,
                startTime: new Date(),
                lastActivity: new Date(),
                isActive: true
            });

            await session.save();
            console.log(`✅ New session created for user ${req.user.email}`);
        } else {
            // Update last activity
            session.lastActivity = new Date();
            await session.save();
        }

        req.userSession = session;
        next();
    } catch (error) {
        console.error('❌ Session tracking error:', error.message);
        next(); // Continue even if tracking fails
    }
};

// End session
export const endSession = async (sessionId) => {
    try {
        await UserSession.findOneAndUpdate(
            { sessionId, isActive: true },
            { 
                endTime: new Date(),
                isActive: false
            }
        );
    } catch (error) {
        console.error('Error ending session:', error.message);
    }
};

export default {
    trackActivity,
    trackPageView,
    trackSession,
    endSession,
    parseDeviceInfo,
    getLocationFromIP
};
