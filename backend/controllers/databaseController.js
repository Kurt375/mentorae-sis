const pool = require('../config/db');
const mysql = require('mysql2');
const XLSX = require('xlsx');

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
  'flashcard_progress', 'topic_quiz_attempts',
];

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sendDataExport(res, { headers, dataRows, filenameBase, format = 'csv', sheetName = 'Records', colWidths = [] }) {
  const isXlsx = format === 'xlsx' || format === 'excel';
  if (isXlsx) {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    if (colWidths.length) ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
    return res.send(buffer);
  }

  // CSV
  let csv = headers.map(csvEscape).join(',') + '\n';
  dataRows.forEach((r) => {
    csv += r.map(csvEscape).join(',') + '\n';
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
  return res.send(csv);
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

function formatSubjectTerm(quarter) {
  if (quarter === 0) return 'All Terms';
  if (quarter === 2) return '2nd Term';
  if (quarter === 3) return '3rd Term';
  return '1st Term';
}

/** GET /api/database/subjects — Subject Code / Name / Classification / Term */
async function browseSubjects(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM subjects ORDER BY name');
    const records = rows.map((r) => ({
      f1: r.code,
      f2: r.name,
      f3: r.classification,
      f4: formatSubjectTerm(r.quarter),
    }));
    return res.json({ success: true, headers: ['Subject Code', 'Subject Name', 'Classification', 'Term'], records });
  } catch (err) {
    console.error('browseSubjects error:', err);
    return res.status(500).json({ success: false, message: 'Could not load subjects.' });
  }
}

/** GET /api/database/strands — Track Code / Strand Title / Department / Active Enrollees */
async function browseStrands(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT st.id, st.code, st.title, st.department,
              (SELECT COUNT(*) FROM users u JOIN sections s ON s.id = u.section_id WHERE s.strand_id = st.id AND u.role = 'student') AS enrollees
       FROM strands st ORDER BY st.code`
    );
    const records = rows.map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      department: r.department,
      enrollees: r.enrollees,
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

/** GET /api/database/sections — Section Name / Strand / Grade Level / Class Adviser / Enrolled Students */
async function browseSections(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT s.id, s.name, s.grade_level, s.strand_id, s.adviser_id,
              st.code AS strandCode, st.title AS strandTitle,
              adv.first_name AS advFirst, adv.middle_initial AS advMiddle, adv.last_name AS advLast,
              (SELECT COUNT(*) FROM users u WHERE u.section_id = s.id AND u.role = 'student') AS enrollees
       FROM sections s
       JOIN strands st ON st.id = s.strand_id
       LEFT JOIN users adv ON adv.id = s.adviser_id
       ORDER BY st.code ASC, s.grade_level ASC, s.name ASC`
    );
    const records = rows.map((r) => {
      const adviserName = r.advLast
        ? `${r.advFirst} ${r.advMiddle ? r.advMiddle + ' ' : ''}${r.advLast}`
        : 'Unassigned';
      return {
        id: r.id,
        name: r.name,
        strandId: r.strand_id,
        strandCode: r.strandCode,
        strandTitle: r.strandTitle,
        gradeLevel: r.grade_level,
        adviserId: r.adviser_id,
        adviserName,
        enrollees: r.enrollees,
        f1: r.name,
        f2: `${r.strandCode} - ${r.strandTitle}`,
        f3: `Grade ${r.grade_level}`,
        f4: adviserName,
        f5: `${r.enrollees} Students`,
      };
    });
    return res.json({
      success: true,
      headers: ['Section Name', 'Strand', 'Grade Level', 'Class Adviser', 'Active Enrollees'],
      records,
    });
  } catch (err) {
    console.error('browseSections error:', err);
    return res.status(500).json({ success: false, message: 'Could not load sections.' });
  }
}

