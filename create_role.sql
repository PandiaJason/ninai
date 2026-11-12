-- ============================================================================
-- create_role.sql (Limited Application Role)
-- Run this in DBeaver as admin (algo_cmo)
-- ============================================================================

-- 1. Create limited application role with a placeholder password
-- IMPORTANT: Replace 'CHANGE_ME_IN_DBEAVER' with a strong random password
-- and put the same password into your .env as DB_PASSWORD.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ninai_app') THEN
        CREATE ROLE ninai_app WITH LOGIN PASSWORD 'CHANGE_ME_IN_DBEAVER' NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;

-- 2. Grant table permissions on the 4 application tables
-- App needs SELECT, INSERT, UPDATE on all 4 tables
GRANT SELECT, INSERT, UPDATE ON TABLE users TO ninai_app;
GRANT SELECT, INSERT, UPDATE ON TABLE messages TO ninai_app;

-- App needs DELETE only on leads and lead_notes
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE leads TO ninai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lead_notes TO ninai_app;

-- 3. If any sequence is used (or uuid-ossp / pgcrypto)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ninai_app;
