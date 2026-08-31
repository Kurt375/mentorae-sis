const bcrypt = require('bcrypt');
const crypto = require('crypto');
const XLSX = require('xlsx');
const pool = require('../config/db');
const { parsePagination, paginatedMeta } = require('../utils/pagination');
const { notify } = require('../utils/notifications');

/** Shared by the single-create route AND bulk import, so both always
 * generate ID numbers / emails the exact same way. */
async function nextIdNumber() {
  const year = new Date().getFullYear().toString().slice(-2);
  const [[{ count }]] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE id_number LIKE ?", [`${year}-%`]);
  let next = count + 1;
  let idNumber;
  for (let attempt = 0; attempt < 20; attempt++) {
    idNumber = `${year}-${String(next).padStart(5, '0')}`;
    const [existing] = await pool.query('SELECT 1 FROM users WHERE id_number = ?', [idNumber]);
    if (!existing[0]) break;
    next++;
  }
  return idNumber;
}

async function uniqueEmail(firstName, lastName, role) {
  const slugFirst = firstName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const slugLast = lastName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const roleSlug = role.trim().toLowerCase();
  const base = `${slugFirst}.${slugLast}@${roleSlug}.tshs.edu.ph`;
  let email = base;
  let suffix = 1;
  while (true) {
    const [existing] = await pool.query('SELECT 1 FROM users WHERE email = ?', [email]);
    if (!existing[0]) break;
    suffix++;
    email = `${slugFirst}.${slugLast}${suffix}@${roleSlug}.tshs.edu.ph`;
  }
  return email;
}

/** GET /api/users/generate-id?role=Student — next sequential ID for the current year */
async function generateId(req, res) {
  try {
    const idNumber = await nextIdNumber();
    return res.json({ success: true, idNumber });
  } catch (err) {
    console.error('generateId error:', err);
    return res.status(500).json({ success: false, message: 'Could not generate an ID number.' });
  }
}

/** GET /api/users/generate-email?firstName=&lastName=&role= */
async function generateEmail(req, res) {
  const { firstName, lastName, role } = req.query;
  if (!firstName || !lastName || !role) {
    return res.status(400).json({ success: false, message: 'firstName, lastName, and role are required.' });
  }
  try {
    const email = await uniqueEmail(firstName, lastName, role);
    return res.json({ success: true, email });
  } catch (err) {
    console.error('generateEmail error:', err);
    return res.status(500).json({ success: false, message: 'Could not generate an email.' });
  }
}

