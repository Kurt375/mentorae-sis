-- Migration 021: SF9 Report Cards Customization and Remarks Storage
-- Mentorae SIS - Persists adviser remarks, comments, certificate of transfer, and custom report card fields

CREATE TABLE IF NOT EXISTS sf9_report_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  section_id INT NOT NULL,
  school_year VARCHAR(30) NOT NULL DEFAULT '2026-2027',
  age INT DEFAULT NULL,
  comment_term1 TEXT,
  comment_term2 TEXT,
  comment_term3 TEXT,
  cert_admitted_to_grade VARCHAR(50) DEFAULT NULL,
  cert_eligible_for_admission VARCHAR(100) DEFAULT NULL,
  canc_admitted_in VARCHAR(150) DEFAULT NULL,
  canc_date VARCHAR(50) DEFAULT NULL,
  school_head_name VARCHAR(150) DEFAULT NULL,
  adviser_name VARCHAR(150) DEFAULT NULL,
  updated_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_student_sy (student_id, school_year),
  INDEX idx_sf9_section (section_id, school_year)
);

