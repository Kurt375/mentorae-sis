-- Migration 015: Add review_remarks to excuse_notes
-- Mentorae SIS

ALTER TABLE excuse_notes ADD COLUMN IF NOT EXISTS review_remarks TEXT NULL;