/** GET /api/database/advisers — Teachers available for class adviser assignment */
async function browseAdvisers(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, first_name, middle_initial, last_name, email, id_number
       FROM users
       WHERE role = 'teacher'
       ORDER BY last_name ASC, first_name ASC`
    );
    const advisers = rows.map((t) => ({
      id: t.id,
      name: `${t.first_name} ${t.middle_initial ? t.middle_initial + ' ' : ''}${t.last_name}`,
      email: t.email,
      idNumber: t.id_number,
    }));
    return res.json({ success: true, advisers });
  } catch (err) {
    console.error('browseAdvisers error:', err);
    return res.status(500).json({ success: false, message: 'Could not load advisers.' });
  }
}

/** POST /api/database/sections — Create a new section */
async function createSection(req, res) {
  const { name, strandId, gradeLevel, adviserId } = req.body;
  if (!name || !strandId || !gradeLevel) {
    return res.status(400).json({ success: false, message: 'Section name, strand, and grade level are required.' });
  }

  try {
    const cleanName = name.trim();
    const gLevel = parseInt(gradeLevel, 10);
    const sId = parseInt(strandId, 10);
    const advId = adviserId && !isNaN(parseInt(adviserId, 10)) ? parseInt(adviserId, 10) : null;

    const [existing] = await pool.query(
      'SELECT id FROM sections WHERE strand_id = ? AND grade_level = ? AND name = ? LIMIT 1',
      [sId, gLevel, cleanName]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: `Section "${cleanName}" already exists for this strand and grade level.` });
    }

    const [result] = await pool.query(
      'INSERT INTO sections (strand_id, grade_level, name, adviser_id) VALUES (?, ?, ?, ?)',
      [sId, gLevel, cleanName, advId]
    );

    return res.status(201).json({
      success: true,
      sectionId: result.insertId,
      message: `Section "${cleanName}" created successfully.`
    });
  } catch (err) {
    console.error('createSection error:', err);
    return res.status(500).json({ success: false, message: 'Could not create section.' });
  }
}

/** PUT /api/database/sections/:id — Update existing section */
async function updateSection(req, res) {
  const sectionId = req.params.id;
  const { name, strandId, gradeLevel, adviserId } = req.body;
  if (!sectionId || !name || !strandId || !gradeLevel) {
    return res.status(400).json({ success: false, message: 'Section ID, name, strand, and grade level are required.' });
  }

  try {
    const cleanName = name.trim();
    const gLevel = parseInt(gradeLevel, 10);
    const sId = parseInt(strandId, 10);
    const advId = adviserId && !isNaN(parseInt(adviserId, 10)) ? parseInt(adviserId, 10) : null;

    const [target] = await pool.query('SELECT id FROM sections WHERE id = ?', [sectionId]);
    if (target.length === 0) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    const [dup] = await pool.query(
      'SELECT id FROM sections WHERE strand_id = ? AND grade_level = ? AND name = ? AND id != ? LIMIT 1',
      [sId, gLevel, cleanName, sectionId]
    );
    if (dup.length > 0) {
      return res.status(409).json({ success: false, message: `Another section named "${cleanName}" already exists for this strand and grade.` });
    }

    await pool.query(
      'UPDATE sections SET strand_id = ?, grade_level = ?, name = ?, adviser_id = ? WHERE id = ?',
      [sId, gLevel, cleanName, advId, sectionId]
    );

    return res.json({ success: true, message: `Section "${cleanName}" updated successfully.` });
  } catch (err) {
    console.error('updateSection error:', err);
    return res.status(500).json({ success: false, message: 'Could not update section.' });
  }
}

/** DELETE /api/database/sections/:id — Delete section with safety constraints */
async function deleteSection(req, res) {
  const sectionId = req.params.id;
  if (!sectionId) {
    return res.status(400).json({ success: false, message: 'Section ID is required.' });
  }

  try {
    const [target] = await pool.query('SELECT id, name FROM sections WHERE id = ?', [sectionId]);
    if (target.length === 0) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }
    const secName = target[0].name;

    const [stuCheck] = await pool.query(
      "SELECT COUNT(*) AS count FROM users WHERE section_id = ? AND role = 'student'",
      [sectionId]
    );
    const studentCount = stuCheck[0].count || 0;
    if (studentCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete section "${secName}" because ${studentCount} active student(s) are currently enrolled in it.`
      });
    }

    await pool.query('DELETE FROM sections WHERE id = ?', [sectionId]);
    return res.json({ success: true, message: `Section "${secName}" deleted successfully.` });
  } catch (err) {
    console.error('deleteSection error:', err);
    return res.status(500).json({ success: false, message: 'Could not delete section.' });
  }
}