/** POST /api/users — create a user account. Uses the admin-supplied password if given, otherwise auto-generates a temporary one. */
async function createUser(req, res) {
  const { firstName, middleInitial, lastName, contactNumber, idNumber, email, role, sectionId, password, program, parentName } = req.body;

  const validRoles = ['Student', 'Teacher', 'Parent', 'Admin', 'Security'];
  const validPrograms = ['none', '4ps', 'aral'];
  if (!firstName || !lastName || !contactNumber || !idNumber || !email || !role || !validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: 'All fields are required and role must be valid.' });
  }
  const userProgram = role === 'Student' && validPrograms.includes(program) ? program : 'none';

  if (password !== undefined && password !== null && password !== '' && password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
  }

  try {
    const usingManualPassword = !!password;
    const tempPassword = usingManualPassword
      ? null
      : crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10);
    const passwordHash = await bcrypt.hash(usingManualPassword ? password : tempPassword, 10);

    const [result] = await pool.query(
      `INSERT INTO users (role, program, id_number, first_name, middle_initial, last_name, contact_number, email, password_hash, section_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        role.toLowerCase(),
        userProgram,
        idNumber,
        firstName,
        middleInitial || null,
        lastName,
        contactNumber,
        email,
        passwordHash,
        role === 'Student' ? sectionId || null : null,
      ]
    );

    // New-account notification: tells the user their account was created and
    // that they can attach a personal email (Profile page) for real-time updates.
    await notify({
      recipientId: result.insertId,
      type: 'account_created',
      title: 'Welcome to Mentorae',
      message: `Your ${role} account has been created. Go to your Profile to review your details and add a personal email for real-time updates.`,
    });

    // Student accounts can optionally be auto-linked to an existing Parent
    // account by matching the typed name -- this is how enrollment links
    // parent/child accounts now, instead of a separate manual-linking panel.
    let parentLinkMessage = null;
    if (role === 'Student' && parentName && parentName.trim()) {
      const typedName = parentName.trim().toLowerCase().replace(/\s+/g, ' ');
      const [parentMatches] = await pool.query(
        `SELECT id, first_name, last_name FROM users
         WHERE role = 'parent' AND LOWER(TRIM(CONCAT(first_name, ' ', last_name))) = ?`,
        [typedName]
      );
      if (parentMatches.length === 1) {
        await pool.query(
          'INSERT IGNORE INTO parent_student_links (parent_id, student_id) VALUES (?, ?)',
          [parentMatches[0].id, result.insertId]
        );
        parentLinkMessage = `Linked to parent account: ${parentMatches[0].first_name} ${parentMatches[0].last_name}.`;
      } else if (parentMatches.length === 0) {
        parentLinkMessage = `No parent account matching "${parentName.trim()}" was found -- the student was created, but not linked. Check the spelling, create the parent account first, or fix this later in the Parent-Student Links table.`;
      } else {
        parentLinkMessage = `More than one parent account matches "${parentName.trim()}" -- the student was created, but not automatically linked to avoid linking the wrong one. Resolve this manually in the Parent-Student Links table.`;
      }
    }

    return res.json({
      success: true,
      message: `${firstName} ${lastName} created as ${role}.`,
      // Only sent back when auto-generated — shown once, admin must share it with the new user.
      // When the admin set the password manually, nothing is echoed back.
      ...(usingManualPassword ? {} : { tempPassword }),
      ...(parentLinkMessage ? { parentLinkMessage } : {}),
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'That ID number or email is already in use.' });
    }
    console.error('createUser error:', err);
    return res.status(500).json({ success: false, message: 'Could not create user.' });
  }
}

/** GET /api/users?role=&search=&page=&limit= */
async function listUsers(req, res) {
  try {
    const { page, limit, offset } = parsePagination(req.query, { limit: 25, maxLimit: 1000 });
    const conditions = [];
    const params = [];

    if (req.query.role && req.query.role !== 'All') {
      conditions.push('role = ?');
      params.push(req.query.role.toLowerCase());
    }
    if (req.query.search) {
      // Search across every column shown in the user list table, not just name/email.
      conditions.push(`(
        first_name LIKE ? OR last_name LIKE ? OR middle_initial LIKE ? OR
        email LIKE ? OR personal_email LIKE ? OR id_number LIKE ? OR
        contact_number LIKE ? OR role LIKE ? OR program LIKE ? OR
        CONCAT(first_name, ' ', last_name) LIKE ? OR
        (is_active = 1 AND ? IN ('active','Active')) OR
        (is_active = 0 AND ? IN ('inactive','Inactive'))
      )`);
      const like = `%${req.query.search}%`;
      const term = req.query.search;
      params.push(like, like, like, like, like, like, like, like, like, like, term, term);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users ${whereClause}`, params);

    const [rows] = await pool.query(
      `SELECT id, role, id_number, first_name, middle_initial, last_name, contact_number, email, is_active, created_at
       FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({ success: true, users: rows, ...paginatedMeta(total, page, limit) });
  } catch (err) {
    console.error('listUsers error:', err);
    return res.status(500).json({ success: false, message: 'Could not load users.' });
  }
}

/** GET /api/users/export — CSV of all users (matches the "Download" button) */
async function exportUsers(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT role, id_number, first_name, middle_initial, last_name, contact_number, email, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    let csv = 'Role,ID Number,First Name,M.I.,Last Name,Contact Number,Email,Status,Date Added\n';
    for (const u of rows) {
      csv += `${u.role},${u.id_number},${u.first_name},${u.middle_initial || ''},${u.last_name},${u.contact_number || ''},${u.email},${u.is_active ? 'Active' : 'Inactive'},${u.created_at}\n`;
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users-directory.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('exportUsers error:', err);
    return res.status(500).json({ success: false, message: 'Could not export users.' });
  }
}

/** PATCH /api/users/:id  { isActive?, sectionId? } */
async function updateUser(req, res) {
  const { isActive, sectionId } = req.body;
  try {
    if (isActive !== undefined) {
      await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, req.params.id]);
    }

    if (sectionId !== undefined) {
      const [[user]] = await pool.query('SELECT role FROM users WHERE id = ?', [req.params.id]);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
      if (user.role !== 'student') {
        return res.status(400).json({ success: false, message: 'Only students can be assigned to a section.' });
      }
      // sectionId === null clears the section (e.g. moving a student out of a section).
      if (sectionId !== null) {
        const [[section]] = await pool.query('SELECT id FROM sections WHERE id = ?', [sectionId]);
        if (!section) {
          return res.status(400).json({ success: false, message: 'That section does not exist.' });
        }
      }
      await pool.query('UPDATE users SET section_id = ? WHERE id = ?', [sectionId, req.params.id]);
    }

    return res.json({ success: true, message: 'User updated.' });
  } catch (err) {
    console.error('updateUser error:', err);
    return res.status(500).json({ success: false, message: 'Could not update user.' });
  }
}

/** GET /api/users/parent-links?parentId=&studentId= — list parent-student links (optionally filtered) */
async function listParentLinks(req, res) {
  try {
    const conditions = [];
    const params = [];
    if (req.query.parentId) {
      conditions.push('l.parent_id = ?');
      params.push(req.query.parentId);
    }
    if (req.query.studentId) {
      conditions.push('l.student_id = ?');
      params.push(req.query.studentId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT l.id, l.parent_id, l.student_id,
              CONCAT(p.first_name, ' ', p.last_name) AS parentName, p.email AS parentEmail,
              CONCAT(s.first_name, ' ', s.last_name) AS studentName, s.id_number AS studentIdNumber
       FROM parent_student_links l
       JOIN users p ON p.id = l.parent_id
       JOIN users s ON s.id = l.student_id
       ${whereClause}
       ORDER BY s.last_name, s.first_name`,
      params
    );
    return res.json({ success: true, links: rows });
  } catch (err) {
    console.error('listParentLinks error:', err);
    return res.status(500).json({ success: false, message: 'Could not load parent-student links.' });
  }
}

