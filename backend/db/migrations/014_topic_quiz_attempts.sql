-- =========================================================
-- MENTORAE SIS - Migration 014: topic_quiz_attempts table
-- Tracks practice quiz attempts for students & teacher preview
-- =========================================================

CREATE TABLE IF NOT EXISTS topic_quiz_attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  topic_id INT NULL,
  topic_title VARCHAR(255) NOT NULL,
  subject_name VARCHAR(255) NOT NULL,
  section_name VARCHAR(100) NULL,
  score INT NOT NULL,
  total_questions INT NOT NULL,
  percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  answers_json LONGTEXT NULL,
  is_preview TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_topic (user_id, topic_title),
  INDEX idx_subject_topic_section (subject_name, topic_title, section_name),
  INDEX idx_is_preview (is_preview),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
);
