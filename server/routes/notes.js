import express from 'express';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateToken);

// GET /api/leads/:leadId/notes - List notes for a specific lead
router.get('/leads/:leadId/notes', async (req, res) => {
  const { leadId } = req.params;

  try {
    const sql = `
      SELECT n.*, u.name AS author_name, u.email AS author_email
      FROM lead_notes n
      LEFT JOIN users u ON n.author_id = u.id
      WHERE n.lead_id = $1
      ORDER BY n.created_at DESC;
    `;
    const result = await query(sql, [leadId]);
    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching lead notes');
    return res.status(500).json({ error: 'Failed to retrieve notes.' });
  }
});

// POST /api/leads/:leadId/notes - Add a note to a lead
router.post('/leads/:leadId/notes', async (req, res) => {
  const { leadId } = req.params;
  const { body } = req.body;

  if (!body || !body.trim()) {
    return res.status(400).json({ error: 'Note body cannot be empty.' });
  }

  try {
    const id = req.body.id || randomUUID();
    const authorId = req.user.id;
    const now = new Date();

    const sql = `
      INSERT INTO lead_notes (id, lead_id, author_id, body, created_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const result = await query(sql, [id, leadId, authorId, body.trim(), now]);
    const note = result.rows[0];

    // Attach author details for immediate client display
    return res.status(201).json({
      ...note,
      author_name: req.user.name,
      author_email: req.user.email,
    });
  } catch (err) {
    console.error('Error adding lead note');
    return res.status(500).json({ error: 'Failed to create note.' });
  }
});

// DELETE /api/notes/:id - Delete a note
router.delete('/notes/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query(
      'DELETE FROM lead_notes WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    return res.json({ success: true, id });
  } catch (err) {
    console.error('Error deleting note');
    return res.status(500).json({ error: 'Failed to delete note.' });
  }
});

export default router;