/** POST /api/users/parent-links  { parentId, studentId } — link a parent to their child */
async function linkParentToStudent(req, res) {
  const { parentId, studentId } = req.body;
  if (!parentId || !studentId) {
    return res.status(400).json({ success: false, message: 'parentId and studentId are required.' });
  }
  try {
    const [[parent]] = await pool.query('SELECT role FROM users WHERE id = ?', [parentId]);
    const [[student]] = await pool.query('SELECT role FROM users WHERE id = ?', [studentId]);
    if (!parent || parent.role !== 'parent') {
      return res.status(400).json({ success: false, message: 'That parent account was not found.' });
    }
    if (!student || student.role !== 'student') {
      return res.status(400).json({ success: false, message: 'That student account was not found.' });
    }

    await pool.query('INSERT INTO parent_student_links (parent_id, student_id) VALUES (?, ?)', [parentId, studentId]);

    await notify({
      recipientId: parentId,
      type: 'account_created',
      title: 'Child linked to your account',
      message: 'A student has been linked to your parent account. You can now view their progress and attendance.',
    });

    return res.json({ success: true, message: 'Parent linked to student.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'This parent is already linked to this student.' });
    }
    console.error('linkParentToStudent error:', err);
    return res.status(500).json({ success: false, message: 'Could not link parent to student.' });
  }
}

/** DELETE /api/users/parent-links/:id — remove a parent-student link */
async function unlinkParentFromStudent(req, res) {
  try {
    const [result] = await pool.query('DELETE FROM parent_student_links WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Link not found.' });
    }
    return res.json({ success: true, message: 'Link removed.' });
  } catch (err) {
    console.error('unlinkParentFromStudent error:', err);
    return res.status(500).json({ success: false, message: 'Could not remove link.' });
  }
}

/**
 * GET /api/users/students?strandId=&gradeLevel=&sectionId=&unassigned=&enrollmentStatus=&search=
 * Purpose-built, filterable student list for section-assignment / promotion / graduation
 * tooling (as opposed to the generic listUsers, which powers the main directory table).
 * By default excludes graduated students unless enrollmentStatus is explicitly passed.
 */
