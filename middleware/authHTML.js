import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Middleware for HTML endpoints that need authentication
// Returns HTML error pages instead of JSON
const authHTML = async (req, res, next) => {
    try {
        // Get token from Authorization header (sent by preview.html)
        const authHeader = req.header('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            console.log('❌ No authentication token provided');
            return res.status(401).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Authentication Required</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        }
                        .container {
                            background: white;
                            padding: 3rem;
                            border-radius: 20px;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                            text-align: center;
                            max-width: 500px;
                        }
                        h1 {
                            color: #2d3748;
                            margin-bottom: 1rem;
                        }
                        p {
                            color: #718096;
                            margin-bottom: 2rem;
                            line-height: 1.6;
                        }
                        .btn {
                            display: inline-block;
                            padding: 1rem 2rem;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            text-decoration: none;
                            border-radius: 8px;
                            font-weight: 600;
                            transition: transform 0.3s;
                        }
                        .btn:hover {
                            transform: translateY(-2px);
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🔒 Authentication Required</h1>
                        <p>You need to be logged in to view this preview.</p>
                        <a href="/login.html" class="btn">Go to Login</a>
                    </div>
                    <script>
                        // Auto redirect after 3 seconds
                        setTimeout(() => {
                            window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
                        }, 3000);
                    </script>
                </body>
                </html>
            `);
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');
        
        // Find user
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            console.log('❌ User not found for token');
            return res.status(401).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Invalid Session</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        }
                        .container {
                            background: white;
                            padding: 3rem;
                            border-radius: 20px;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                            text-align: center;
                            max-width: 500px;
                        }
                        h1 {
                            color: #2d3748;
                            margin-bottom: 1rem;
                        }
                        p {
                            color: #718096;
                            margin-bottom: 2rem;
                            line-height: 1.6;
                        }
                        .btn {
                            display: inline-block;
                            padding: 1rem 2rem;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            text-decoration: none;
                            border-radius: 8px;
                            font-weight: 600;
                            transition: transform 0.3s;
                        }
                        .btn:hover {
                            transform: translateY(-2px);
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>⚠️ Invalid Session</h1>
                        <p>Your session is invalid or has expired. Please log in again.</p>
                        <a href="/login.html" class="btn">Go to Login</a>
                    </div>
                    <script>
                        // Clear local storage and redirect
                        localStorage.removeItem('token');
                        setTimeout(() => {
                            window.location.href = '/login.html';
                        }, 3000);
                    </script>
                </body>
                </html>
            `);
        }

        // Attach user to request
        req.user = user;
        req.userId = user._id;
        
        console.log('✅ User authenticated:', user.email);
        next();
        
    } catch (error) {
        console.error('❌ Authentication error:', error.message);
        
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Session Expired</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        }
                        .container {
                            background: white;
                            padding: 3rem;
                            border-radius: 20px;
                            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                            text-align: center;
                            max-width: 500px;
                        }
                        h1 {
                            color: #2d3748;
                            margin-bottom: 1rem;
                        }
                        p {
                            color: #718096;
                            margin-bottom: 2rem;
                            line-height: 1.6;
                        }
                        .btn {
                            display: inline-block;
                            padding: 1rem 2rem;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            text-decoration: none;
                            border-radius: 8px;
                            font-weight: 600;
                            transition: transform 0.3s;
                        }
                        .btn:hover {
                            transform: translateY(-2px);
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>⏱️ Session Expired</h1>
                        <p>Your session has expired. Please log in again to continue.</p>
                        <a href="/login.html" class="btn">Go to Login</a>
                    </div>
                    <script>
                        // Clear local storage and redirect
                        localStorage.removeItem('token');
                        setTimeout(() => {
                            window.location.href = '/login.html';
                        }, 3000);
                    </script>
                </body>
                </html>
            `);
        }
        
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .container {
                        background: white;
                        padding: 3rem;
                        border-radius: 20px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        text-align: center;
                        max-width: 500px;
                    }
                    h1 {
                        color: #2d3748;
                        margin-bottom: 1rem;
                    }
                    p {
                        color: #718096;
                        margin-bottom: 2rem;
                        line-height: 1.6;
                    }
                    .btn {
                        display: inline-block;
                        padding: 1rem 2rem;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        text-decoration: none;
                        border-radius: 8px;
                        font-weight: 600;
                        transition: transform 0.3s;
                    }
                    .btn:hover {
                        transform: translateY(-2px);
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>❌ Authentication Error</h1>
                    <p>An error occurred during authentication. Please try again.</p>
                    <a href="/login.html" class="btn">Go to Login</a>
                </div>
            </body>
            </html>
        `);
    }
};

export default authHTML;
