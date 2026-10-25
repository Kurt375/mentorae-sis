-- Migration 019: Add proof file attachment columns to excuse_notes
-- Mentorae SIS

ALTER TABLE excuse_notes
  ADD COLUMN IF NOT EXISTS proof_file_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS proof_file_type VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS proof_file_size INT NULL,
  ADD COLUMN IF NOT EXISTS proof_file_data MEDIUMTEXT NULL;