async function listStudents(req, res) {
  try {
    const conditions = ["u.role = 'student'"];
    const params = [];

    if (req.query.strandId) {
      conditions.push('sec.strand_id = ?');
      params.push(req.query.strandId);
    }
    if (req.query.gradeLevel) {
      conditions.push('sec.grade_level = ?');
      params.push(req.query.gradeLevel);
    }
    if (req.query.sectionId) {
      conditions.push('u.section_id = ?');
      params.push(req.query.sectionId);
    }
    if (req.query.unassigned === 'true') {
      conditions.push('u.section_id IS NULL');
    }
    if (req.query.enrollmentStatus === 'all') {
      // no filter — show every status including graduated
    } else if (req.query.enrollmentStatus) {
      conditions.push('u.enrollment_status = ?');
      params.push(req.query.enrollmentStatus);
    } else {
      conditions.push("u.enrollment_status != 'graduated'");
    }
    if (req.query.search) {
      conditions.push(`(u.first_name LIKE ? OR u.last_name LIKE ? OR u.id_number LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ?)`);
      const like = `%${req.query.search}%`;
      params.push(like, like, like, like);
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.id_number AS idNumber, u.first_name AS firstName, u.middle_initial AS middleInitial,
              u.last_name AS lastName, u.section_id AS sectionId, u.enrollment_status AS enrollmentStatus,
              sec.grade_level AS gradeLevel, sec.name AS sectionName, sec.strand_id AS strandId, st.code AS strandCode
       FROM users u
       LEFT JOIN sections sec ON sec.id = u.section_id
       LEFT JOIN strands st ON st.id = sec.strand_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY st.code, sec.grade_level, sec.name, u.last_name, u.first_name
       LIMIT 2000`,
      params
    );
    return res.json({ success: true, students: rows });
  } catch (err) {
    console.error('listStudents error:', err);
    return res.status(500).json({ success: false, message: 'Could not load students.' });
  }
}

/** POST /api/users/bulk-assign-section  { studentIds: [...], sectionId: number|null } */
async function bulkAssignSection(req, res) {
  const { studentIds, sectionId } = req.body;
  if (!Array.isArray(studentIds) || !studentIds.length) {
    return res.status(400).json({ success: false, message: 'Select at least one student.' });
  }
  try {
    if (sectionId !== null && sectionId !== undefined) {
      const [[section]] = await pool.query('SELECT id FROM sections WHERE id = ?', [sectionId]);
      if (!section) {
        return res.status(400).json({ success: false, message: 'That section does not exist.' });
      }
    }
    const placeholders = studentIds.map(() => '?').join(',');
    const [result] = await pool.query(
      `UPDATE users SET section_id = ? WHERE role = 'student' AND id IN (${placeholders})`,
      [sectionId ?? null, ...studentIds]
    );
    return res.json({ success: true, message: `${result.affectedRows} student(s) assigned.` });
  } catch (err) {
    console.error('bulkAssignSection error:', err);
    return res.status(500).json({ success: false, message: 'Could not bulk-assign section.' });
  }
}

/**
 * POST /api/users/promote  { studentIds: [...], targetSectionId }
 * Like bulk-assign-section, but for the specific "move up a grade level" case: it
 * verifies the target section is actually a higher grade level than each student's
 * current section before moving them, and reports how many were skipped otherwise
 * (e.g. a student was accidentally included from the wrong grade level).
 */
async function promoteStudents(req, res) {
  const { studentIds, targetSectionId } = req.body;
  if (!Array.isArray(studentIds) || !studentIds.length || !targetSectionId) {
    return res.status(400).json({ success: false, message: 'Select students and a target section.' });
  }
  try {
    const [[targetSection]] = await pool.query('SELECT id, grade_level FROM sections WHERE id = ?', [targetSectionId]);
    if (!targetSection) {
      return res.status(400).json({ success: false, message: 'That target section does not exist.' });
    }

    const placeholders = studentIds.map(() => '?').join(',');
    const [candidates] = await pool.query(
      `SELECT u.id, sec.grade_level AS currentGradeLevel
       FROM users u LEFT JOIN sections sec ON sec.id = u.section_id
       WHERE u.role = 'student' AND u.id IN (${placeholders})`,
      studentIds
    );

    const eligibleIds = candidates
      .filter((c) => c.currentGradeLevel == null || c.currentGradeLevel < targetSection.grade_level)
      .map((c) => c.id);
    const skipped = candidates.length - eligibleIds.length;

    if (!eligibleIds.length) {
      return res.status(400).json({ success: false, message: 'None of the selected students are eligible to move to that section (already at or above that grade level).' });
    }

    const eligiblePlaceholders = eligibleIds.map(() => '?').join(',');
    const [result] = await pool.query(
      `UPDATE users SET section_id = ? WHERE role = 'student' AND id IN (${eligiblePlaceholders})`,
      [targetSectionId, ...eligibleIds]
    );

    return res.json({
      success: true,
      message: `${result.affectedRows} student(s) promoted.${skipped ? ` ${skipped} skipped (already at or above Grade ${targetSection.grade_level}).` : ''}`,
    });
  } catch (err) {
    console.error('promoteStudents error:', err);
    return res.status(500).json({ success: false, message: 'Could not promote students.' });
  }
}

/** POST /api/users/graduate  { studentIds: [...] } — marks students graduated and deactivates their login */
async function graduateStudents(req, res) {
  const { studentIds } = req.body;
  if (!Array.isArray(studentIds) || !studentIds.length) {
    return res.status(400).json({ success: false, message: 'Select at least one student.' });
  }
  try {
    const placeholders = studentIds.map(() => '?').join(',');
    const [result] = await pool.query(
      `UPDATE users SET enrollment_status = 'graduated', is_active = 0 WHERE role = 'student' AND id IN (${placeholders})`,
      studentIds
    );
    return res.json({ success: true, message: `${result.affectedRows} student(s) marked as graduated.` });
  } catch (err) {
    console.error('graduateStudents error:', err);
    return res.status(500).json({ success: false, message: 'Could not graduate students.' });
  }
}

/** POST /api/users/undo-graduate  { studentIds: [...] } — reverses an accidental graduation */
async function undoGraduateStudents(req, res) {
  const { studentIds } = req.body;
  if (!Array.isArray(studentIds) || !studentIds.length) {
    return res.status(400).json({ success: false, message: 'Select at least one student.' });
  }
  try {
    const placeholders = studentIds.map(() => '?').join(',');
    const [result] = await pool.query(
      `UPDATE users SET enrollment_status = 'enrolled', is_active = 1 WHERE role = 'student' AND enrollment_status = 'graduated' AND id IN (${placeholders})`,
      studentIds
    );
    return res.json({ success: true, message: `${result.affectedRows} student(s) restored to enrolled.` });
  } catch (err) {
    console.error('undoGraduateStudents error:', err);
    return res.status(500).json({ success: false, message: 'Could not undo graduation.' });
  }
}

/**
 * GET /api/users/bulk-import/template — a starter .xlsx with the exact
 * expected column headers, so admins don't have to guess the format.
 */
function downloadImportTemplate(req, res) {
  const headers = [
    'First Name', 'Middle Initial', 'Last Name', 'Contact Number',
    'Email', 'ID Number', 'Program', 'Strand Code', 'Grade Level', 'Section Name',
  ];
  const sample = [
    'Juan', 'D', 'Dela Cruz', '09171234567',
    '', '', 'none', 'STEM', '11', 'STEM-11-A',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mentorae-student-import-template.xlsx"');
  return res.send(buffer);
}

/**
 * POST /api/users/bulk-import  (multipart, field "importFile")
 * Bulk-creates student accounts from an uploaded .xlsx/.xls/.csv.
 *
 * Expected columns (case-insensitive, order doesn't matter):
 *   First Name*, Middle Initial, Last Name*, Contact Number*,
 *   Email (auto-generated if blank), ID Number (auto-generated if blank),
 *   Program (none/4ps/aral, defaults to none),
 *   Strand Code*, Grade Level*, Section Name*
 *
 * Every row is processed independently -- one bad row does NOT abort the
 * whole import (a spreadsheet of 200 rows with 3 typos shouldn't force a
 * re-upload of the other 197). The response reports success/error per row
 * plus the temporary passwords generated, since the admin needs to
 * distribute those.
 *
 * By design (per product decision), a row's Strand+Grade+Section MUST
 * already exist as a real section -- this never auto-creates sections.
 */
async function bulkImportStudents(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file was uploaded.' });
  }

  let rows;
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Could not read that file. Make sure it is a valid .xlsx, .xls, or .csv file.' });
  }

  if (!rows.length) {
    return res.status(400).json({ success: false, message: 'That file has no data rows.' });
  }

  // Case-insensitive header lookup, since spreadsheet headers are typed by
  // hand and "email" vs "Email" vs " Email " shouldn't matter.
  function get(row, ...names) {
    const keys = Object.keys(row);
    for (const name of names) {
      const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
      if (key && String(row[key]).trim() !== '') return String(row[key]).trim();
    }
    return '';
  }

  const results = [];
  const credentials = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 = header row + 1-indexing, matches what the admin sees in Excel
    const firstName = get(row, 'First Name', 'FirstName');
    const middleInitial = get(row, 'Middle Initial', 'MI');
    const lastName = get(row, 'Last Name', 'LastName');
    const contactNumber = get(row, 'Contact Number', 'Contact', 'Phone');
    let email = get(row, 'Email');
    let idNumber = get(row, 'ID Number', 'IdNumber', 'ID');
    const programRaw = get(row, 'Program').toLowerCase();
    const program = ['4ps', 'aral'].includes(programRaw) ? programRaw : 'none';
    const strandCode = get(row, 'Strand Code', 'Strand');
    const gradeLevel = get(row, 'Grade Level', 'Grade');
    const sectionName = get(row, 'Section Name', 'Section');

    const rowLabel = `${firstName} ${lastName}`.trim() || `(row ${rowNum})`;

    if (!firstName || !lastName || !contactNumber || !strandCode || !gradeLevel || !sectionName) {
      results.push({ row: rowNum, name: rowLabel, status: 'error', message: 'Missing a required field (First Name, Last Name, Contact Number, Strand Code, Grade Level, Section Name).' });
      continue;
    }

    try {
      const [[section]] = await pool.query(
        `SELECT sec.id FROM sections sec
         JOIN strands st ON st.id = sec.strand_id
         WHERE st.code = ? AND sec.grade_level = ? AND sec.name = ?`,
        [strandCode, gradeLevel, sectionName]
      );
      if (!section) {
        results.push({
          row: rowNum, name: rowLabel, status: 'error',
          message: `Section "${strandCode} - Grade ${gradeLevel} - ${sectionName}" does not exist. This row was skipped -- create the section first, or fix the spelling.`,
        });
        continue;
      }

      if (!idNumber) idNumber = await nextIdNumber();
      if (!email) email = await uniqueEmail(firstName, lastName, 'Student');

      const tempPassword = crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10);
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const [result] = await pool.query(
        `INSERT INTO users (role, program, id_number, first_name, middle_initial, last_name, contact_number, email, password_hash, section_id)
         VALUES ('student', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [program, idNumber, firstName, middleInitial || null, lastName, contactNumber, email, passwordHash, section.id]
      );

      await notify({
        recipientId: result.insertId,
        type: 'account_created',
        title: 'Welcome to Mentorae',
        message: 'Your Student account has been created. Go to your Profile to review your details and add a personal email for real-time updates.',
      });

      results.push({ row: rowNum, name: rowLabel, status: 'created', message: `Created as ${idNumber}.` });
      credentials.push({ idNumber, name: rowLabel, email, tempPassword });
    } catch (err) {
      const message = err.code === 'ER_DUP_ENTRY'
        ? 'That ID number or email is already in use.'
        : 'Could not create this account.';
      results.push({ row: rowNum, name: rowLabel, status: 'error', message });
    }
  }

  const created = results.filter((r) => r.status === 'created').length;
  return res.json({
    success: true,
    message: `${created} of ${rows.length} account(s) created.`,
    results,
    credentials,
  });
}
async function getOverview(req, res) {
  try {
    const [[counts]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(role = 'student') AS students,
              SUM(role = 'teacher') AS teachers,
              SUM(role = 'parent') AS parents,
              SUM(role IN ('admin','security')) AS staff
       FROM users`
    );
    return res.json({ success: true, ...counts });
  } catch (err) {
    console.error('getOverview error:', err);
    return res.status(500).json({ success: false, message: 'Could not load overview.' });
  }
}

/** POST /api/users/generate-scanner-key — makes a new QR scanner access key */
async function generateScannerKey(req, res) {
  try {
    const rawKey = crypto.randomBytes(24).toString('base64url');
    const keyHash = await bcrypt.hash(rawKey, 10);
    await pool.query('INSERT INTO scanner_keys (key_hash, created_by) VALUES (?, ?)', [keyHash, req.user.id]);
    return res.json({ success: true, key: rawKey });
  } catch (err) {
    console.error('generateScannerKey error:', err);
    return res.status(500).json({ success: false, message: 'Could not generate a scanner key.' });
  }
}

module.exports = {
  generateId,
  generateEmail,
  createUser,
  listUsers,
  exportUsers,
  updateUser,
  getOverview,
  generateScannerKey,
  listParentLinks,
  linkParentToStudent,
  unlinkParentFromStudent,
  listStudents,
  bulkAssignSection,
  promoteStudents,
  graduateStudents,
  undoGraduateStudents,
  downloadImportTemplate,
  bulkImportStudents,
};
