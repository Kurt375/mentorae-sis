-- =========================================================
-- MENTORAE SIS - Migration 002: feature additions
-- Run this once against your existing database (after schema.sql).
-- Safe to re-run: every statement is guarded.
-- =========================================================
USE mentorae_sis;

-- ---------------------------------------------------------
-- 1. Role dropdown additions (4Ps / ARAL Program)
--    These are student assistance programs, not access levels,
--    so they are NOT added to users.role (that would break every
--    role-based permission check in the app). Instead they're a
--    tag on the student record, settable from the same "Role"-area
--    dropdown in Create Account when Role = Student.
-- ---------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS program ENUM('none','4ps','aral') NOT NULL DEFAULT 'none' AFTER role;

-- ---------------------------------------------------------
-- 2. Profile picture (student + teacher)
-- ---------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_picture_url MEDIUMTEXT NULL AFTER contact_number;

-- ---------------------------------------------------------
-- 3. Personal email for real-time notifications (separate from
--    the school-generated login email in users.email)
-- ---------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS personal_email VARCHAR(150) NULL AFTER email;

-- ---------------------------------------------------------
-- 4. Semester / year status shown on student & teacher dashboards.
--    Global current term lives in system_settings; per-student
--    enrollment status lives here.
-- ---------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS enrollment_status ENUM('enrolled','not_enrolled','dropped') NOT NULL DEFAULT 'enrolled' AFTER program;

INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('current_semester', '1st Semester'),
  ('current_quarter', '1st Quarter'),
  ('scanner_key_window_start', '06:00:00'),
  ('scanner_key_window_end', '16:00:00'),
  ('attendance_time_in_start', '07:00:00'),
  ('attendance_time_out_cutoff', '15:30:00'),
  ('attendance_late_cutoff', '07:45:00')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

-- ---------------------------------------------------------
-- 5. Quarter on schedules (in addition to existing day/time)
-- ---------------------------------------------------------
ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS quarter ENUM('1st Quarter','2nd Quarter','3rd Quarter','4th Quarter') NOT NULL DEFAULT '1st Quarter' AFTER section_id;

-- ---------------------------------------------------------
-- 6. Attendance: split single daily log into "time in" and
--    "time out" events so the secondary (out) scan and the
--    3:30 PM cutoff -> excused-if-outside-window rule can work.
-- ---------------------------------------------------------
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS time_out TIME NULL AFTER scan_time,
  ADD COLUMN IF NOT EXISTS time_out_status ENUM('out','excused') NULL AFTER time_out,
  ADD COLUMN IF NOT EXISTS confirmed_by INT NULL AFTER overridden_by,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP NULL AFTER confirmed_by;

-- MySQL doesn't support IF NOT EXISTS on ADD CONSTRAINT, so this line
-- only runs once cleanly. If you re-run the migration, comment it out.
ALTER TABLE attendance_logs
  ADD CONSTRAINT fk_attendance_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------
-- 7. In-app notifications (new account, parent alerts, adviser
--    "left early" alerts). One table, filtered by recipient + type.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  recipient_id INT NOT NULL,
  type         ENUM('account_created','attendance_arrived','attendance_late',
                     'attendance_excused','attendance_out','adviser_early_leave',
                     'general') NOT NULL,
  title        VARCHAR(150) NOT NULL,
  message      VARCHAR(500) NOT NULL,
  related_student_id INT NULL,
  is_read      TINYINT(1) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipient_id)       REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (related_student_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_recipient_unread (recipient_id, is_read)
);
-- Used by: new-account welcome notice, parent arrived/late/excused/out alerts
-- (sent only after a teacher verifies a scan), and adviser early-leave alerts.

-- ---------------------------------------------------------
-- 8. Scanner key validity window (per-key override; falls back
--    to system_settings.scanner_key_window_* when null)
-- ---------------------------------------------------------
ALTER TABLE scanner_keys
  ADD COLUMN IF NOT EXISTS valid_from TIME NULL AFTER label,
  ADD COLUMN IF NOT EXISTS valid_until TIME NULL AFTER valid_from;
