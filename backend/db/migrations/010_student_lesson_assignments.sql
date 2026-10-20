-- Migration 010: Targeted Student Lesson Assignments
CREATE TABLE IF NOT EXISTS student_lesson_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  teacher_id INT NOT NULL,
  subject_id INT NOT NULL,
  topic_id INT NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_student (student_id),
  INDEX idx_topic (topic_id)
);
