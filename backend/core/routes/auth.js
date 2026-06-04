const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_local_development';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'fallback_refresh_secret';

const generateTokens = (user) => {
    const payload = { id: user.id, email: user.email, role: user.role, workspace_id: user.workspace_id };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
};

// Register
router.post('/register', async (req, res) => {
    const { username, email, password, full_name } = req.body;
    
    if (!email || !password || !username) {
        return res.status(400).json({ error: "Username, email and password are required" });
    }

    try {
        // Check if user exists
        let existingUser = await db.query('SELECT * FROM public.users WHERE email = $1 OR username = $2', [email, username]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: "User with that email or username already exists" });
        }

        // Check if first user
        let countRes = await db.query('SELECT COUNT(*) FROM public.users');
        let isFirst = parseInt(countRes.rows[0].count) === 0;
        let role = isFirst ? 'pending-workspace-setup' : 'uninvited';
        let workspace_id = null;

        // Check for invitations
        let inviteRes = await db.query(
            "SELECT * FROM public.invitations WHERE email ILIKE $1 AND status IN ('pending', 'accepted') AND expires_at >= NOW() ORDER BY created_at DESC LIMIT 1", 
            [email]
        );
        let invite = inviteRes.rows[0];

        if (invite) {
            role = invite.role;
            workspace_id = invite.workspace_id;
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert
        let insertRes = await db.query(
            `INSERT INTO public.users (id, username, email, password_hash, full_name, role, workspace_id) 
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) RETURNING *`,
            [username, email, passwordHash, full_name, role, workspace_id]
        );

        let user = insertRes.rows[0];

        if (invite && invite.status === 'pending') {
            await db.query("UPDATE public.invitations SET status = 'accepted' WHERE id = $1", [invite.id]);
        }

        if (invite && invite.date_of_joining) {
            await db.query(
                "INSERT INTO public.employment_records (profile_id, workspace_id, date_of_joining, employment_status) VALUES ($1, $2, $3, 'active') ON CONFLICT DO NOTHING", 
                [user.id, workspace_id, invite.date_of_joining]
            );
        }

        const { accessToken, refreshToken } = generateTokens(user);
        
        await db.query('UPDATE public.users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

        res.json({ accessToken, refreshToken, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ error: "Identifier and password are required" });
    }

    try {
        let result = await db.query('SELECT * FROM public.users WHERE email = $1 OR username = $1', [identifier]);
        let user = result.rows[0];

        if (!user || !user.password_hash) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const { accessToken, refreshToken } = generateTokens(user);
        
        await db.query('UPDATE public.users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

        res.json({ accessToken, refreshToken, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Refresh Token
router.post('/refresh-token', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: "Refresh token is required" });

    try {
        const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
        let result = await db.query('SELECT * FROM public.users WHERE id = $1 AND refresh_token = $2', [decoded.id, refreshToken]);
        let user = result.rows[0];

        if (!user) {
            return res.status(403).json({ error: "Invalid refresh token" });
        }

        const tokens = generateTokens(user);
        await db.query('UPDATE public.users SET refresh_token = $1 WHERE id = $2', [tokens.refreshToken, user.id]);

        res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    } catch (err) {
        console.error(err);
        res.status(403).json({ error: "Invalid or expired refresh token" });
    }
});

// Change Password
router.post('/change-password', async (req, res) => {
    // In a real app we'd verify access token first in middleware
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) return res.sendStatus(403);
        
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) return res.status(400).json({ error: "Missing fields" });

        try {
            let result = await db.query('SELECT * FROM public.users WHERE id = $1', [decoded.id]);
            let user = result.rows[0];

            if (!user.password_hash) {
                return res.status(400).json({ error: "User has no password set" });
            }

            const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
            if (!isMatch) return res.status(400).json({ error: "Incorrect old password" });

            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(newPassword, salt);

            await db.query('UPDATE public.users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);

            res.json({ message: "Password updated successfully" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Internal Server Error" });
        }
    });
});

// In a real app, use GoogleAuthLibrary to verify the token sent by frontend
router.post('/google', async (req, res) => {
    const { email, name, avatar_url } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    try {
        let result = await db.query('SELECT * FROM public.users WHERE email = $1', [email]);
        let user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: "User not found. Please ask admin for an invite." });
        }

        const { accessToken, refreshToken } = generateTokens(user);
        await db.query('UPDATE public.users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

        res.json({ accessToken, refreshToken, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
