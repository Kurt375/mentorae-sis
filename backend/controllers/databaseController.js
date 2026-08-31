const pool = require('../config/db');
const mysql = require('mysql2');

// Tables in parent-before-child order (informational only — restore disables
// FK checks, so exact order isn't load-bearing, but keeps the dump readable
// and matches db/schema.sql + migrations 002-005).
const BACKUP_TABLES = [
  'strands', 'sections', 'subjects', 'users', 'parent_student_links',
  'password_resets', 'scanner_keys', 'schedules', 'attendance_logs', 'grades',
  'badge_catalog', 'student_badges', 'activity_log', 'announcements',
  'login_audit', 'system_settings', 'notifications',
  'lesson_modules', 'lesson_module_files', 'lesson_module_file_versions',
  'topics', 'topic_requests', 'quiz_sets', 'quiz_questions',
  'flashcard_sets', 'flashcards', 'quiz_attempts', 'quiz_attempt_answers',
  'flashcard_progress',
];

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /api/database/students — Name / ID Number / Strand / Email table */
async function browseStudents(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT u.first_name, u.middle_initial, u.last_name, u.id_number, u.email, st.code AS strandCode
       FROM users u
       LEFT JOIN sections s ON s.id = u.section_id
       LEFT JOIN strands st ON st.id = s.strand_id
       WHERE u.role = 'student'
       ORDER BY u.last_name LIMIT 200`
    );
    const records = rows.map((r) => ({
      f1: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
      f2: r.id_number,
      f3: r.strandCode || '—',
      f4: r.email,
    }));
    return res.json({ success: true, headers: ['Name', 'ID Number', 'Strand', 'Email'], records });
  } catch (err) {
    console.error('browseStudents error:', err);
    return res.status(500).json({ success: false, message: 'Could not load students.' });
  }
}

/** GET /api/database/subjects — Subject Code / Name / Classification / Hours */
async function browseSubjects(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM subjects ORDER BY name');
    const records = rows.map((r) => ({
      f1: r.code,
      f2: r.name,
      f3: r.classification,
      f4: `${r.hours_per_sem} Hours`,
    }));
    return res.json({ success: true, headers: ['Subject Code', 'Subject Name', 'Classification', 'Hours/Sem'], records });
  } catch (err) {
    console.error('browseSubjects error:', err);
    return res.status(500).json({ success: false, message: 'Could not load subjects.' });
  }
}

/** GET /api/database/strands — Track Code / Strand Title / Department / Active Enrollees */
async function browseStrands(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT st.code, st.title, st.department,
              (SELECT COUNT(*) FROM users u JOIN sections s ON s.id = u.section_id WHERE s.strand_id = st.id AND u.role = 'student') AS enrollees
       FROM strands st ORDER BY st.code`
    );
    const records = rows.map((r) => ({
      f1: r.code,
      f2: r.title,
      f3: r.department,
      f4: `${r.enrollees} Students`,
    }));
    return res.json({ success: true, headers: ['Track Code', 'Strand Title', 'Department', 'Active Enrollees'], records });
  } catch (err) {
    console.error('browseStrands error:', err);
    return res.status(500).json({ success: false, message: 'Could not load strands.' });
  }
}

/* ===================== CSV EXPORTS (Objective 3.3) ===================== */

/** GET /api/database/students/export.csv */
async function exportStudentsCSV(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT u.first_name, u.middle_initial, u.last_name, u.id_number, u.email,
              st.code AS strandCode, sec.name AS sectionName
       FROM users u
       LEFT JOIN sections s ON s.id = u.section_id
       LEFT JOIN sections sec ON sec.id = u.section_id
       LEFT JOIN strands st ON st.id = s.strand_id
       WHERE u.role = 'student'
       ORDER BY u.last_name`
    );
    let csv = 'First Name,M.I.,Last Name,ID Number,Email,Strand,Section\n';
    rows.forEach((r) => {
      csv += [r.first_name, r.middle_initial || '', r.last_name, r.id_number, r.email, r.strandCode || '', r.sectionName || '']
        .map(csvEscape).join(',') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students-export.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('exportStudentsCSV error:', err);
    return res.status(500).json({ success: false, message: 'Could not export students.' });
  }
}

/** GET /api/database/subjects/export.csv */
async function exportSubjectsCSV(req, res) {
  try {
    const [rows] = await pool.query('SELECT code, name, classification, hours_per_sem FROM subjects ORDER BY name');
    let csv = 'Subject Code,Subject Name,Classification,Hours/Sem\n';
    rows.forEach((r) => {
      csv += [r.code, r.name, r.classification, r.hours_per_sem].map(csvEscape).join(',') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="subjects-export.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('exportSubjectsCSV error:', err);
    return res.status(500).json({ success: false, message: 'Could not export subjects.' });
  }
}

/** GET /api/database/strands/export.csv */
async function exportStrandsCSV(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT st.code, st.title, st.department,
              (SELECT COUNT(*) FROM users u JOIN sections s ON s.id = u.section_id WHERE s.strand_id = st.id AND u.role = 'student') AS enrollees
       FROM strands st ORDER BY st.code`
    );
    let csv = 'Track Code,Strand Title,Department,Active Enrollees\n';
    rows.forEach((r) => {
      csv += [r.code, r.title, r.department, r.enrollees].map(csvEscape).join(',') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="strands-export.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('exportStrandsCSV error:', err);
    return res.status(500).json({ success: false, message: 'Could not export strands.' });
  }
}

