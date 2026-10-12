-- =========================================================
-- MENTORAE SIS - Migration 016: add address column to users
-- =========================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS address VARCHAR(255) NULL AFTER contact_number;
