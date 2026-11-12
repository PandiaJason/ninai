-- ============================================================================
-- init_schema.sql
-- NINAI CRM Core PostgreSQL RDS Tables & Permissions
-- Run as admin (algo_cmo)
-- ============================================================================

-- 1. Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create the 4 core tables
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    contact VARCHAR(255),
    source VARCHAR(100),
    status VARCHAR(50) NOT NULL CHECK (status IN ('new', 'contacted', 'replied', 'early_access', 'active', 'feedback_given', 'dropped')),
    owner_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Grant permissions to restricted ninai_app role
GRANT SELECT, INSERT, UPDATE ON TABLE users TO ninai_app;
GRANT SELECT, INSERT, UPDATE ON TABLE messages TO ninai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE leads TO ninai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lead_notes TO ninai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ninai_app;