/** POST /api/database/strands — Create a new strand */
async function createStrand(req, res) {
  const { code, title, department } = req.body;
  if (!code || !title) {
    return res.status(400).json({ success: false, message: 'Strand code and title are required.' });
  }

  try {
    const cleanCode = code.trim().toUpperCase();
    const cleanTitle = title.trim();
    const cleanDept = (department || 'Academic Track').trim();

    const [existing] = await pool.query('SELECT id FROM strands WHERE code = ? LIMIT 1', [cleanCode]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: `Strand code "${cleanCode}" already exists.` });
    }

    const [result] = await pool.query(
      'INSERT INTO strands (code, title, department) VALUES (?, ?, ?)',
      [cleanCode, cleanTitle, cleanDept]
    );

    return res.status(201).json({
      success: true,
      strandId: result.insertId,
      message: `Strand ${cleanCode} created successfully.`
    });
  } catch (err) {
    console.error('createStrand error:', err);
    return res.status(500).json({ success: false, message: 'Could not create strand.' });
  }
}

/** PUT /api/database/strands/:id — Update existing strand */
async function updateStrand(req, res) {
  const strandId = req.params.id;
  const { code, title, department } = req.body;

  if (!strandId) {
    return res.status(400).json({ success: false, message: 'Strand ID is required.' });
  }
  if (!code || !title) {
    return res.status(400).json({ success: false, message: 'Strand code and title are required.' });
  }

  try {
    const cleanCode = code.trim().toUpperCase();
    const cleanTitle = title.trim();
    const cleanDept = (department || 'Academic Track').trim();

    // Check if target strand exists
    const [target] = await pool.query('SELECT id FROM strands WHERE id = ?', [strandId]);
    if (target.length === 0) {
      return res.status(404).json({ success: false, message: 'Strand not found.' });
    }

    // Check for duplicate code in another strand
    const [dup] = await pool.query('SELECT id FROM strands WHERE code = ? AND id != ? LIMIT 1', [cleanCode, strandId]);
    if (dup.length > 0) {
      return res.status(409).json({ success: false, message: `Strand code "${cleanCode}" is already in use by another strand.` });
    }

    await pool.query(
      'UPDATE strands SET code = ?, title = ?, department = ? WHERE id = ?',
      [cleanCode, cleanTitle, cleanDept, strandId]
    );

    return res.json({ success: true, message: `Strand ${cleanCode} updated successfully.` });
  } catch (err) {
    console.error('updateStrand error:', err);
    return res.status(500).json({ success: false, message: 'Could not update strand.' });
  }
}

