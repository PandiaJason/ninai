#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || (!args.includes('--apply') && !args.includes('--commit'));
const fileArgIndex = args.indexOf('--file');
const filePath = fileArgIndex !== -1 && args[fileArgIndex + 1] ? args[fileArgIndex + 1] : null;

console.log('='.repeat(65));
console.log('  NINAI CRM - Local Data to PostgreSQL Cloud Migration');
console.log('='.repeat(65));

if (!process.env.DB_HOST || !process.env.DB_USER) {
  console.error('\n[ERROR] Missing database credentials in environment (.env).');
  console.error('Please ensure DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME are set.\n');
  process.exit(1);
}

// Locate input file
let resolvedFile = filePath;
if (!resolvedFile) {
  const candidates = [
    'ninai-local-data.json',
    'ninai_export.json',
    'export.json',
    'backup.json',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      resolvedFile = c;
      break;
    }
  }
}

if (!resolvedFile || !fs.existsSync(resolvedFile)) {
  console.log('\nUsage:');
  console.log('  node scripts/migrate.js --file <path-to-json-data> [--dry-run | --apply]\n');
  console.log('Options:');
  console.log('  --dry-run   Show count of new vs existing records without writing (default)');
  console.log('  --apply     Execute idempotent migration into PostgreSQL\n');
  console.log('No local data file specified. Generating a starter template: "sample-leads.json"');

  const sampleData = {
    leads: [
      {
        id: "a0000000-0000-0000-0000-000000000001",
        name: "Acme Learning Academy",
        contact: "partner@acme.edu",
        source: "direct",
        status: "new",
        company: "Acme Education",
        email: "partner@acme.edu",
        priority: "high",
        value: 12000,
        audience: "institution"
      }
    ],
    notes: [
      {
        id: "b0000000-0000-0000-0000-000000000001",
        lead_id: "a0000000-0000-0000-0000-000000000001",
        body: "Initial contact made regarding curriculum integration.",
        created_at: new Date().toISOString()
      }
    ]
  };

  fs.writeFileSync('sample-leads.json', JSON.stringify(sampleData, null, 2));
  console.log('Created "sample-leads.json". You can test migration with:');
  console.log('  node scripts/migrate.js --file sample-leads.json --dry-run\n');
  process.exit(0);
}

console.log(`Reading data from: ${resolvedFile}`);
let rawData;
try {
  rawData = JSON.parse(fs.readFileSync(resolvedFile, 'utf8'));
} catch (err) {
  console.error(`[ERROR] Failed to parse JSON from ${resolvedFile}:`, err.message);
  process.exit(1);
}

// Normalize items
const leads = Array.isArray(rawData) ? rawData : (rawData.leads || []);
const notes = rawData.notes || rawData.lead_notes || [];

console.log(`Found in file: ${leads.length} lead(s), ${notes.length} note(s).`);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'ninai',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
});

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

async function run() {
  const client = await pool.connect();
  try {
    // 1. Get default admin / owner user id
    const userRes = await client.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1');
    if (userRes.rows.length === 0) {
      console.error('[ERROR] No users found in users table. Please create a user or run create_role.sql first.');
      process.exit(1);
    }
    const defaultOwnerId = userRes.rows[0].id;

    // 2. Discover available columns in leads
    const colRes = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'leads'`
    );
    const existingColumns = new Set(colRes.rows.map(r => r.column_name));

    // 3. Dry-run analysis
    const leadIds = leads.map(l => l.id).filter(Boolean);
    let existingLeadIds = new Set();
    if (leadIds.length > 0) {
      const matchRes = await client.query('SELECT id FROM leads WHERE id = ANY($1)', [leadIds]);
      existingLeadIds = new Set(matchRes.rows.map(r => r.id));
    }

    const noteIds = notes.map(n => n.id).filter(Boolean);
    let existingNoteIds = new Set();
    if (noteIds.length > 0) {
      const matchNoteRes = await client.query('SELECT id FROM lead_notes WHERE id = ANY($1)', [noteIds]);
      existingNoteIds = new Set(matchNoteRes.rows.map(r => r.id));
    }

    const newLeadsCount = leads.length - existingLeadIds.size;
    const existingLeadsCount = existingLeadIds.size;
    const newNotesCount = notes.length - existingNoteIds.size;
    const existingNotesCount = existingNoteIds.size;

    console.log('\n--- DRY-RUN SUMMARY ---');
    console.log(`Leads to Migrate : ${leads.length}`);
    console.log(`  - New (to insert)   : ${newLeadsCount}`);
    console.log(`  - Existing (update) : ${existingLeadsCount}`);
    console.log(`Notes to Migrate : ${notes.length}`);
    console.log(`  - New (to insert)   : ${newNotesCount}`);
    console.log(`  - Existing (update) : ${existingNotesCount}`);
    console.log('-----------------------\n');

    if (isDryRun) {
      console.log('>> DRY-RUN MODE: No database changes were made.');
      console.log('To apply these changes idempotently, re-run with:');
      console.log(`  node scripts/migrate.js --file "${resolvedFile}" --apply\n`);
      return;
    }

    console.log('Applying idempotent migration in a transaction...');
    await client.query('BEGIN');

    let insertedLeads = 0;
    let updatedLeads = 0;

    for (const lead of leads) {
      const id = lead.id || crypto.randomUUID();
      const name = lead.name || 'Unnamed Lead';
      const contact = lead.contact || lead.email || lead.phone || lead.company || '';
      const source = lead.source || 'migration';
      const status = normalizeStatus(lead.status || lead.stageId);
      const ownerId = lead.ownerId || lead.owner_id || defaultOwnerId;
      const createdAt = lead.createdAt ? new Date(lead.createdAt) : new Date();
      const updatedAt = lead.updatedAt ? new Date(lead.updatedAt) : new Date();

      // Base query with ON CONFLICT (id) DO UPDATE (idempotency guarantee)
      const queryText = `
        INSERT INTO leads (id, name, contact, source, status, owner_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          contact = EXCLUDED.contact,
          source = EXCLUDED.source,
          status = EXCLUDED.status,
          updated_at = NOW();
      `;

      await client.query(queryText, [id, name, contact, source, status, ownerId, createdAt, updatedAt]);

      if (existingLeadIds.has(id)) {
        updatedLeads++;
      } else {
        insertedLeads++;
      }
    }

    let insertedNotes = 0;
    let updatedNotes = 0;

    for (const note of notes) {
      const id = note.id || crypto.randomUUID();
      const leadId = note.leadId || note.lead_id;
      if (!leadId) continue;
      const authorId = note.authorId || note.author_id || defaultOwnerId;
      const body = note.body || note.content || note.text || '';
      const createdAt = note.createdAt || note.created_at ? new Date(note.createdAt || note.created_at) : new Date();

      const noteQuery = `
        INSERT INTO lead_notes (id, lead_id, author_id, body, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          body = EXCLUDED.body;
      `;

      await client.query(noteQuery, [id, leadId, authorId, body, createdAt]);

      if (existingNoteIds.has(id)) {
        updatedNotes++;
      } else {
        insertedNotes++;
      }
    }

    await client.query('COMMIT');

    console.log('Migration completed successfully!');
    console.log(`Leads: ${insertedLeads} inserted, ${updatedLeads} updated.`);
    console.log(`Notes: ${insertedNotes} inserted, ${updatedNotes} updated.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[ERROR] Migration failed and rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
