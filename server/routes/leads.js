import express from 'express';
import { randomUUID } from 'crypto';
import { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateToken);

const VALID_STATUSES = new Set([
  'new',
  'contacted',
  'replied',
  'early_access',
  'active',
  'feedback_given',
  'dropped',
]);

const STATUS_MAP = {
  stage_requested: 'new',
  stage_invited: 'contacted',
  stage_activated: 'early_access',
  stage_engaged: 'replied',
  stage_feedback: 'feedback_given',
  stage_nurture: 'active',
  stage_not_fit: 'dropped',
};

const normalizeStatus = (status) => {
  if (!status) return 'new';
  const direct = String(status).trim().toLowerCase();
  if (VALID_STATUSES.has(direct)) return direct;
  if (STATUS_MAP[direct]) return STATUS_MAP[direct];
  return 'new';
};

// Cache table columns so we never attempt to insert non-existent columns
let leadsColumns = null;

const getLeadsColumns = async () => {
  if (leadsColumns) return leadsColumns;
  try {
    const res = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'leads'`
    );
    leadsColumns = new Set(res.rows.map((r) => r.column_name));
  } catch {
    leadsColumns = new Set(['id', 'name', 'contact', 'source', 'status', 'owner_id', 'created_at', 'updated_at']);
  }
  return leadsColumns;
};

// GET /api/leads - List all leads with owner info
router.get('/', async (req, res) => {
  try {
    const { status, include_archived } = req.query;
    const cols = await getLeadsColumns();
    const hasArchivedCol = cols.has('archived');

    let sql = `
      SELECT l.*, u.name AS owner_name, u.email AS owner_email
      FROM leads l
      LEFT JOIN users u ON l.owner_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!include_archived && hasArchivedCol) {
      params.push(false);
      sql += ` AND (l.archived IS NULL OR l.archived = $${params.length})`;
    }

    if (status && VALID_STATUSES.has(status)) {
      params.push(status);
      sql += ` AND l.status = $${params.length}`;
    }

    sql += ` ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC`;

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching leads');
    return res.status(500).json({ error: 'Failed to retrieve leads.' });
  }
});

// GET /api/leads/:id - Get single lead
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const sql = `
      SELECT l.*, u.name AS owner_name, u.email AS owner_email
      FROM leads l
      LEFT JOIN users u ON l.owner_id = u.id
      WHERE l.id = $1
      LIMIT 1;
    `;
    const result = await query(sql, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found.' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching lead details');
    return res.status(500).json({ error: 'Failed to retrieve lead details.' });
  }
});

// POST /api/leads - Create lead
router.post('/', async (req, res) => {
  const { name, contact, email, phone, source, status, owner_id } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Lead name is required.' });
  }

  try {
    const cols = await getLeadsColumns();
    const id = req.body.id || randomUUID();
    const cleanStatus = normalizeStatus(status);
    const cleanContact = contact || email || phone || '';
    const cleanOwnerId = owner_id || req.user.id;
    const now = new Date();

    const insertFields = ['id', 'name', 'contact', 'source', 'status', 'owner_id', 'created_at', 'updated_at'];
    const insertValues = [id, name.trim(), cleanContact, source || 'direct', cleanStatus, cleanOwnerId, now, now];

    // Check optional extended columns
    const optionalKeys = [
      'company',
      'email',
      'phone',
      'priority',
      'value',
      'archived',
      'next_follow_up_at',
      'last_contacted_at',
      'description',
      'audience',
      'persona',
      'quality',
      'challenge_attempts',
      'feedback_status',
      'drop_off_reason',
      'institution_type',
      'student_count',
    ];

    for (const key of optionalKeys) {
      if (cols.has(key) && req.body[key] !== undefined) {
        insertFields.push(key);
        insertValues.push(req.body[key]);
      }
    }

    if (cols.has('tracks_explored') && req.body.tracks_explored !== undefined) {
      insertFields.push('tracks_explored');
      insertValues.push(JSON.stringify(req.body.tracks_explored));
    }

    const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `
      INSERT INTO leads (${insertFields.join(', ')})
      VALUES (${placeholders})
      RETURNING *;
    `;

    const result = await query(sql, insertValues);
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating lead');
    return res.status(500).json({ error: 'Failed to create lead.' });
  }
});

// PUT /api/leads/:id - Update lead
router.put('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const cols = await getLeadsColumns();
    const updates = [];
    const values = [];

    const allowedFields = [
      'name',
      'contact',
      'source',
      'status',
      'owner_id',
      'company',
      'email',
      'phone',
      'priority',
      'value',
      'archived',
      'next_follow_up_at',
      'last_contacted_at',
      'description',
      'audience',
      'persona',
      'quality',
      'challenge_attempts',
      'feedback_status',
      'drop_off_reason',
      'institution_type',
      'student_count',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined && cols.has(field)) {
        let val = req.body[field];
        if (field === 'status') val = normalizeStatus(val);
        values.push(val);
        updates.push(`${field} = $${values.length}`);
      }
    }

    if (req.body.tracks_explored !== undefined && cols.has('tracks_explored')) {
      values.push(JSON.stringify(req.body.tracks_explored));
      updates.push(`tracks_explored = $${values.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update.' });
    }

    // Always update updated_at
    updates.push(`updated_at = NOW()`);
    values.push(id);

    const sql = `
      UPDATE leads
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING *;
    `;

    const result = await query(sql, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found.' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating lead');
    return res.status(500).json({ error: 'Failed to update lead.' });
  }
});

// DELETE /api/leads/:id - Delete lead
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Delete lead notes first to maintain referential integrity
    await query('DELETE FROM lead_notes WHERE lead_id = $1', [id]);
    const result = await query('DELETE FROM leads WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found.' });
    }

    return res.json({ success: true, id });
  } catch (err) {
    console.error('Error deleting lead');
    return res.status(500).json({ error: 'Failed to delete lead.' });
  }
});

export default router;
