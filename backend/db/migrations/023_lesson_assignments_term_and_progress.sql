-- =========================================================
-- MENTORAE SIS - Migration 023: Term-Based Lesson Assignments & Topic Completion Tracking
-- =========================================================

-- 1. Add term and status columns to student_lesson_assignments
ALTER TABLE student_lesson_assignments
  ADD COLUMN IF NOT EXISTS term VARCHAR(50) NOT NULL DEFAULT '1st Term' AFTER topic_id,
  ADD COLUMN IF NOT EXISTS status ENUM('pending', 'completed') NOT NULL DEFAULT 'pending' AFTER note;

-- 2. Backfill term on existing student_lesson_assignments based on created_at timestamp
-- Term 1: Before 2026-09-16
UPDATE student_lesson_assignments
SET term = '1st Term'
WHERE created_at < '2026-09-16';

-- Term 2: 2026-09-16 to 2026-11-30
UPDATE student_lesson_assignments
SET term = '2nd Term'
WHERE created_at >= '2026-09-16' AND created_at < '2027-01-04';

-- Term 3: 2027-01-04 and later
UPDATE student_lesson_assignments
SET term = '3rd Term'
WHERE created_at >= '2027-01-04';

-- 3. Create student_topic_progress table for tracking files, flashcards, and quizzes
CREATE TABLE IF NOT EXISTS student_topic_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  topic_id INT NOT NULL,
  files_viewed TINYINT(1) NOT NULL DEFAULT 0,
  flashcards_completed TINYINT(1) NOT NULL DEFAULT 0,
  quiz_completed TINYINT(1) NOT NULL DEFAULT 0,
  quiz_score INT NULL,
  quiz_total INT NULL,
  quiz_percentage DECIMAL(5,2) NULL,
  is_completed TINYINT(1) NOT NULL DEFAULT 0,
  completed_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_student_topic (student_id, topic_id),
  INDEX idx_student_topic_status (student_id, is_completed),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
);

-- 4. Initial backfill from topic_quiz_attempts into student_topic_progress
INSERT INTO student_topic_progress (student_id, topic_id, quiz_completed, quiz_score, quiz_total, quiz_percentage, is_completed, completed_at)
SELECT a.user_id, a.topic_id, 1, a.score, a.total_questions, a.percentage, 1, a.created_at
FROM topic_quiz_attempts a
WHERE a.topic_id IS NOT NULL AND a.is_preview = 0
ON DUPLICATE KEY UPDATE
  quiz_completed = 1,
  quiz_score = VALUES(quiz_score),
  quiz_total = VALUES(quiz_total),
  quiz_percentage = VALUES(quiz_percentage);

