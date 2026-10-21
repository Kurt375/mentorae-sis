-- =========================================================
-- MENTORAE SIS - Migration 017: Official TSHS STEM Grade 11 Curriculum Schedules
-- Tanauan School of Fisheries Grade 11 STEM sections are
-- Medical Sciences (Section 53) and Engineering (Section 54).
-- Ensures General Mathematics schedules exist for both sections.
-- =========================================================

-- 1. Ensure General Mathematics schedule exists for teacher Princess Mel Suelto in Medical Sciences (section 53)
INSERT INTO schedules (teacher_id, subject_id, section_id, quarter, day_of_week, start_time, end_time)
SELECT 6, 11, 53, '1st Term', 'Wednesday', '08:00:00', '10:00:00'
WHERE NOT EXISTS (
  SELECT 1 FROM schedules WHERE teacher_id = 6 AND subject_id = 11 AND section_id = 53 AND quarter = '1st Term'
);

-- 2. Ensure General Mathematics schedule exists for teacher Angelica Mae Custodio in Engineering (section 54)
INSERT INTO schedules (teacher_id, subject_id, section_id, quarter, day_of_week, start_time, end_time)
SELECT 74, 11, 54, '1st Term', 'Tuesday', '08:00:00', '10:00:00'
WHERE NOT EXISTS (
  SELECT 1 FROM schedules WHERE subject_id = 11 AND section_id = 54 AND quarter = '1st Term'
);
