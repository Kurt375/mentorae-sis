-- =========================================================
-- MENTORAE SIS - Migration 003: learning resources (lesson modules)
-- Run after 002_feature_additions.sql.
-- =========================================================
USE railway;

-- A "module" is one lesson posting (title/description/subject/section/quarter).
-- It can hold several files (handouts, slides, worksheets, etc.).
CREATE TABLE IF NOT EXISTS lesson_modules (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id  INT NOT NULL,
  subject_id  INT NOT NULL,
  section_id  INT NULL,     -- NULL = posted to every section the teacher has this subject with
  quarter     ENUM('1st Quarter','2nd Quarter','3rd Quarter','4th Quarter') NOT NULL,
  title       VARCHAR(200) NOT NULL,
  description VARCHAR(1000) NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
);

-- The current file for each attachment under a module. Updating a lesson
-- file overwrites this row's file_path/version and pushes the old one into
-- lesson_module_file_versions below — nothing is destroyed.
CREATE TABLE IF NOT EXISTS lesson_module_files (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  module_id      INT NOT NULL,
  original_name  VARCHAR(255) NOT NULL,   -- filename as the teacher uploaded it
  file_path      VARCHAR(500) NOT NULL,   -- path under backend/uploads/lesson-files
  file_size      INT NOT NULL,
  mime_type      VARCHAR(150) NOT NULL,
  version        INT NOT NULL DEFAULT 1,
  uploaded_by    INT NOT NULL,
  uploaded_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (module_id)   REFERENCES lesson_modules(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)          ON DELETE CASCADE
);

-- Superseded versions, kept for history/rollback.
CREATE TABLE IF NOT EXISTS lesson_module_file_versions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  module_file_id INT NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  file_path      VARCHAR(500) NOT NULL,
  file_size      INT NOT NULL,
  mime_type      VARCHAR(150) NOT NULL,
  version        INT NOT NULL,
  replaced_by    INT NULL,
  replaced_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (module_file_id) REFERENCES lesson_module_files(id) ON DELETE CASCADE,
  FOREIGN KEY (replaced_by)    REFERENCES users(id)                ON DELETE SET NULL
);

-- New notification type for "a lesson file you rely on was updated".
-- MySQL requires the full ENUM list to add one value.
ALTER TABLE notifications MODIFY COLUMN type ENUM(
  'account_created','attendance_arrived','attendance_late',
  'attendance_excused','attendance_out','adviser_early_leave',
  'lesson_module_posted','lesson_module_updated','general'
) NOT NULL;
