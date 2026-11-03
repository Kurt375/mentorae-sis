-- Migration 020: High-Impact Performance Indexes
-- Mentorae SIS - Optimizes frequent WHERE, JOIN, and ORDER BY queries to drastically reduce TiDB Request Units (RUs)

-- 1. Attendance lookups: daily attendance counts, status checks, date-based summaries
CREATE INDEX IF NOT EXISTS idx_attendance_scan_date_status ON attendance_logs (scan_date, status);
CREATE INDEX IF NOT EXISTS idx_attendance_date_student ON attendance_logs (scan_date, student_id);

-- 2. User lookups: filter by role and active status, section lookups
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users (role, is_active);
CREATE INDEX IF NOT EXISTS idx_users_section_role ON users (section_id, role, is_active);

-- 3. Schedule lookups: weekly and daily timetable queries
CREATE INDEX IF NOT EXISTS idx_schedules_section_day ON schedules (section_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_schedules_teacher_day ON schedules (teacher_id, day_of_week);

-- 4. Announcements: date sorting and audience filtering
CREATE INDEX IF NOT EXISTS idx_announcements_audience_date ON announcements (audience, event_date);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements (created_at DESC);

-- 5. Audit & Activity logs: reverse chronological feeds
CREATE INDEX IF NOT EXISTS idx_login_audit_created ON login_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_student_date ON activity_log (student_id, created_at DESC);

