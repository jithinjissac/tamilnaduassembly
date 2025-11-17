import express from 'express';
import UserActivity from '../models/UserActivity.js';
import UserSession from '../models/UserSession.js';
import auth from '../middleware/auth.js';
import { trackSession, endSession } from '../middleware/activityTracker.js';

const router = express.Router();

// Track multiple activities (batch endpoint)
router.post('/track', auth, trackSession, async (req, res) => {
    try {
        const { activities } = req.body;

        if (!activities || !Array.isArray(activities)) {
            return res.status(400).json({
                status: 'error',
                message: 'Activities array is required'
            });
        }

        // Add userId to each activity
        const activitiesWithUser = activities.map(activity => ({
            ...activity,
            userId: req.user._id,
            sessionId: activity.sessionId || req.sessionID || req.headers['x-session-id']
        }));

        // Bulk insert activities
        await UserActivity.insertMany(activitiesWithUser, { ordered: false });

        // Update session activity count
        if (req.userSession) {
            req.userSession.activityCount += activities.length;
            req.userSession.lastActivity = new Date();
            await req.userSession.save();
        }

        res.json({
            status: 'success',
            message: `${activities.length} activities tracked`
        });

    } catch (error) {
        console.error('Activity tracking error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to track activities'
        });
    }
});

// Track single activity
router.post('/track-single', auth, trackSession, async (req, res) => {
    try {
        const { action, details, page, metadata } = req.body;

        if (!action) {
            return res.status(400).json({
                status: 'error',
                message: 'Action is required'
            });
        }

        const activity = new UserActivity({
            userId: req.user._id,
            sessionId: req.sessionID || req.headers['x-session-id'],
            action,
            details: details || {},
            page: page || {
                url: req.headers.referer || '',
                title: '',
                referrer: ''
            },
            metadata: metadata || {}
        });

        await activity.save();

        // Update session
        if (req.userSession) {
            req.userSession.activityCount += 1;
            req.userSession.lastActivity = new Date();
            await req.userSession.save();
        }

        res.json({
            status: 'success',
            message: 'Activity tracked',
            activityId: activity._id
        });

    } catch (error) {
        console.error('Activity tracking error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to track activity'
        });
    }
});

// End session
router.post('/end-session', async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (sessionId) {
            await endSession(sessionId);
        }

        res.json({
            status: 'success',
            message: 'Session ended'
        });

    } catch (error) {
        console.error('End session error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to end session'
        });
    }
});

export default router;