/** DELETE /api/database/strands/:id — Delete strand with safety constraints */
async function deleteStrand(req, res) {
  const strandId = req.params.id;
  if (!strandId) {
    return res.status(400).json({ success: false, message: 'Strand ID is required.' });
  }

  try {
    const [target] = await pool.query('SELECT id, code, title FROM strands WHERE id = ?', [strandId]);
    if (target.length === 0) {
      return res.status(404).json({ success: false, message: 'Strand not found.' });
    }
    const strand = target[0];

    // Check for existing sections or student enrollees
    const [secCheck] = await pool.query('SELECT COUNT(*) AS count FROM sections WHERE strand_id = ?', [strandId]);
    const sectionCount = secCheck[0].count || 0;

    const [stuCheck] = await pool.query(
      "SELECT COUNT(*) AS count FROM users u JOIN sections s ON s.id = u.section_id WHERE s.strand_id = ? AND u.role = 'student'",
      [strandId]
    );
    const studentCount = stuCheck[0].count || 0;

    if (sectionCount > 0 || studentCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete "${strand.code}": It currently has ${sectionCount} section(s) and ${studentCount} active student(s) assigned. Please reassign or remove them first.`
      });
    }

    await pool.query('DELETE FROM strands WHERE id = ?', [strandId]);

    return res.json({ success: true, message: `Strand "${strand.code}" was deleted successfully.` });
  } catch (err) {
    console.error('deleteStrand error:', err);
    return res.status(500).json({ success: false, message: 'Could not delete strand.' });
  }
}

/* ===================== DATA EXPORTS (CSV & XLSX) ===================== */

/** GET /api/database/students/export.(csv|xlsx) */
async function exportStudentsCSV(req, res) {
  try {
    const format = req.path.endsWith('.xlsx') || req.query.format === 'xlsx' ? 'xlsx' : 'csv';
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
    const headers = ['First Name', 'M.I.', 'Last Name', 'ID Number', 'Email', 'Strand', 'Section'];
    const dataRows = rows.map((r) => [
      r.first_name || '',
      r.middle_initial || '',
      r.last_name || '',
      r.id_number || '',
      r.email || '',
      r.strandCode || '',
      r.sectionName || '',
    ]);
    return sendDataExport(res, {
      headers,
      dataRows,
      filenameBase: 'students-export',
      format,
      sheetName: 'Students',
      colWidths: [{ wch: 15 }, { wch: 8 }, { wch: 18 }, { wch: 16 }, { wch: 26 }, { wch: 12 }, { wch: 15 }],
    });
  } catch (err) {
    console.error('exportStudentsCSV error:', err);
    return res.status(500).json({ success: false, message: 'Could not export students.' });
  }
}

/** GET /api/database/subjects/export.(csv|xlsx) */
async function exportSubjectsCSV(req, res) {
  try {
    const format = req.path.endsWith('.xlsx') || req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const [rows] = await pool.query('SELECT code, name, classification, quarter FROM subjects ORDER BY name');
    const headers = ['Subject Code', 'Subject Name', 'Classification', 'Term'];
    const dataRows = rows.map((r) => [
      r.code || '',
      r.name || '',
      r.classification || '',
      formatSubjectTerm(r.quarter),
    ]);
    return sendDataExport(res, {
      headers,
      dataRows,
      filenameBase: 'subjects-export',
      format,
      sheetName: 'Subjects',
      colWidths: [{ wch: 16 }, { wch: 32 }, { wch: 18 }, { wch: 14 }],
    });
  } catch (err) {
    console.error('exportSubjectsCSV error:', err);
    return res.status(500).json({ success: false, message: 'Could not export subjects.' });
  }
}

/** GET /api/database/strands/export.(csv|xlsx) */
async function exportStrandsCSV(req, res) {
  try {
    const format = req.path.endsWith('.xlsx') || req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const [rows] = await pool.query(
      `SELECT st.code, st.title, st.department,
              (SELECT COUNT(*) FROM users u JOIN sections s ON s.id = u.section_id WHERE s.strand_id = st.id AND u.role = 'student') AS enrollees
       FROM strands st ORDER BY st.code`
    );
    const headers = ['Track Code', 'Strand Title', 'Department', 'Active Enrollees'];
    const dataRows = rows.map((r) => [
      r.code || '',
      r.title || '',
      r.department || '',
      r.enrollees || 0,
    ]);
    return sendDataExport(res, {
      headers,
      dataRows,
      filenameBase: 'strands-export',
      format,
      sheetName: 'Strands',
      colWidths: [{ wch: 14 }, { wch: 35 }, { wch: 22 }, { wch: 16 }],
    });
  } catch (err) {
    console.error('exportStrandsCSV error:', err);
    return res.status(500).json({ success: false, message: 'Could not export strands.' });
  }
}

/** GET /api/database/sections/export.(csv|xlsx) */
async function exportSectionsCSV(req, res) {
  try {
    const format = req.path.endsWith('.xlsx') || req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const [rows] = await pool.query(
      `SELECT s.name, s.grade_level, st.code AS strandCode, st.title AS strandTitle,
              adv.first_name AS advFirst, adv.middle_initial AS advMiddle, adv.last_name AS advLast,
              (SELECT COUNT(*) FROM users u WHERE u.section_id = s.id AND u.role = 'student') AS enrollees
       FROM sections s
       JOIN strands st ON st.id = s.strand_id
       LEFT JOIN users adv ON adv.id = s.adviser_id
       ORDER BY st.code ASC, s.grade_level ASC, s.name ASC`
    );
    const headers = ['Section Name', 'Strand Code', 'Strand Title', 'Grade Level', 'Class Adviser', 'Active Enrollees'];
    const dataRows = rows.map((r) => [
      r.name || '',
      r.strandCode || '',
      r.strandTitle || '',
      `Grade ${r.grade_level}`,
      r.advLast ? `${r.advFirst} ${r.advMiddle ? r.advMiddle + ' ' : ''}${r.advLast}` : 'Unassigned',
      r.enrollees || 0,
    ]);
    return sendDataExport(res, {
      headers,
      dataRows,
      filenameBase: 'sections-export',
      format,
      sheetName: 'Sections',
      colWidths: [{ wch: 25 }, { wch: 14 }, { wch: 35 }, { wch: 14 }, { wch: 25 }, { wch: 16 }],
    });
  } catch (err) {
    console.error('exportSectionsCSV error:', err);
    return res.status(500).json({ success: false, message: 'Could not export sections.' });
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

/** GET /api/database/login-logs — User / Role / Status / IP / Timestamp */
async function browseLoginLogs(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT la.id, la.id_number, la.success, la.ip_address, la.created_at,
              u.first_name, u.middle_initial, u.last_name, u.role, u.email
       FROM login_audit la
       LEFT JOIN users u ON u.id = la.user_id
       ORDER BY la.created_at DESC
       LIMIT 250`
    );

    const records = rows.map((r) => {
      let displayName = r.id_number || 'Unknown Identity';
      if (r.first_name || r.last_name) {
        const mi = r.middle_initial ? ` ${r.middle_initial}.` : '';
        displayName = `${r.first_name || ''}${mi} ${r.last_name || ''}`.trim();
        if (r.id_number) displayName += ` (${r.id_number})`;
      }

      const role = r.role ? r.role.toUpperCase() : 'EXTERNAL / GUEST';
      const status = r.success ? 'Success' : 'Failed';
      const ip = r.ip_address || '—';
      const dt = r.created_at ? new Date(r.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
      }) : '—';

      return {
        id: r.id,
        user: displayName,
        role: role,
        success: Boolean(r.success),
        status: status,
        ip: ip,
        timestamp: dt,
        f1: displayName,
        f2: role,
        f3: status,
        f4: ip,
        f5: dt,
      };
    });

    return res.json({
      success: true,
      headers: ['User / Account', 'Role', 'Status', 'IP Address', 'Date & Time'],
      records,
    });
  } catch (err) {
    console.error('browseLoginLogs error:', err);
    return res.status(500).json({ success: false, message: 'Could not load login audit logs.' });
  }
}

