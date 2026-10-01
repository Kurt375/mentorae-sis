-- =========================================================
-- MENTORAE SIS - Migration 011: Subject Management Fields
-- Adds curriculum metadata columns to subjects table so
-- admin-created subjects are preserved and synchronized.
-- =========================================================

ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER name,
  ADD COLUMN IF NOT EXISTS grade_level INT DEFAULT 11 AFTER classification,
  ADD COLUMN IF NOT EXISTS quarter INT DEFAULT 1 AFTER grade_level,
  ADD COLUMN IF NOT EXISTS strand VARCHAR(50) DEFAULT 'Common' AFTER quarter,
  ADD COLUMN IF NOT EXISTS strand_section VARCHAR(150) DEFAULT 'All Sections' AFTER strand,
  ADD COLUMN IF NOT EXISTS color VARCHAR(50) DEFAULT 'bg-card-blue' AFTER strand_section;

ALTER TABLE subjects
  MODIFY COLUMN classification VARCHAR(64) DEFAULT 'Core Subject';
