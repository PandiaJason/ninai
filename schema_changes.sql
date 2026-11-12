-- ============================================================================
-- schema_changes.sql (PROPOSED DDL - DO NOT RUN AUTOMATICALLY)
-- Ninai CRM Schema Additions for ALGO Cloud PostgreSQL
-- Run this in DBeaver as admin (algo_cmo) if you wish to support
-- the extended fields that the Ninai frontend UI currently captures.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. USERS: App role & session tracking
-- ----------------------------------------------------------------------------
-- The frontend checks user roles (admin vs member) and tracks last login.
ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'member',
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- 2. LEADS: Extended CRM & ALGO Learner/Institution attributes
-- ----------------------------------------------------------------------------
-- Current DB has: id, name, contact, source, status, owner_id, created_at, updated_at
-- The Ninai UI captures structured contact details, pipeline value, follow-up scheduling,
-- and ALGO-specific learner progress metrics.
--
-- OPTION A: Dedicated typed columns (recommended for direct indexing & reporting)
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS company VARCHAR(255),
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium',
    ADD COLUMN IF NOT EXISTS value NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS audience VARCHAR(50) DEFAULT 'learner',
    ADD COLUMN IF NOT EXISTS persona VARCHAR(50),
    ADD COLUMN IF NOT EXISTS quality VARCHAR(50),
    ADD COLUMN IF NOT EXISTS challenge_attempts INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tracks_explored JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS feedback_status VARCHAR(50) DEFAULT 'not_requested',
    ADD COLUMN IF NOT EXISTS drop_off_reason TEXT,
    ADD COLUMN IF NOT EXISTS institution_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS student_count INTEGER;

-- OPTION B (Alternative/Fallback): Flexible JSONB metadata column
-- If you prefer keeping the base table minimal without the columns above:
-- ALTER TABLE leads ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- 3. LEAD_NOTES: Update timestamp
-- ----------------------------------------------------------------------------
-- Allows note editing without losing creation timestamp.
ALTER TABLE lead_notes
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ----------------------------------------------------------------------------
-- 4. PERFORMANCE INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_owner_id ON leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_archived ON leads(archived);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
