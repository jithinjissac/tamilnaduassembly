import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const auth = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ 
                status: 'error',
                message: 'Access denied. No token provided.' 
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
        
        // Find user
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            return res.status(401).json({ 
                status: 'error',
                message: 'Invalid token. User not found.' 
            });
        }

        // Attach user to request
        req.user = user;
        req.userId = user._id;
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                status: 'error',
                message: 'Invalid token.' 
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                status: 'error',
                message: 'Token expired.' 
            });
        }
        res.status(500).json({ 
            status: 'error',
            message: 'Authentication error.',
            error: error.message 
        });
    }
};

export default auth;
