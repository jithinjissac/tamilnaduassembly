import Settings from '../models/Settings.js';

// Cache maintenance mode status to avoid DB queries on every request
let maintenanceModeCache = {
    enabled: false,
    lastChecked: 0,
    cacheDuration: 30000 // 30 seconds
};

export const checkMaintenanceMode = async (req, res, next) => {
    try {
        // Allow access to login, closed page, admin pages, and API endpoints
        const allowedPaths = [
            '/login.html',
            '/closed.html',
            '/admin.html',
            '/api/',
            '/favicon/',
            '/logo-dark.png',
            '/logo.png',
            '/kerala-theme.css'
        ];

        // Check if current path is allowed
        const isAllowedPath = allowedPaths.some(path => req.path.startsWith(path));
        
        if (isAllowedPath) {
            return next();
        }

        // Check cache first
        const now = Date.now();
        let maintenanceEnabled = maintenanceModeCache.enabled;
        
        // Refresh cache if expired
        if (now - maintenanceModeCache.lastChecked > maintenanceModeCache.cacheDuration) {
            try {
                const maintenanceSettings = await Settings.findOne({ category: 'maintenance' })
                    .maxTimeMS(1000) // 1 second timeout
                    .lean(); // Use lean for better performance
                
                maintenanceEnabled = maintenanceSettings?.settings?.enabled || false;
                maintenanceModeCache = {
                    enabled: maintenanceEnabled,
                    lastChecked: now,
                    cacheDuration: 30000
                };
            } catch (dbError) {
                console.error('Maintenance mode DB check error:', dbError.message);
                // On DB error, use cached value and continue
                maintenanceEnabled = maintenanceModeCache.enabled;
            }
        }
        
        if (!maintenanceEnabled) {
            // Maintenance mode is OFF, allow access
            return next();
        }

        // Maintenance mode is ON
        // Check if user is authenticated and is admin
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (token) {
            try {
                const jwt = await import('jsonwebtoken');
                const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
                
                // Allow admin access even in maintenance mode
                if (decoded.role === 'admin') {
                    return next();
                }
            } catch (error) {
                // Invalid token, redirect to closed page
            }
        }

        // For HTML pages, redirect to closed page
        if (req.path.endsWith('.html') || req.path === '/' || !req.path.includes('.')) {
            return res.redirect('/closed.html');
        }

        // For API calls, return 503
        return res.status(503).json({
            status: 'error',
            message: 'Service temporarily unavailable. Please visit https://easyslip.in for more information.',
            maintenanceMode: true
        });

    } catch (error) {
        console.error('Maintenance mode check error:', error);
        // On error, allow access to prevent site from breaking
        next();
    }
};
