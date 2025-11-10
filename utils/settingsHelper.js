import Settings from '../models/Settings.js';

// Cache for settings to avoid frequent DB calls
const settingsCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache

// Get settings with caching
export const getAppSettings = async (category) => {
    const now = Date.now();
    const cached = settingsCache.get(category);
    
    // Return cached if valid
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
        return cached.data;
    }
    
    // Fetch from DB
    const settings = await Settings.getSettings(category);
    const settingsObj = Object.fromEntries(settings);
    
    // Update cache
    settingsCache.set(category, {
        data: settingsObj,
        timestamp: now
    });
    
    return settingsObj;
};

// Clear settings cache (call after updating settings)
export const clearSettingsCache = (category = null) => {
    if (category) {
        settingsCache.delete(category);
        console.log(`🗑️ Cleared settings cache for: ${category}`);
    } else {
        settingsCache.clear();
        console.log('🗑️ Cleared all settings cache');
    }
};

// Helper functions for specific settings
export const getEmailSettings = async () => {
    return await getAppSettings('email');
};

// Get a specific setting value
export const getSetting = async (category, key) => {
    const settings = await getAppSettings(category);
    return settings[key];
};