/** GET /api/database/login-logs/export.(csv|xlsx) */
async function exportLoginLogsCSV(req, res) {
  try {
    const format = req.path.endsWith('.xlsx') || req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const [rows] = await pool.query(
      `SELECT la.id_number, la.success, la.ip_address, la.created_at,
              u.first_name, u.middle_initial, u.last_name, u.role, u.email
       FROM login_audit la
       LEFT JOIN users u ON u.id = la.user_id
       ORDER BY la.created_at DESC
       LIMIT 1000`
    );

    const headers = ['Timestamp', 'ID Number', 'User Name', 'Role', 'Status', 'IP Address'];
    const dataRows = rows.map((r) => {
      const mi = r.middle_initial ? ` ${r.middle_initial}.` : '';
      const name = (r.first_name || r.last_name) ? `${r.first_name || ''}${mi} ${r.last_name || ''}`.trim() : '';
      const status = r.success ? 'Success' : 'Failed Attempt';
      const dt = r.created_at ? new Date(r.created_at).toISOString() : '';
      return [dt, r.id_number || '', name, r.role || 'unknown', status, r.ip_address || ''];
    });

    return sendDataExport(res, {
      headers,
      dataRows,
      filenameBase: 'login-audit-logs-export',
      format,
      sheetName: 'Login Logs',
      colWidths: [{ wch: 25 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 18 }],
    });
  } catch (err) {
    console.error('exportLoginLogsCSV error:', err);
    return res.status(500).json({ success: false, message: 'Could not export login audit logs.' });
  }
}

/** GET /api/database/login-logs/archive-check?days=60 */
async function checkArchiveEligibility(req, res) {
  try {
    const days = Math.max(1, parseInt(req.query.days, 10) || 60);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [rows] = await pool.query(
      'SELECT COUNT(*) as count FROM login_audit WHERE created_at < ?',
      [cutoff]
    );

    return res.json({
      success: true,
      days,
      cutoffDate: cutoff.toISOString(),
      eligibleCount: rows[0].count || 0
    });
  } catch (err) {
    console.error('checkArchiveEligibility error:', err);
    return res.status(500).json({ success: false, message: 'Could not check archive eligibility.' });
  }
}

