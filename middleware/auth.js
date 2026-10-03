const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'jibarco_secret_key_2026_secure_auth_token_99812';

// Middleware to verify token for API endpoints or page routes
const verifyAuth = async (req, res, next) => {
    try {
        let token = null;

        // Check cookie first
        if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        } 
        // Check Authorization header
        else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            // If request is asking for an HTML page or navigation
            if (req.accepts('html') && !req.path.startsWith('/api/')) {
                return res.redirect('/login.html');
            }
            return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            res.clearCookie('token');
            if (req.accepts('html') && !req.path.startsWith('/api/')) {
                return res.redirect('/login.html');
            }
            return res.status(401).json({ success: false, message: 'User no longer exists.' });
        }

        req.user = user;
        next();
    } catch (err) {
        res.clearCookie('token');
        if (req.accepts('html') && !req.path.startsWith('/api/')) {
            return res.redirect('/login.html');
        }
        return res.status(401).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
    }
};

module.exports = { verifyAuth, JWT_SECRET };
