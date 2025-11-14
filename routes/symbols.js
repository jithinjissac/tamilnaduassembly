import express from 'express';
import Symbol from '../models/Symbol.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Public route to get active symbols (requires authentication but not admin)
router.get('/symbols', auth, async (req, res) => {
    try {
        const { search, category } = req.query;
        
        let query = { isActive: true }; // Only show active symbols to users
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { nameMalayalam: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (category) {
            query.category = category;
        }

        const symbols = await Symbol.find(query)
            .sort({ displayOrder: 1, createdAt: 1 })
            .select('name nameMalayalam imageUrl category isActive displayOrder');

        res.json({
            status: 'success',
            count: symbols.length,
            symbols
        });
    } catch (error) {
        console.error('Get symbols error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch symbols',
            error: error.message
        });
    }
});

export default router;
