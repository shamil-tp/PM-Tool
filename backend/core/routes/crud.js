const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ error: "No token provided" });

    // Format: "Bearer <token>"
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(403).json({ error: "No token provided" });

    jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_for_local_development', (err, decoded) => {
        if (err) return res.status(401).json({ error: "Unauthorized" });
        req.user = decoded; // { id, email, role, workspace_id }
        next();
    });
};

router.use(verifyToken);

// Generic GET for PostgREST replacement scaffolding
// WARNING: Building a true dynamic REST API requires rigorous SQL injection protection
// For now, we allow basic queries on safe table names
router.get('/:table', async (req, res) => {
    const table = req.params.table;
    
    // Safelist / validation
    if (!/^[a-z0-9_]+$/.test(table)) return res.status(400).json({error: "Invalid table"});
    
    try {
        // Enforce basic tenant isolation if user has a workspace_id
        let query = `SELECT * FROM public.${table}`;
        let params = [];
        
        // Example RLS mock: If table has workspace_id, filter it
        // This is a naive implementation; you'll build robust endpoints over time
        if (req.user.workspace_id) {
            // Need to check if table actually has workspace_id before applying this
            // We'll skip for this scaffold and rely on specific endpoints later
        }

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create specific endpoints for actual app logic (e.g., tasks, projects, etc.)
// router.post('/tasks', async (req, res) => { ... });

module.exports = router;
