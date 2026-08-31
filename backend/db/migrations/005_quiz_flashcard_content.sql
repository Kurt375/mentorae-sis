-- =========================================================
-- MENTORAE SIS - Migration 005: topics, quizzes, flashcards,
-- topic requests, and student quiz attempts.
-- Run after 004_leaderboard.sql. Safe to re-run.
-- =========================================================
USE railway;

-- ---------------------------------------------------------
-- 1. Topics: a unit of content under a subject (parallel to
--    lesson_modules, but drives quizzes/flashcards below).
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS topics (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  subject_id  INT NOT NULL,
  title       VARCHAR(200) NOT NULL,
  description VARCHAR(1000) NULL,
  created_by  INT NOT NULL,
  status      ENUM('approved','pending_review','rejected') NOT NULL DEFAULT 'approved',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE CASCADE
);

-- ---------------------------------------------------------
-- 2. Topic requests: a teacher proposes a new topic; admin
--    approves/rejects via topic_requests_admin.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS topic_requests (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  subject_id   INT NOT NULL,
  teacher_id   INT NOT NULL,
  title        VARCHAR(200) NOT NULL,
  description  VARCHAR(1000) NULL,
  status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewed_by  INT NULL,
  reviewed_at  TIMESTAMP NULL,
  topic_id     INT NULL,  -- set once approved and copied into topics
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id)  REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id)  REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)    ON DELETE SET NULL,
  FOREIGN KEY (topic_id)    REFERENCES topics(id)   ON DELETE SET NULL
);

-- ---------------------------------------------------------
-- 3. Quiz sets + questions
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_sets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  topic_id    INT NOT NULL,
  title       VARCHAR(200) NOT NULL,
  created_by  INT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id)   REFERENCES topics(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  quiz_set_id     INT NOT NULL,
  question_text   VARCHAR(1000) NOT NULL,
  option_a        VARCHAR(500) NOT NULL,
  option_b        VARCHAR(500) NOT NULL,
  option_c        VARCHAR(500) NULL,
  option_d        VARCHAR(500) NULL,
  correct_option  ENUM('a','b','c','d') NOT NULL,
  order_index     INT NOT NULL DEFAULT 0,
  FOREIGN KEY (quiz_set_id) REFERENCES quiz_sets(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------
-- 4. Flashcard sets + cards
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS flashcard_sets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  topic_id    INT NOT NULL,
  title       VARCHAR(200) NOT NULL,
  created_by  INT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id)   REFERENCES topics(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS flashcards (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  flashcard_set_id INT NOT NULL,
  front_text       VARCHAR(500) NOT NULL,
  back_text        VARCHAR(1000) NOT NULL,
  order_index      INT NOT NULL DEFAULT 0,
  FOREIGN KEY (flashcard_set_id) REFERENCES flashcard_sets(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------
-- 5. Student quiz attempts + per-question answers
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  quiz_set_id     INT NOT NULL,
  student_id      INT NOT NULL,
  score           INT NOT NULL,
  total_questions INT NOT NULL,
  started_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at    TIMESTAMP NULL,
  FOREIGN KEY (quiz_set_id) REFERENCES quiz_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id)  REFERENCES users(id)     ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  attempt_id       INT NOT NULL,
  question_id      INT NOT NULL,
  selected_option  ENUM('a','b','c','d') NULL,
  is_correct       TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (attempt_id)  REFERENCES quiz_attempts(id)  ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------
-- 6. Flashcard review progress (lightweight: cards seen so far)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS flashcard_progress (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  flashcard_set_id  INT NOT NULL,
  student_id        INT NOT NULL,
  cards_reviewed     INT NOT NULL DEFAULT 0,
  last_reviewed_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_set_student (flashcard_set_id, student_id),
  FOREIGN KEY (flashcard_set_id) REFERENCES flashcard_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id)       REFERENCES users(id)          ON DELETE CASCADE
);