/* ================== DATABASE BACKUP / RESTORE (FR-023, FR-024) ==================
 * Data-only backup (schema itself lives in db/schema.sql + migrations under
 * version control, so it isn't re-dumped here). The backup file is plain SQL:
 * for each table, a DELETE + a batch of INSERTs, wrapped with FK checks
 * disabled so table order doesn't matter on restore.
 * Restore ONLY accepts files produced by this same backup endpoint — it
 * requires the exact "-- MENTORAE_BACKUP_V1" header, and callers must also
 * pass confirm: "RESTORE" so this can't be triggered by an accidental click.
 */

const BACKUP_HEADER = '-- MENTORAE_BACKUP_V1';

/** GET /api/database/backup — streams a .sql file. Admin only. */
async function backupDatabase(req, res) {
  try {
    const lines = [BACKUP_HEADER, `-- Generated ${new Date().toISOString()}`, 'SET FOREIGN_KEY_CHECKS=0;', ''];

    for (const table of BACKUP_TABLES) {
      const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
      lines.push(`-- Table: ${table} (${rows.length} rows)`);
      lines.push(`DELETE FROM \`${table}\`;`);
      if (rows.length) {
        const columns = Object.keys(rows[0]);
        const colList = columns.map((c) => `\`${c}\``).join(', ');
        for (const row of rows) {
          const values = columns.map((c) => mysql.escape(row[c])).join(', ');
          lines.push(`INSERT INTO \`${table}\` (${colList}) VALUES (${values});`);
        }
      }
      lines.push('');
    }
    lines.push('SET FOREIGN_KEY_CHECKS=1;');

    const sqlDump = lines.join('\n');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="mentorae-backup-${stamp}.sql"`);
    return res.send(sqlDump);
  } catch (err) {
    console.error('backupDatabase error:', err);
    return res.status(500).json({ success: false, message: 'Backup failed.' });
  }
}

/**
 * POST /api/database/restore  (multipart form, field name "backupFile")
 * Body must also include confirm: "RESTORE".
 * Admin only. Runs inside a transaction — any failure rolls back the whole
 * restore, so a bad file cannot leave the database half-overwritten.
 */
async function restoreDatabase(req, res) {
  if (req.body.confirm !== 'RESTORE') {
    return res.status(400).json({ success: false, message: 'Restore was not confirmed. Nothing was changed.' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No backup file was uploaded.' });
  }

  const sqlText = req.file.buffer.toString('utf8');
  if (!sqlText.startsWith(BACKUP_HEADER)) {
    return res.status(400).json({
      success: false,
      message: 'This file was not recognized as a Mentorae backup. Only .sql files produced by this system\'s own Backup Now button can be restored.',
    });
  }

  // Split into individual statements. Our own dump never contains semicolons
  // inside string values in a way that would break this (mysql.escape()
  // always produces a single-quoted literal), so a plain split on ";\n" is safe.
  const statements = sqlText
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const stmt of statements) {
      await conn.query(stmt);
    }
    await conn.commit();
    return res.json({ success: true, message: `Restore complete. ${statements.length} statements applied.` });
  } catch (err) {
    await conn.rollback();
    console.error('restoreDatabase error:', err);
    return res.status(500).json({ success: false, message: `Restore failed and was rolled back: ${err.message}` });
  } finally {
    conn.release();
  }
}

module.exports = {
  browseStudents,
  browseSubjects,
  browseStrands,
  exportStudentsCSV,
  exportSubjectsCSV,
  exportStrandsCSV,
  backupDatabase,
  restoreDatabase,
};
