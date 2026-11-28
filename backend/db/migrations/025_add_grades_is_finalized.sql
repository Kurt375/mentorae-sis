-- =========================================================
-- MENTORAE SIS - Migration 025: Add is_finalized to grades table
-- =========================================================

ALTER TABLE grades 
ADD COLUMN IF NOT EXISTS is_finalized TINYINT(1) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS finalized_by INT NULL DEFAULT NULL;
