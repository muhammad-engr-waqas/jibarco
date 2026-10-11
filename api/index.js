require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const Employee = require('../models/Employee');
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

        // 1. Ensure Faisal Salem (Admin) exists
        const adminEmail = 'faisal@jibarco.com';
        let adminUser = await User.findOne({ email: adminEmail });
        if (!adminUser) {
            adminUser = new User({
                name: 'Faisal Salem',
                email: adminEmail,
                password: 'Faisal123',
                role: 'admin',
                permissions: ['all']
            });
            await adminUser.save();
        } else if (!adminUser.permissions || !adminUser.permissions.includes('all')) {
            adminUser.permissions = ['all'];
            await adminUser.save();
        }

        // 2. Ensure Hassan exists with access to Quotation & Add Employee only
        const hassanEmail = 'hassan@jibarco.com';
        let hassanUser = await User.findOne({ email: hassanEmail });
        if (!hassanUser) {
            hassanUser = new User({
                name: 'Hassan',
                email: hassanEmail,
                password: 'hassan@123',
                role: 'user',
                permissions: ['quotation', 'employees']
            });
            await hassanUser.save();
        } else {
            hassanUser.name = 'Hassan';
            hassanUser.password = 'hassan@123';
            hassanUser.role = 'user';
            hassanUser.permissions = ['quotation', 'employees'];
            await hassanUser.save();
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
                role: user.role,
                permissions: user.permissions || ['all']
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
            role: req.user.role,
            permissions: req.user.permissions || ['all']
        }
    });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    return res.json({ success: true, message: 'Logged out successfully.' });
});

// ----------------- EMPLOYEE API ROUTES ----------------- //

// Get all employees (supports search)
app.get('/api/employees', verifyAuth, async (req, res) => {
    try {
        const { search } = req.query;
        let query = {};
        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query = {
                $or: [
                    { name: regex },
                    { iqama: regex },
                    { nationality: regex },
                    { profession: regex },
                    { phone: regex }
                ]
            };
        }
        const employees = await Employee.find(query).sort({ createdAt: -1 });
        return res.json({ success: true, count: employees.length, employees });
    } catch (err) {
        console.error('Error fetching employees:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch employees' });
    }
});

// Get single employee
app.get('/api/employees/:id', verifyAuth, async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.id);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }
        return res.json({ success: true, employee });
    } catch (err) {
        console.error('Error fetching employee:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch employee' });
    }
});

// Add new employee
app.post('/api/employees', verifyAuth, async (req, res) => {
    try {
        const { name, iqama, nationality, profession, phone, status, notes } = req.body;

        if (!name || !iqama || !nationality || !profession || !phone) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields (Name, Iqama, Nationality, Profession, Phone) are required.' 
            });
        }

        // Check if iqama already exists
        const existing = await Employee.findOne({ iqama: iqama.trim() });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: `An employee with Iqama number ${iqama} already exists (${existing.name}).`
            });
        }

        const employee = new Employee({
            name: name.trim(),
            iqama: iqama.trim(),
            nationality: nationality.trim(),
            profession: profession.trim(),
            phone: phone.trim(),
            status: status || 'Active',
            notes: notes ? notes.trim() : ''
        });

        await employee.save();
        return res.status(201).json({ 
            success: true, 
            message: 'Employee added successfully!', 
            employee 
        });
    } catch (err) {
        console.error('Error creating employee:', err);
        return res.status(500).json({ success: false, message: 'Failed to save employee: ' + err.message });
    }
});

// Update employee
app.put('/api/employees/:id', verifyAuth, async (req, res) => {
    try {
        const { name, iqama, nationality, profession, phone, status, notes } = req.body;

        if (!name || !iqama || !nationality || !profession || !phone) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields (Name, Iqama, Nationality, Profession, Phone) are required.' 
            });
        }

        // Check duplicate iqama for other employee
        const existing = await Employee.findOne({ 
            iqama: iqama.trim(), 
            _id: { $ne: req.params.id } 
        });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: `Another employee already has Iqama number ${iqama} (${existing.name}).`
            });
        }

        const employee = await Employee.findByIdAndUpdate(
            req.params.id,
            {
                name: name.trim(),
                iqama: iqama.trim(),
                nationality: nationality.trim(),
                profession: profession.trim(),
                phone: phone.trim(),
                status: status || 'Active',
                notes: notes ? notes.trim() : '',
                updatedAt: Date.now()
            },
            { new: true, runValidators: true }
        );

        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        return res.json({ 
            success: true, 
            message: 'Employee updated successfully!', 
            employee 
        });
    } catch (err) {
        console.error('Error updating employee:', err);
        return res.status(500).json({ success: false, message: 'Failed to update employee: ' + err.message });
    }
});

// Delete employee
app.delete('/api/employees/:id', verifyAuth, async (req, res) => {
    try {
        const employee = await Employee.findByIdAndDelete(req.params.id);
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }
        return res.json({ 
            success: true, 
            message: `Employee "${employee.name}" deleted successfully.` 
        });
    } catch (err) {
        console.error('Error deleting employee:', err);
        return res.status(500).json({ success: false, message: 'Failed to delete employee' });
    }
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

            // Check page-level permissions for non-admin users
            const user = req.user;
            const isRestricted = user && user.role !== 'admin' && !(user.permissions && user.permissions.includes('all'));

            if (isRestricted) {
                const userPermissions = user.permissions || [];
                // Map HTML files to permission identifier
                const pagePermissionMap = {
                    'quotation.html': 'quotation',
                    'employees.html': 'employees',
                    'index.html': 'allowed',
                    'invoice.html': 'invoice',
                    'pusrchase.html': 'purchase',
                    'agreement.html': 'agreement'
                };

                const requiredPerm = pagePermissionMap[cleanPath];
                if (requiredPerm && requiredPerm !== 'allowed' && !userPermissions.includes(requiredPerm)) {
                    // Unauthorized attempt to access restricted document!
                    return res.redirect('/index.html?unauthorized=1');
                }
            }

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