/** GET /api/database/login-logs/archive.csv?days=60 */
async function exportArchivedLoginLogsCSV(req, res) {
  try {
    const days = Math.max(1, parseInt(req.query.days, 10) || 60);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [rows] = await pool.query(
      `SELECT la.id_number, la.success, la.ip_address, la.created_at,
              u.first_name, u.middle_initial, u.last_name, u.role, u.email
       FROM login_audit la
       LEFT JOIN users u ON u.id = la.user_id
       WHERE la.created_at < ?
       ORDER BY la.created_at ASC`,
      [cutoff]
    );

    const format = (req.query.format || '').toLowerCase();
    const isXlsx = format === 'xlsx' || format === 'excel' || (req.query.customName && req.query.customName.toLowerCase().endsWith('.xlsx'));
    const stamp = new Date().toISOString().slice(0, 10);

    if (isXlsx) {
      const headers = ['Timestamp', 'ID Number', 'User Name', 'Role', 'Status', 'IP Address'];
      const dataRows = rows.map((r) => {
        const mi = r.middle_initial ? ` ${r.middle_initial}.` : '';
        const name = (r.first_name || r.last_name) ? `${r.first_name || ''}${mi} ${r.last_name || ''}`.trim() : '';
        const status = r.success ? 'Success' : 'Failed Attempt';
        const dt = r.created_at ? new Date(r.created_at).toISOString() : '';
        return [dt, r.id_number || '', name, r.role || 'unknown', status, r.ip_address || ''];
      });

      let filename = `Mentorae_Logs_Archive_OlderThan_${days}Days_${stamp}.xlsx`;
      if (req.query.customName) {
        const sanitized = req.query.customName.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (sanitized) {
          filename = sanitized.toLowerCase().endsWith('.xlsx')
            ? sanitized
            : `${sanitized.replace(/\.csv$/i, '')}.xlsx`;
        }
      }

      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      ws['!cols'] = [
        { wch: 25 }, // Timestamp
        { wch: 16 }, // ID Number
        { wch: 24 }, // User Name
        { wch: 14 }, // Role
        { wch: 16 }, // Status
        { wch: 18 }, // IP Address
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Login Audit Logs');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    }

    let csv = 'Timestamp,ID Number,User Name,Role,Status,IP Address\n';
    rows.forEach((r) => {
      const mi = r.middle_initial ? ` ${r.middle_initial}.` : '';
      const name = (r.first_name || r.last_name) ? `${r.first_name || ''}${mi} ${r.last_name || ''}`.trim() : '';
      const status = r.success ? 'Success' : 'Failed Attempt';
      const dt = r.created_at ? new Date(r.created_at).toISOString() : '';

      csv += [dt, r.id_number || '', name, r.role || 'unknown', status, r.ip_address || '']
        .map(csvEscape).join(',') + '\n';
    });

    let filename = `Mentorae_Logs_Archive_OlderThan_${days}Days_${stamp}.csv`;
    if (req.query.customName) {
      const sanitized = req.query.customName.replace(/[^a-zA-Z0-9._-]/g, '_');
      if (sanitized) {
        filename = sanitized.toLowerCase().endsWith('.csv')
          ? sanitized
          : `${sanitized.replace(/\.xlsx$/i, '')}.csv`;
      }
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    console.error('exportArchivedLoginLogsCSV error:', err);
    return res.status(500).json({ success: false, message: 'Could not export archived login logs.' });
  }
}

/** POST /api/database/login-logs/purge */
async function purgeOldLoginLogs(req, res) {
  const { days, confirm } = req.body;
  if (confirm !== 'PURGE') {
    return res.status(400).json({ success: false, message: 'Purge was not confirmed. Nothing was deleted.' });
  }

  const numDays = Math.max(1, parseInt(days, 10) || 60);
  const cutoff = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000);

  try {
    const [countRows] = await pool.query('SELECT COUNT(*) as count FROM login_audit WHERE created_at < ?', [cutoff]);
    const deletedCount = countRows[0].count || 0;

    await pool.query('DELETE FROM login_audit WHERE created_at < ?', [cutoff]);

    return res.json({
      success: true,
      deletedCount,
      message: `Successfully purged ${deletedCount} old log record(s) older than ${numDays} days from the database.`
    });
  } catch (err) {
    console.error('purgeOldLoginLogs error:', err);
    return res.status(500).json({ success: false, message: 'Could not purge old login logs.' });
  }
}

module.exports = {
  browseStudents,
  browseSubjects,
  browseStrands,
  browseSections,
  browseAdvisers,
  browseLoginLogs,
  checkArchiveEligibility,
  exportArchivedLoginLogsCSV,
  purgeOldLoginLogs,
  createStrand,
  updateStrand,
  deleteStrand,
  createSection,
  updateSection,
  deleteSection,
  exportStudentsCSV,
  exportSubjectsCSV,
  exportStrandsCSV,
  exportSectionsCSV,
  exportLoginLogsCSV,
  backupDatabase,
  restoreDatabase,
};
