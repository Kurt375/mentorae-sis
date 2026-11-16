-- =========================================================
-- MENTORAE SIS - Migration 022: Nullable Grade Components & Stored Real-Time Running Average
-- 
-- WHY:
-- 1. average was previously defined as:
--    GENERATED ALWAYS AS (quiz_score + activity_score + exam_score) STORED.
--    This had two major limitations:
--    a) If any component was NULL (e.g. exam not taken yet), NULL + number
--       evaluated to NULL in MySQL, preventing real-time running grades.
--    b) It could not support Dynamic Category Re-weighting based on
--       subject classification (Core 20/50/30, Applied 25/45/30, Specialized 20/60/20).
-- 
-- 2. Converting average to a standard DECIMAL(5,2) NULL column lets the
--    backend calculate and store the true, dynamically re-weighted DepEd
--    running transmuted grade directly.
-- 
-- 3. quiz_score (Written Works) and activity_score (Performance Tasks)
--    previously defaulted to 0. They must be nullable so that upcoming/ungraded
--    items are stored as NULL rather than dragging down a student's grade.
-- =========================================================

-- Step 1: Remove generated dependency by converting average to standard decimal column first
ALTER TABLE grades
  MODIFY COLUMN average DECIMAL(5,2) NULL DEFAULT NULL;

-- Step 2: Make quiz_score and activity_score nullable
ALTER TABLE grades
  MODIFY COLUMN quiz_score DECIMAL(5,2) NULL DEFAULT NULL,
  MODIFY COLUMN activity_score DECIMAL(5,2) NULL DEFAULT NULL;
