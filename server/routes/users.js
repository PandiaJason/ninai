import express from 'express';
import fs from 'fs';
import { query } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateToken);

/**
 * Accounts that have been removed from the workspace.
 *
 * The users table has no "active" column yet, so removal is recorded in a
 * small file the server owns. Sign-in is refused for these addresses until
 * they are restored. Once the column exists it takes precedence.
 */
const REVOKED_FILE = process.env.REVOKED_FILE || '/etc/ninai/revoked.json';

function readRevoked() {
    try {
        const raw = fs.readFileSync(REVOKED_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : [];
    } catch {
        return [];
    }
}

function writeRevoked(list) {
    fs.mkdirSync('/etc/ninai', { recursive: true });
    fs.writeFileSync(REVOKED_FILE, JSON.stringify(list, null, 2), { mode: 0o600 });
}

export function isRevoked(email) {
    const value = String(email || '').trim().toLowerCase();
    if (!value) return false;
    return readRevoked().some(entry => String(entry).toLowerCase() === value);
}

// GET /api/users - the accounts that exist on the server
router.get('/', requireRole('admin'), async (req, res) => {
    try {
        const result = await query(
            'SELECT id, name, email, created_at FROM users ORDER BY created_at'
        );
        const revoked = readRevoked().map(email => email.toLowerCase());
        res.json(
            result.rows.map(row => ({
                ...row,
                revoked: revoked.includes(String(row.email || '').toLowerCase()),
            }))
        );
    } catch (err) {
        console.error('Error listing users');
        res.status(500).json({ error: 'Failed to list accounts.' });
    }
});

// DELETE /api/users/:id - remove an account from the workspace
router.delete('/:id', requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await query('SELECT id, email FROM users WHERE id = $1 LIMIT 1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Account not found.' });
        }
        const email = String(result.rows[0].email || '').toLowerCase();

        // Prefer the database flag when the column is there.
        let columnPresent = false;
        try {
            await query('UPDATE users SET active = false WHERE id = $1', [id]);
            columnPresent = true;
        } catch {
            columnPresent = false;
        }

        if (!columnPresent) {
            const revoked = readRevoked();
            if (!revoked.includes(email)) {
                revoked.push(email);
                writeRevoked(revoked);
            }
        }

        res.json({ success: true, id, email, method: columnPresent ? 'column' : 'revoked-file' });
    } catch (err) {
        console.error('Error removing account');
        res.status(500).json({ error: 'Failed to remove the account.' });
    }
});

// POST /api/users/:id/restore - give the account access back
router.post('/:id/restore', requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await query('SELECT id, email FROM users WHERE id = $1 LIMIT 1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Account not found.' });
        }
        const email = String(result.rows[0].email || '').toLowerCase();

        let columnPresent = false;
        try {
            await query('UPDATE users SET active = true WHERE id = $1', [id]);
            columnPresent = true;
        } catch {
            columnPresent = false;
        }

        if (!columnPresent) {
            writeRevoked(readRevoked().filter(entry => String(entry).toLowerCase() !== email));
        }

        res.json({ success: true, id, email, method: columnPresent ? 'column' : 'revoked-file' });
    } catch (err) {
        console.error('Error restoring account');
        res.status(500).json({ error: 'Failed to restore the account.' });
    }
});

export default router;
