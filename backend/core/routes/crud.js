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

function parseCondition(key, val, paramIndex, params) {
    if (val.startsWith('eq.')) {
        params.push(val.substring(3));
        return { clause: `"${key}" = $${paramIndex}`, newIndex: paramIndex + 1 };
    } else if (val.startsWith('neq.')) {
        params.push(val.substring(4));
        return { clause: `"${key}" != $${paramIndex}`, newIndex: paramIndex + 1 };
    } else if (val.startsWith('gte.')) {
        params.push(val.substring(4));
        return { clause: `"${key}" >= $${paramIndex}`, newIndex: paramIndex + 1 };
    } else if (val.startsWith('lte.')) {
        params.push(val.substring(4));
        return { clause: `"${key}" <= $${paramIndex}`, newIndex: paramIndex + 1 };
    } else if (val.startsWith('gt.')) {
        params.push(val.substring(3));
        return { clause: `"${key}" > $${paramIndex}`, newIndex: paramIndex + 1 };
    } else if (val.startsWith('lt.')) {
        params.push(val.substring(3));
        return { clause: `"${key}" < $${paramIndex}`, newIndex: paramIndex + 1 };
    } else if (val.startsWith('ilike.')) {
        params.push(val.substring(6));
        return { clause: `"${key}" ILIKE $${paramIndex}`, newIndex: paramIndex + 1 };
    } else if (val.startsWith('is.')) {
        const isVal = val.substring(3).toLowerCase();
        if (isVal === 'null') {
            return { clause: `"${key}" IS NULL`, newIndex: paramIndex };
        } else if (isVal === 'true' || isVal === 'false') {
            return { clause: `"${key}" IS ${isVal.toUpperCase()}`, newIndex: paramIndex };
        } else {
            params.push(val.substring(3));
            return { clause: `"${key}" IS $${paramIndex}`, newIndex: paramIndex + 1 };
        }
    } else if (val.startsWith('in.')) {
        const inValues = val.substring(4, val.length - 1).split(',');
        const placeholders = inValues.map(v => `$${paramIndex++}`).join(',');
        params.push(...inValues);
        return { clause: `"${key}" IN (${placeholders})`, newIndex: paramIndex };
    } else if (val.startsWith('cs.')) {
        try {
            const parsedVal = JSON.parse(val.substring(3));
            params.push(JSON.stringify(parsedVal));
            return { clause: `"${key}" @> $${paramIndex}`, newIndex: paramIndex + 1 };
        } catch (e) {
            params.push(val.substring(3));
            return { clause: `"${key}" @> $${paramIndex}`, newIndex: paramIndex + 1 };
        }
    } else {
        params.push(val);
        return { clause: `"${key}" = $${paramIndex}`, newIndex: paramIndex + 1 };
    }
}

function parseQueryParams(query) {
    let whereClauses = [];
    let params = [];
    let orderClause = '';
    let limitClause = '';
    let paramIndex = 1;

    for (let key in query) {
        if (key === 'order') {
            const [col, dir] = query[key].split('.');
            orderClause = `ORDER BY "${col}" ${dir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`;
        } else if (key === 'limit') {
            limitClause = `LIMIT ${parseInt(query[key])}`;
        } else if (key === 'or') {
            let val = query[key];
            if (val.startsWith('(') && val.endsWith(')')) {
                val = val.substring(1, val.length - 1);
            }
            const parts = val.split(',');
            let orClauses = [];
            for (let part of parts) {
                const dotIdx = part.indexOf('.');
                if (dotIdx > -1) {
                    const orKey = part.substring(0, dotIdx);
                    const orVal = part.substring(dotIdx + 1);
                    const res = parseCondition(orKey, orVal, paramIndex, params);
                    orClauses.push(res.clause);
                    paramIndex = res.newIndex;
                }
            }
            if (orClauses.length > 0) {
                whereClauses.push(`(${orClauses.join(' OR ')})`);
            }
        } else if (key !== 'select') {
            const res = parseCondition(key, query[key], paramIndex, params);
            whereClauses.push(res.clause);
            paramIndex = res.newIndex;
        }
    }
    return { whereClauses, params, orderClause, limitClause };
}

