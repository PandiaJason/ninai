import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Administrators can also be declared in the environment, as a comma separated
 * list of addresses. This is the fallback for installations where the `role`
 * column has not been added to the users table yet; once the column exists it
 * takes precedence.
 */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);

function roleFor(user) {
  if (user.role) return user.role === 'admin' ? 'admin' : 'member';
  if (ADMIN_EMAILS.includes(String(user.email || '').toLowerCase())) return 'admin';
  return 'member';
}

// Rate limiter for login: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Parameterised query verifying pgcrypto blowfish hash: password_hash = crypt($1, password_hash)
    // The role column is optional until schema_changes.sql has been applied.
    let user = null;
    try {
      const withRole = await query(
        `SELECT id, name, email, role, (password_hash = crypt($1, password_hash)) AS is_valid
         FROM users
         WHERE lower(trim(email)) = $2
         LIMIT 1;`,
        [password, normalizedEmail]
      );
      user = withRole.rows[0];
    } catch {
      const withoutRole = await query(
        `SELECT id, name, email, (password_hash = crypt($1, password_hash)) AS is_valid
         FROM users
         WHERE lower(trim(email)) = $2
         LIMIT 1;`,
        [password, normalizedEmail]
      );
      user = withoutRole.rows[0];
    }

    if (!user || !user.is_valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const role = roleFor(user);

    // Try updating last_login_at if column exists (failsafe if schema_changes not yet run)
    try {
      await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    } catch {
      // Ignore if last_login_at column does not exist
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'Server authentication configuration error.' });
    }

    // Signed token with 24-hour expiration
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role },
      secret,
      { expiresIn: '24h' }
    );

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role,
      },
      token,
    });
  } catch (err) {
    // Avoid logging credentials or leaking DB connection info
    console.error('Login processing error');
    return res.status(500).json({ error: 'Authentication failed due to a server error.' });
  }
});

// GET /api/auth/me - Verify current session
router.get('/me', authenticateToken, async (req, res) => {
  try {
    let row = null;
    try {
      const withRole = await query(
        'SELECT id, name, email, role, created_at FROM users WHERE id = $1 LIMIT 1',
        [req.user.id]
      );
      row = withRole.rows[0];
    } catch {
      const withoutRole = await query(
        'SELECT id, name, email, created_at FROM users WHERE id = $1 LIMIT 1',
        [req.user.id]
      );
      row = withoutRole.rows[0];
    }

    if (!row) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    res.json({
      user: {
        ...row,
        role: roleFor(row),
      },
    });
  } catch (err) {
    console.error('Session verification error');
    res.status(500).json({ error: 'Failed to verify session.' });
  }
});

export default router;
