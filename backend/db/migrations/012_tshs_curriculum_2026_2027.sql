-- =========================================================
-- MENTORAE SIS - Migration 012: Official TSHS Curriculum SY 2026-2027
-- Updates academic year, terms, and syncs official subjects roster.
-- =========================================================

-- 1. Update system settings to SY 2026-2027 and 1st Term
INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('school_year', '2026 - 2027'),
  ('current_semester', '1st Term'),
  ('current_quarter', '1st Term')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- 2. Expand schedules.quarter column to support term strings
ALTER TABLE schedules MODIFY COLUMN quarter VARCHAR(50) NOT NULL DEFAULT '1st Term';

-- 3. Ensure strands exist
INSERT INTO strands (code, title, department) VALUES
  ('STEM', 'Science, Technology, Engineering, and Mathematics', 'Academic Track'),
  ('ABM', 'Accountancy, Business, and Management', 'Academic Track'),
  ('HUMSS', 'Humanities and Social Sciences', 'Academic Track'),
  ('TVL', 'Technical-Vocational-Livelihood Track', 'TVL Track'),
  ('HE', 'Home Economics', 'TVL Track')
ON DUPLICATE KEY UPDATE title = VALUES(title);
