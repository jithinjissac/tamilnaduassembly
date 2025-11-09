import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';

// Register new user
export const register = [
    // Validation
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Valid Indian phone number is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    
    async (req, res) => {
        try {
            // Check validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    status: 'error',
                    message: 'Validation failed',
                    errors: errors.array() 
                });
            }

            const { name, email, phone, password } = req.body;

            // Check if user already exists
            const existingUser = await User.findOne({ 
                $or: [{ email }, { phone }] 
            });

            if (existingUser) {
                return res.status(400).json({ 
                    status: 'error',
                    message: existingUser.email === email ? 
                        'Email already registered' : 
                        'Phone number already registered' 
                });
            }

            // Create new user
            const user = new User({
                name,
                email,
                phone,
                password
            });

            await user.save();

            // Generate JWT token
            const token = jwt.sign(
                { userId: user._id },
                process.env.JWT_SECRET || 'your-secret-key-change-this',
                { expiresIn: '30d' }
            );

            res.status(201).json({
                status: 'success',
                message: 'Registration successful',
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role
                }
            });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ 
                status: 'error',
                message: 'Registration failed',
                error: error.message 
            });
        }
    }
];

// Login user
export const login = [
    // Validation
    body('emailOrPhone').notEmpty().withMessage('Email or phone is required'),
    body('password').notEmpty().withMessage('Password is required'),
    
    async (req, res) => {
        try {
            // Check validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    status: 'error',
                    message: 'Validation failed',
                    errors: errors.array() 
                });
            }

            const { emailOrPhone, password } = req.body;

            // Find user by email or phone
            const user = await User.findOne({
                $or: [
                    { email: emailOrPhone },
                    { phone: emailOrPhone }
                ]
            });

            if (!user) {
                return res.status(401).json({ 
                    status: 'error',
                    message: 'Invalid credentials' 
                });
            }

            // Check password
            const isPasswordValid = await user.comparePassword(password);

            if (!isPasswordValid) {
                return res.status(401).json({ 
                    status: 'error',
                    message: 'Invalid credentials' 
                });
            }

            // Update last login
            user.lastLogin = new Date();
            await user.save();

            // Generate JWT token
            const token = jwt.sign(
                { userId: user._id },
                process.env.JWT_SECRET || 'your-secret-key-change-this',
                { expiresIn: '30d' }
            );

            res.json({
                status: 'success',
                message: 'Login successful',
                token,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role
                }
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ 
                status: 'error',
                message: 'Login failed',
                error: error.message 
            });
        }
    }
];

// Get user profile
export const getProfile = async (req, res) => {
    try {
        res.json({
            status: 'success',
            user: {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                phone: req.user.phone,
                role: req.user.role,
                pricePerVoter: req.user.pricePerVoter,
                isActive: req.user.isActive,
                createdAt: req.user.createdAt,
                lastLogin: req.user.lastLogin
            }
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to get profile',
            error: error.message 
        });
    }
};
