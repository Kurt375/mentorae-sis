-- =========================================================
-- MENTORAE SIS - Migration 006: promotion & graduation support
-- Run after 005_quiz_flashcard_content.sql.
-- =========================================================
USE railway;

-- Adds 'graduated' as a distinct enrollment status, separate from
-- 'dropped' (left the school) so admins can tell the two apart and
-- filter/report on them separately. Existing rows are unaffected —
-- default stays 'enrolled'.
ALTER TABLE users
  MODIFY COLUMN enrollment_status ENUM('enrolled','not_enrolled','dropped','graduated') NOT NULL DEFAULT 'enrolled';
