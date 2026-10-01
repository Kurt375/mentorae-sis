-- =========================================================
-- MENTORAE SIS - Migration 008: forced first-login password
-- change, and teacher "advisory section" / "subjects handled"
-- captured at account-creation time.
-- Run after 007_nullable_exam_score.sql.
-- =========================================================
USE railway;

-- Set on every account whose password was auto-generated (currently the
-- user's own ID number). Cleared the moment they successfully change it,
-- either via the forced first-login flow or a normal password reset.
ALTER TABLE users
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash;

-- Which subjects a teacher is authorized to teach. Deliberately separate
-- from `schedules` (which needs a section + day + time too) -- this is
-- just the simple "Subjects Handled" list captured on the Create Account
-- form, independent of any specific class schedule.
CREATE TABLE IF NOT EXISTS teacher_subjects (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id  INT NOT NULL,
  subject_id  INT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_teacher_subject (teacher_id, subject_id)
);