router.get('/:table', async (req, res) => {
    const table = req.params.table;
    if (!/^[a-z0-9_]+$/.test(table)) return res.status(400).json({error: "Invalid table"});
    
    try {
        const { whereClauses, params, orderClause, limitClause } = parseQueryParams(req.query);
        let query = `SELECT * FROM public."${table}"`;
        if (whereClauses.length > 0) {
            query += ` WHERE ` + whereClauses.join(' AND ');
        }
        if (orderClause) query += ` ${orderClause}`;
        if (limitClause) query += ` ${limitClause}`;

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:table', async (req, res) => {
    const table = req.params.table;
    if (!/^[a-z0-9_]+$/.test(table)) return res.status(400).json({error: "Invalid table"});
    
    try {
        const body = req.body;
        // Handle array of objects (bulk insert) or single object
        const items = Array.isArray(body) ? body : [body];
        if (items.length === 0) return res.json([]);

        const keys = Object.keys(items[0]);
        const columns = keys.map(k => `"${k}"`).join(', ');
        
        let paramIndex = 1;
        const values = [];
        const params = [];
        
        for (const item of items) {
            const itemVals = [];
            for (const key of keys) {
                itemVals.push(`$${paramIndex++}`);
                params.push(item[key]);
            }
            values.push(`(${itemVals.join(', ')})`);
        }
        
        let query = `INSERT INTO public."${table}" (${columns}) VALUES ${values.join(', ')} RETURNING *`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/:table', async (req, res) => {
    const table = req.params.table;
    if (!/^[a-z0-9_]+$/.test(table)) return res.status(400).json({error: "Invalid table"});
    
    try {
        const body = req.body;
        const setClauses = [];
        const params = [];
        let paramIndex = 1;
        
        for (const key in body) {
            setClauses.push(`"${key}" = $${paramIndex++}`);
            params.push(body[key]);
        }
        
        const { whereClauses, params: whereParams } = parseQueryParams(req.query);
        for (const wp of whereParams) {
            params.push(wp);
        }
        
        // Offset the where placeholders
        const adjustedWhere = whereClauses.map(clause => {
            return clause.replace(/\$(\d+)/g, (match, p1) => {
                const oldIdx = parseInt(p1);
                return `$${oldIdx + paramIndex - 1}`;
            });
        });

        let query = `UPDATE public."${table}" SET ${setClauses.join(', ')}`;
        if (adjustedWhere.length > 0) {
            query += ` WHERE ` + adjustedWhere.join(' AND ');
        }
        query += ' RETURNING *';

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:table', async (req, res) => {
    const table = req.params.table;
    if (!/^[a-z0-9_]+$/.test(table)) return res.status(400).json({error: "Invalid table"});
    
    try {
        const body = req.body;
        const items = Array.isArray(body) ? body : [body];
        if (items.length === 0) return res.json([]);

        const keys = Object.keys(items[0]);
        const columns = keys.map(k => `"${k}"`).join(', ');
        
        let paramIndex = 1;
        const values = [];
        const params = [];
        
        for (const item of items) {
            const itemVals = [];
            for (const key of keys) {
                itemVals.push(`$${paramIndex++}`);
                params.push(item[key]);
            }
            values.push(`(${itemVals.join(', ')})`);
        }

        const updateExclusions = keys.filter(k => k !== 'id').map(k => `"${k}" = EXCLUDED."${k}"`).join(', ');
        const onConflictClause = updateExclusions.length > 0 ? `ON CONFLICT (id) DO UPDATE SET ${updateExclusions}` : 'ON CONFLICT (id) DO NOTHING';

        let query = `INSERT INTO public."${table}" (${columns}) VALUES ${values.join(', ')} ${onConflictClause} RETURNING *`;
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:table', async (req, res) => {
    const table = req.params.table;
    if (!/^[a-z0-9_]+$/.test(table)) return res.status(400).json({error: "Invalid table"});
    
    try {
        const { whereClauses, params } = parseQueryParams(req.query);
        let query = `DELETE FROM public."${table}"`;
        if (whereClauses.length > 0) {
            query += ` WHERE ` + whereClauses.join(' AND ');
        }
        query += ' RETURNING *';

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
