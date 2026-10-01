-- =========================================================
-- MENTORAE SIS - Migration 009: topic_requests and topics
-- content payload, recommendation support.
-- =========================================================
USE railway;

-- 1. Extend topic_requests to store attached files, quizzes, flashcards, and visibility
ALTER TABLE topic_requests ADD COLUMN IF NOT EXISTS content_payload LONGTEXT NULL;

-- 2. Extend topics to store content payload, recommendations, comments, and colors
ALTER TABLE topics ADD COLUMN IF NOT EXISTS content_payload LONGTEXT NULL;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS is_recommendation TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS comment VARCHAR(500) NULL;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS color VARCHAR(50) NULL DEFAULT 'bg-card-purple';
