import User from '../models/User.js';

export const isAdmin = async (req, res, next) => {
    try {
        const userId = req.userId; // Set by auth middleware

        if (!userId) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        if (user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Access denied. Admin privileges required.'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Admin middleware error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Authorization failed',
            error: error.message
        });
    }
};
