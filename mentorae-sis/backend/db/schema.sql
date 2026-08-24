-- =========================================================
-- MENTORAE Student Information System - Database Schema
-- Talisay Senior High School
-- =========================================================

CREATE DATABASE IF NOT EXISTS mentorae_sis;
USE mentorae_sis;

-- ---------------------------------------------------------
-- STRANDS (Academic/TVL tracks: STEM, ABM, HUMSS, ICT, etc.)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS strands (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(20)  NOT NULL UNIQUE,   -- e.g. "STEM", "ICT", "ABM"
  title       VARCHAR(150) NOT NULL,          -- e.g. "Science, Technology, Engineering, and Mathematics"
  department  VARCHAR(100),                   -- e.g. "Academic Track", "TVL Track"
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------
-- SECTIONS (a specific grade-level class group within a strand)
-- e.g. Strand=STEM, Grade=12, Name="Biomedical Engineering"
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS sections (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  strand_id    INT NOT NULL,
  grade_level  TINYINT NOT NULL,               -- 11 or 12
  name         VARCHAR(150) NOT NULL,          -- e.g. "Biomedical Engineering"
  adviser_id   INT NULL,                       -- teacher user id
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (strand_id)  REFERENCES strands(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_section (strand_id, grade_level, name)
);

-- ---------------------------------------------------------
-- SUBJECTS
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS subjects (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(30)  NOT NULL UNIQUE,  -- e.g. "GENMATH"
  name            VARCHAR(150) NOT NULL,         -- e.g. "General Mathematics"
  classification  ENUM('Core','Applied','Specialized','Contextualized') NOT NULL DEFAULT 'Core',
  hours_per_sem   INT DEFAULT 80,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------
-- USERS (students, teachers, parents, admins, security/scanner)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  role             ENUM('student','teacher','parent','admin','security') NOT NULL,
  id_number        VARCHAR(50)  NOT NULL UNIQUE,  -- auto-generated, e.g. "24-00001"
  first_name       VARCHAR(100) NOT NULL,
  middle_initial   VARCHAR(5),
  last_name        VARCHAR(100) NOT NULL,
  contact_number   VARCHAR(30),
  email            VARCHAR(150) NOT NULL UNIQUE,
  password_hash    VARCHAR(255) NOT NULL,
  section_id       INT NULL,                      -- students only
  qr_code_token    VARCHAR(64) UNIQUE,             -- what the student's QR actually encodes
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  failed_attempts  INT NOT NULL DEFAULT 0,
  locked_until     DATETIME NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL
);

ALTER TABLE sections ADD CONSTRAINT fk_section_adviser FOREIGN KEY (adviser_id) REFERENCES users(id) ON DELETE SET NULL;

-- Parent <-> Student links (a parent can have more than one child)
CREATE TABLE IF NOT EXISTS parent_student_links (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  parent_id   INT NOT NULL,
  student_id  INT NOT NULL,
  FOREIGN KEY (parent_id)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_link (parent_id, student_id)
);

-- ---------------------------------------------------------
-- PASSWORD RESET (OTP-based, matches the login page's modal flow)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  otp_hash    VARCHAR(255) NOT NULL,   -- SHA-256 hash of the 6-digit code
  expires_at  DATETIME NOT NULL,
  verified    TINYINT(1) NOT NULL DEFAULT 0,
  used        TINYINT(1) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------
-- SCANNER ACCESS KEYS ("Generate Unique Key for QR Scanner" on
-- User Management, and the "Scanner Access" box on the login page)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS scanner_keys (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  key_hash    VARCHAR(255) NOT NULL,
  label       VARCHAR(100) DEFAULT 'QR Scanner Access',
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_by  INT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- SCHEDULES (teacher + subject + section + day + time block)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedules (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id  INT NOT NULL,
  subject_id  INT NOT NULL,
  section_id  INT NOT NULL,
  day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday') NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------
-- ATTENDANCE (QR self check-in, teacher can override during their
-- own scheduled session — see the "session lock" logic in the app)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  student_id    INT NOT NULL,
  scanned_by    INT NULL,
  status        ENUM('present','late','absent','excused') NOT NULL DEFAULT 'present',
  scan_date     DATE NOT NULL,
  scan_time     TIME NULL,
  overridden_by INT NULL,             -- teacher who manually confirmed/unconfirmed
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (scanned_by)    REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (overridden_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_student_per_day (student_id, scan_date)
);

-- ---------------------------------------------------------
-- GRADES (Quiz/Activity/Exam components -> computed average + remarks)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS grades (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  student_id   INT NOT NULL,
  subject_id   INT NOT NULL,
  section_id   INT NOT NULL,
  term         VARCHAR(50) NOT NULL,   -- e.g. "1st Semester"
  quiz_score   DECIMAL(5,2) DEFAULT 0,  -- 0-30
  activity_score DECIMAL(5,2) DEFAULT 0, -- 0-20
  exam_score   DECIMAL(5,2) DEFAULT 0,  -- 0-50
  average      DECIMAL(5,2) GENERATED ALWAYS AS (quiz_score + activity_score + exam_score) STORED,
  recorded_by  INT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id)  REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (subject_id)  REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id)  REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (recorded_by) REFERENCES users(id)    ON DELETE SET NULL,
  UNIQUE KEY uniq_student_subject_term (student_id, subject_id, term)
);

-- ---------------------------------------------------------
-- BADGES (fixed catalog, matching class_management_teacher.js)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS badge_catalog (
  id      VARCHAR(40) PRIMARY KEY,   -- e.g. "top_scorer"
  name    VARCHAR(100) NOT NULL,
  icon    VARCHAR(60),               -- bootstrap-icons class, or NULL if using a text symbol
  symbol  VARCHAR(10),               -- e.g. "A+" when no icon is used
  bg      VARCHAR(20),
  color   VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS student_badges (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  student_id  INT NOT NULL,
  badge_id    VARCHAR(40) NOT NULL,
  awarded_by  INT NULL,
  earned_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (badge_id)   REFERENCES badge_catalog(id) ON DELETE CASCADE,
  FOREIGN KEY (awarded_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_student_badge (student_id, badge_id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  student_id  INT NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------
-- ANNOUNCEMENTS (with auto-classified type, matches announcement_admin.js)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  event_date  DATE NOT NULL,
  type        ENUM('event','academic','seminar') NOT NULL DEFAULT 'event',
  audience    ENUM('all','student','teacher','parent','admin') NOT NULL DEFAULT 'all',
  created_by  INT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- LOGIN AUDIT
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_audit (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NULL,
  id_number   VARCHAR(50),
  success     TINYINT(1) NOT NULL,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- SYSTEM SETTINGS (matches the General/Notifications/Security/
-- Database tabs in system_settings_admin.js)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key    VARCHAR(100) PRIMARY KEY,
  setting_value  VARCHAR(255) NOT NULL,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('school_name', 'Talisay Senior High School'),
  ('school_year', '2025 - 2026'),
  ('language', 'en'),
  ('maintenance_mode', '0'),
  ('notify_email', '1'),
  ('notify_sms', '0'),
  ('notify_push', '1'),
  ('require_2fa', '0'),
  ('session_timeout_minutes', '30'),
  ('backup_frequency', 'daily'),
  ('attendance_late_cutoff', '07:45:00')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

-- ---------------------------------------------------------
-- Seed data: strands, subjects, and the fixed badge catalog
-- ---------------------------------------------------------
INSERT INTO strands (code, title, department) VALUES
  ('STEM', 'Science, Technology, Engineering, and Mathematics', 'Academic Track'),
  ('ABM', 'Accountancy, Business, and Management', 'Academic Track'),
  ('HUMSS', 'Humanities and Social Sciences', 'Academic Track'),
  ('ICT', 'Information and Communications Technology', 'TVL Track'),
  ('HE', 'Home Economics', 'TVL Track'),
  ('BE', 'Business Entrepreneurship', 'TVL Track'),
  ('ASSH', 'Arts and Social Sciences / Humanities', 'Academic Track'),
  ('ALS', 'Alternative Learning System', 'ALS Track')
ON DUPLICATE KEY UPDATE code = code;

INSERT INTO subjects (code, name, classification, hours_per_sem) VALUES
  ('COPRO1', 'Computer Programming 1', 'Specialized', 80),
  ('GENMATH', 'General Mathematics', 'Core', 80),
  ('EMTECH', 'Empowerment Technologies', 'Applied', 80),
  ('ORALCOM', 'Oral Communication', 'Core', 80),
  ('DIASS', 'Disciplines and Ideas in Applied Social Sciences', 'Contextualized', 80),
  ('STATS', 'Statistics and Probability', 'Core', 80),
  ('SCIENCE', 'Science', 'Core', 80),
  ('ENGLISH', 'English', 'Core', 80),
  ('HISTORY', 'History', 'Core', 80)
ON DUPLICATE KEY UPDATE code = code;

INSERT INTO badge_catalog (id, name, icon, symbol, bg, color) VALUES
  ('top_scorer', 'Top Scorer', NULL, 'A+', '#e2f0d9', '#385723'),
  ('most_active', 'Most Active', 'bi-hand-thumbs-up-fill', NULL, '#d5ebd5', '#1f6e1f'),
  ('innovative_thinker', 'Innovative Thinker', 'bi-lightbulb-fill', NULL, '#fef2cb', '#b27a00'),
  ('team_captain', 'Team Captain', 'bi-star-fill', NULL, '#ebdcf5', '#6f30a0'),
  ('resilient_thinker', 'Resilient Thinker', 'bi-gem', NULL, '#d9f1f2', '#008080'),
  ('completed_grades', 'Completed Grades', 'bi-calendar-check-fill', NULL, '#e4dff2', '#5230a0'),
  ('recitation_master', 'Recitation Master', 'bi-chat-left-quote-fill', NULL, '#fce4d6', '#c65911'),
  ('critical_thinker', 'Critical Thinker', 'bi-search-heart-fill', NULL, '#e2f0d9', '#228b22'),
  ('coacher', 'Coacher', 'bi-trophy-fill', NULL, '#deeaf6', '#2f5597'),
  ('top_performer', 'Top Performer', 'bi-patch-check-fill', NULL, '#fce4d6', '#833c0c')
ON DUPLICATE KEY UPDATE id = id;

-- ---------------------------------------------------------
-- Seed: one admin account so you can log in on first deploy.
-- Do NOT hardcode a password hash here. After `npm install`, run:
--   npm run hash-password -- "YourChosenPassword123!"
-- then paste the printed hash into the INSERT below and run this file.
-- ---------------------------------------------------------
-- INSERT INTO users (role, id_number, first_name, last_name, email, password_hash, is_active)
-- VALUES (
--   'admin', 'ADMIN-0001', 'System', 'Administrator',
--   'admin@talisayshs.edu.ph',
--   '<paste bcrypt hash from scripts/hash-password.js here>',
--   1
-- );
