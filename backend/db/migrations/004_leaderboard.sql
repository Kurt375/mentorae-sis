-- =========================================================
-- MENTORAE SIS - Migration 004: badge points + leaderboard support
-- Run after 003_lesson_modules.sql.
-- =========================================================
USE mentorae_sis;

ALTER TABLE badge_catalog
  ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 10 AFTER name;

-- Sensible starting point values — harder/rarer-feeling badges score higher.
-- Adjust freely; the leaderboard just sums whatever's here.
UPDATE badge_catalog SET points = 15 WHERE id = 'top_scorer';
UPDATE badge_catalog SET points = 10 WHERE id = 'most_active';
UPDATE badge_catalog SET points = 15 WHERE id = 'innovative_thinker';
UPDATE badge_catalog SET points = 20 WHERE id = 'team_captain';
UPDATE badge_catalog SET points = 15 WHERE id = 'resilient_thinker';
UPDATE badge_catalog SET points = 10 WHERE id = 'completed_grades';
UPDATE badge_catalog SET points = 10 WHERE id = 'recitation_master';
UPDATE badge_catalog SET points = 15 WHERE id = 'critical_thinker';
UPDATE badge_catalog SET points = 20 WHERE id = 'coacher';
UPDATE badge_catalog SET points = 25 WHERE id = 'top_performer';
