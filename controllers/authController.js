import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import User from '../models/User.js';
import { sendEmail } from '../utils/emailService.js';

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
                _id: req.user._id,  // Add _id for consistency
                id: req.user._id,   // Keep id for backward compatibility
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

// Forgot password - send reset email
export const forgotPassword = [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    status: 'error',
                    message: 'Valid email is required',
                    errors: errors.array() 
                });
            }

            const { email } = req.body;

            // Find user by email
            const user = await User.findOne({ email });

            if (!user) {
                // Don't reveal if user exists for security
                return res.json({
                    status: 'success',
                    message: 'If an account with that email exists, a password reset link has been sent.'
                });
            }

            // Generate reset token
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

            // Save hashed token and expiry to user
            user.resetPasswordToken = resetTokenHash;
            user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
            await user.save();

            // Create reset URL
            const resetUrl = `${process.env.FRONTEND_URL || 'https://easyslip.in'}/reset-password.html?token=${resetToken}`;

            // Send email
            const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: 'Noto Sans Malayalam', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                        .kerala-border { height: 8px; background: linear-gradient(to right, #006D3B 0%, #006D3B 33.33%, #FFB81C 33.33%, #FFB81C 66.66%, #E03A3E 66.66%, #E03A3E 100%); }
                        .header { background: #006D3B; color: white; padding: 30px 20px; text-align: center; }
                        .header h1 { margin: 0 0 10px 0; font-size: 28px; }
                        .content { padding: 40px 30px; background: white; }
                        .message { margin: 20px 0; font-size: 15px; line-height: 1.8; }
                        .button { display: inline-block; background: #006D3B; color: white; padding: 14px 35px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; border: 2px solid #FFB81C; margin-top: 30px; }
                        .footer { background: #FFF8DC; padding: 25px 20px; text-align: center; font-size: 13px; color: #555; }
                        .footer p { margin: 8px 0; }
                        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="kerala-border"></div>
                    <div class="header">
                        <h1>EASYSLIP</h1>
                        <h2>🔐 Password Reset Request</h2>
                    </div>
                    <div class="content">
                        <p>Hi ${user.name},</p>
                        <div class="message">
                            We received a request to reset your password for your EasySlip account.<br><br>
                            Click the button below to reset your password:
                        </div>
                        <center>
                            <a href="${resetUrl}" class="button">Reset Password</a>
                        </center>
                        <div class="warning">
                            ⚠️ This link will expire in 1 hour.<br>
                            If you didn't request this, please ignore this email and your password will remain unchanged.
                        </div>
                        <div class="message" style="color: #888; font-size: 14px;">
                            Or copy and paste this link in your browser:<br>
                            <a href="${resetUrl}" style="color: #006D3B;">${resetUrl}</a>
                        </div>
                    </div>
                    <div class="kerala-border" style="height: 4px;"></div>
                    <div class="footer">
                        <p style="font-weight: 600; color: #006D3B;">EASYSLIP - Kerala Voter Slip Service</p>
                        <p>🌐 <a href="https://easyslip.in" style="color: #006D3B; text-decoration: none;">https://easyslip.in</a></p>
                        <p style="color: #777;">&copy; 2025 EASYSLIP. All rights reserved.</p>
                    </div>
                    <div class="kerala-border"></div>
                </body>
                </html>
            `;

            const emailResult = await sendEmail({
                to: user.email,
                subject: 'Password Reset Request - EasySlip',
                html: emailHtml,
                skipSettingsCheck: true // Force send even if email notifications disabled
            });

            if (!emailResult.success) {
                console.error('Failed to send reset email:', emailResult.error);
                return res.status(500).json({
                    status: 'error',
                    message: 'Failed to send reset email. Please check email configuration in admin settings.'
                });
            }

            res.json({
                status: 'success',
                message: 'Password reset link has been sent to your email.'
            });

        } catch (error) {
            console.error('Forgot password error:', error);
            res.status(500).json({ 
                status: 'error',
                message: 'Failed to process password reset request',
                error: error.message 
            });
        }
    }
];

// Reset password with token
export const resetPassword = [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    status: 'error',
                    message: 'Validation failed',
                    errors: errors.array() 
                });
            }

            const { token, password } = req.body;

            // Hash the token from URL
            const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

            // Find user with valid token
            const user = await User.findOne({
                resetPasswordToken: resetTokenHash,
                resetPasswordExpires: { $gt: Date.now() }
            });

            if (!user) {
                return res.status(400).json({ 
                    status: 'error',
                    message: 'Invalid or expired reset token' 
                });
            }

            // Update password
            user.password = password;
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();

            res.json({
                status: 'success',
                message: 'Password has been reset successfully. You can now login with your new password.'
            });

        } catch (error) {
            console.error('Reset password error:', error);
            res.status(500).json({ 
                status: 'error',
                message: 'Failed to reset password',
                error: error.message 
            });
        }
    }
];
