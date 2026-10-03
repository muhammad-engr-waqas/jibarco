require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { verifyAuth, JWT_SECRET } = require('../middleware/auth');

const app = express();
const MONGO_URI = process.env.MONGO_URI || "mongodb://muhammadengrwaqas_db_user:waqas123@ac-zhkc4ml-shard-00-00.ayrd5jn.mongodb.net:27017,ac-zhkc4ml-shard-00-01.ayrd5jn.mongodb.net:27017,ac-zhkc4ml-shard-00-02.ayrd5jn.mongodb.net:27017/jibarco?ssl=true&replicaSet=atlas-z1ol18-shard-0&authSource=admin&retryWrites=true&w=majority";

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Helper to resolve static file paths in local & Vercel serverless
const resolveFilePath = (filename) => {
    const cwdPath = path.join(process.cwd(), filename);
    if (fs.existsSync(cwdPath)) return cwdPath;
    const parentPath = path.join(__dirname, '..', filename);
    if (fs.existsSync(parentPath)) return parentPath;
    return cwdPath;
};

// Cached MongoDB Connection for Serverless
let isConnected = false;
async function connectToDatabase() {
    if (isConnected && mongoose.connection.readyState === 1) {
        return;
    }

    try {
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000
        });
        isConnected = true;

        const targetEmail = 'faisal@jibarco.com';
        const targetPass = 'Faisal123';
        const targetName = 'Faisal Salem';

        // Ensure single user exists
        let user = await User.findOne({ email: targetEmail });
        if (!user) {
            user = new User({
                name: targetName,
                email: targetEmail,
                password: targetPass,
                role: 'admin'
            });
            await user.save();
        }
    } catch (err) {
        console.error('Database connection error:', err.message);
    }
}

// Ensure DB is connected before processing requests
app.use(async (req, res, next) => {
    await connectToDatabase();
    next();
});

// Helper to generate token
const generateToken = (userId) => {
    return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
};

// ----------------- AUTH API ROUTES ----------------- //

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const token = generateToken(user._id);

        res.cookie('token', token, {
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });

        return res.json({
            success: true,
            message: 'Login successful!',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

// Current User Profile
app.get('/api/auth/me', verifyAuth, (req, res) => {
    return res.json({
        success: true,
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role
        }
    });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    return res.json({ success: true, message: 'Logged out successfully.' });
});

// ----------------- PAGE ROUTE PROTECTION ----------------- //

// Public Login Page
app.get('/login.html', (req, res) => {
    const token = req.cookies.token;
    if (token) {
        try {
            jwt.verify(token, JWT_SECRET);
            return res.redirect('/index.html');
        } catch (e) {}
    }
    res.sendFile(resolveFilePath('login.html'));
});

// Protect Root Path
app.get('/', verifyAuth, (req, res) => {
    res.sendFile(resolveFilePath('index.html'));
});

// Protect all other HTML pages
app.use((req, res, next) => {
    if (req.path.endsWith('.html') && req.path !== '/login.html') {
        return verifyAuth(req, res, () => {
            const cleanPath = req.path.replace(/^\/+/, '');
            res.sendFile(resolveFilePath(cleanPath));
        });
    }
    next();
});

// Static files fallback (images, logo, etc.)
app.use(express.static(process.cwd(), { index: false }));
app.use(express.static(path.join(__dirname, '..'), { index: false }));

// Fallback for any unknown route
app.use((req, res) => {
    if (req.accepts('html')) {
        return res.redirect('/login.html');
    }
    res.status(404).json({ success: false, message: 'Resource not found' });
});

module.exports = app;
