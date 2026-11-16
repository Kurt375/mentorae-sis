-- =========================================================
-- MENTORAE SIS - Migration 024: Drop preferred_language column from users
-- =========================================================

-- Safely drop preferred_language column from users table
ALTER TABLE users DROP COLUMN IF EXISTS preferred_language;
