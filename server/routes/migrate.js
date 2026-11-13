import express from 'express';
import { randomUUID } from 'crypto';
import pool, { query } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateToken);

const VALID_STATUSES = new Set([
  'new', 'contacted', 'replied', 'early_access', 'active', 'feedback_given', 'dropped'
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

const normalizeStatus = (s) => {
  if (!s) return 'new';
  const lower = String(s).trim().toLowerCase();
  if (VALID_STATUSES.has(lower)) return lower;
  return STATUS_MAP[lower] || 'new';
};

// POST /api/migrate - Idempotent data migration endpoint
router.post('/', async (req, res) => {
  const { leads = [], notes = [], dryRun = false } = req.body;

  try {
    const leadIds = leads.map((l) => l.id).filter(Boolean);
    let existingLeadIds = new Set();
    if (leadIds.length > 0) {
      const matchRes = await query('SELECT id FROM leads WHERE id = ANY($1)', [leadIds]);
      existingLeadIds = new Set(matchRes.rows.map((r) => r.id));
    }

    const noteIds = notes.map((n) => n.id).filter(Boolean);
    let existingNoteIds = new Set();
    if (noteIds.length > 0) {
      const matchNoteRes = await query('SELECT id FROM lead_notes WHERE id = ANY($1)', [noteIds]);
      existingNoteIds = new Set(matchNoteRes.rows.map((r) => r.id));
    }

    const summary = {
      dryRun: Boolean(dryRun),
      leads: {
        total: leads.length,
        new: leads.length - existingLeadIds.size,
        existing: existingLeadIds.size,
      },
      notes: {
        total: notes.length,
        new: notes.length - existingNoteIds.size,
        existing: existingNoteIds.size,
      },
    };

    if (dryRun) {
      return res.json({
        success: true,
        message: 'Dry-run inspection complete. No changes made.',
        summary,
      });
    }

    // Apply Migration inside a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const defaultOwnerId = req.user.id;

      let insertedLeads = 0;
      let updatedLeads = 0;

      for (const lead of leads) {
        const id = lead.id || randomUUID();
        const name = lead.name || 'Unnamed Lead';
        const contact = lead.contact || lead.email || lead.phone || lead.company || '';
        const source = lead.source || 'migration';
        const status = normalizeStatus(lead.status || lead.stageId);
        const ownerId = lead.ownerId || lead.owner_id || defaultOwnerId;
        const createdAt = lead.createdAt ? new Date(lead.createdAt) : new Date();
        const updatedAt = lead.updatedAt ? new Date(lead.updatedAt) : new Date();

        const leadUpsertSql = `
          INSERT INTO leads (id, name, contact, source, status, owner_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            contact = EXCLUDED.contact,
            source = EXCLUDED.source,
            status = EXCLUDED.status,
            updated_at = NOW();
        `;

        await client.query(leadUpsertSql, [id, name, contact, source, status, ownerId, createdAt, updatedAt]);

        if (existingLeadIds.has(id)) {
          updatedLeads++;
        } else {
          insertedLeads++;
        }
      }

      let insertedNotes = 0;
      let updatedNotes = 0;

      for (const note of notes) {
        const id = note.id || randomUUID();
        const leadId = note.leadId || note.lead_id;
        if (!leadId) continue;
        const authorId = note.authorId || note.author_id || defaultOwnerId;
        const body = note.body || note.content || note.text || '';
        const createdAt = note.createdAt || note.created_at ? new Date(note.createdAt || note.created_at) : new Date();

        const noteUpsertSql = `
          INSERT INTO lead_notes (id, lead_id, author_id, body, created_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (id) DO UPDATE SET
            body = EXCLUDED.body;
        `;

        await client.query(noteUpsertSql, [id, leadId, authorId, body, createdAt]);

        if (existingNoteIds.has(id)) {
          updatedNotes++;
        } else {
          insertedNotes++;
        }
      }

      await client.query('COMMIT');

      return res.json({
        success: true,
        summary: {
          ...summary,
          leadsInserted: insertedLeads,
          leadsUpdated: updatedLeads,
          notesInserted: insertedNotes,
          notesUpdated: updatedNotes,
        },
      });
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Migration error');
    return res.status(500).json({ error: 'Migration failed due to a server error.' });
  }
});

export default router;
