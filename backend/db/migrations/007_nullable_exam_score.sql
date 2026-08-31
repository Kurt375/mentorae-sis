-- =========================================================
-- MENTORAE SIS - Migration 007: make exam_score nullable
-- Run after 006_promotion_graduation.sql.
--
-- WHY: exam_score previously defaulted to 0, and the predictive-risk
-- and prescriptive-path features used "exam_score = 0" as a proxy for
-- "the exam hasn't been recorded yet." That's ambiguous with a real,
-- legitimate exam score of 0 (e.g. a missed or failed exam) -- a
-- student in that situation would be permanently (and incorrectly)
-- treated as "still in progress" instead of getting their real,
-- final (and lowest-possible) risk classification.
--
-- This migration lets the database distinguish the two cases going
-- forward. It CANNOT retroactively fix existing rows where a 0 was
-- stored -- that ambiguity already happened. New/updated rows saved
-- through the app going forward will store NULL until a teacher
-- actually enters an exam score.
-- =========================================================
USE railway;

ALTER TABLE grades
  MODIFY COLUMN exam_score DECIMAL(5,2) NULL DEFAULT NULL;
