-- =========================================================
-- MENTORAE SIS - Migration 018: add preferred_language column to users
-- =========================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) NOT NULL DEFAULT 'en' AFTER address;
