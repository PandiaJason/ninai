import express from 'express';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateToken);

// GET /api/messages - Founder status messages
router.get('/', async (req, res) => {
  try {
    const sql = `
      SELECT m.*, u.name AS author_name, u.email AS author_email
      FROM messages m
      LEFT JOIN users u ON m.author_id = u.id
      ORDER BY m.created_at DESC
      LIMIT 100;
    `;
    const result = await query(sql);
    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching founder messages');
    return res.status(500).json({ error: 'Failed to retrieve messages.' });
  }
});

// POST /api/messages - Post a new founder message
router.post('/', async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) {
    return res.status(400).json({ error: 'Message body cannot be empty.' });
  }

  try {
    const id = req.body.id || randomUUID();
    const authorId = req.user.id;
    const now = new Date();

    const sql = `
      INSERT INTO messages (id, author_id, body, created_at)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await query(sql, [id, authorId, body.trim(), now]);
    const message = result.rows[0];

    return res.status(201).json({
      ...message,
      author_name: req.user.name,
      author_email: req.user.email,
    });
  } catch (err) {
    console.error('Error creating founder message');
    return res.status(500).json({ error: 'Failed to post message.' });
  }
});

export default router;
