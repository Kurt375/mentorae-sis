const bcrypt = require('bcrypt');
const crypto = require('crypto');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
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

/**
 * Shared WHERE-clause builder for the users table, used by both the
 * paginated directory (listUsers) and the export (exportUsers) so the
 * "download" button always exports exactly what's on screen -- same
 * role filter, same search term.
 */
function buildUserFilter(query) {
  const conditions = [];
  const params = [];

  if (query.role && query.role !== 'All') {
    conditions.push('u.role = ?');
    params.push(query.role.toLowerCase());
  }
  if (query.search) {
    conditions.push(`(
      u.first_name LIKE ? OR u.last_name LIKE ? OR u.middle_initial LIKE ? OR
      u.email LIKE ? OR u.personal_email LIKE ? OR u.id_number LIKE ? OR
      u.contact_number LIKE ? OR u.role LIKE ? OR u.program LIKE ? OR
      CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR
      advSec.name LIKE ? OR
      studSec.name LIKE ? OR
      (u.is_active = 1 AND ? IN ('active','Active')) OR
      (u.is_active = 0 AND ? IN ('inactive','Inactive'))
    )`);
    const like = `%${query.search}%`;
    const term = query.search;
    params.push(like, like, like, like, like, like, like, like, like, like, like, like, term, term);
  }

  return { whereClause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
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
  const {
    firstName, middleInitial, lastName, contactNumber, idNumber, email, role, sectionId, password, program, parentName,
    childNames, advisorySectionId, subjectIds,
  } = req.body;

  const validRoles = ['Student', 'Teacher', 'Parent', 'Admin', 'Security'];
  const validPrograms = ['none', '4ps', 'aral'];
  if (!firstName || !lastName || !contactNumber || !idNumber || !email || !role || !validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: 'All fields are required and role must be valid.' });
  }
  const userProgram = role === 'Student' && validPrograms.includes(program) ? program : 'none';

  if (password !== undefined && password !== null && password !== '' && password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
  }

  // Pre-check duplicate ID / LRN to provide a helpful message
  const [existingId] = await pool.query('SELECT id, role FROM users WHERE id_number = ?', [idNumber.trim()]);
  if (existingId.length) {
    return res.status(409).json({
      success: false,
      message: role === 'Student'
        ? `A student or user with LRN / ID "${idNumber.trim()}" already exists.`
        : `A user with ID "${idNumber.trim()}" already exists.`
    });
  }

  try {
    const usingManualPassword = !!password;
    // Auto-generated accounts use the person's own ID number as their starting
    // password -- easy to remember/hand out, but exactly why must_change_password
    // is forced on: a predictable password must not stay in place.
    const tempPassword = usingManualPassword ? password : idNumber;
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const mustChangePassword = usingManualPassword ? 0 : 1;

    const [result] = await pool.query(
      `INSERT INTO users (role, program, id_number, first_name, middle_initial, last_name, contact_number, email, password_hash, must_change_password, temp_password, section_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        mustChangePassword,
        tempPassword,
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

    // Parent accounts: the reverse direction -- match each typed child name
    // (comma-separated) against existing Student accounts and link them.
    // Same one-match-or-report-back approach as the Student->Parent case above.
    let childLinkMessages = [];
    if (role === 'Parent' && childNames && childNames.trim()) {
      const names = childNames.split(',').map((n) => n.trim()).filter(Boolean);
      for (const rawName of names) {
        const typedName = rawName.toLowerCase().replace(/\s+/g, ' ');
        const [studentMatches] = await pool.query(
          `SELECT id, first_name, last_name FROM users
           WHERE role = 'student' AND LOWER(TRIM(CONCAT(first_name, ' ', last_name))) = ?`,
          [typedName]
        );
        if (studentMatches.length === 1) {
          await pool.query(
            'INSERT IGNORE INTO parent_student_links (parent_id, student_id) VALUES (?, ?)',
            [result.insertId, studentMatches[0].id]
          );
          childLinkMessages.push(`Linked to student: ${studentMatches[0].first_name} ${studentMatches[0].last_name}.`);
        } else if (studentMatches.length === 0) {
          childLinkMessages.push(`No student account matching "${rawName}" was found -- not linked. Check the spelling, create the student account first, or fix this later in the Parent-Student Links table.`);
        } else {
          childLinkMessages.push(`More than one student account matches "${rawName}" -- not automatically linked to avoid linking the wrong one. Resolve this manually in the Parent-Student Links table.`);
        }
      }
    }

    // Teacher accounts: optionally make them the adviser of one section,
    // and record which subjects they're authorized to handle.
    let advisoryMessage = null;
    if (role === 'Teacher' && advisorySectionId) {
      const [[section]] = await pool.query('SELECT id FROM sections WHERE id = ?', [advisorySectionId]);
      if (section) {
        await pool.query('UPDATE sections SET adviser_id = ? WHERE id = ?', [result.insertId, advisorySectionId]);
        advisoryMessage = 'Set as adviser of the selected section.';
      } else {
        advisoryMessage = 'That advisory section could not be found -- not assigned.';
      }
    }
    if (role === 'Teacher' && Array.isArray(subjectIds) && subjectIds.length) {
      const values = subjectIds.map((subjectId) => [result.insertId, subjectId]);
      await pool.query('INSERT IGNORE INTO teacher_subjects (teacher_id, subject_id) VALUES ?', [values]);
    }

    return res.json({
      success: true,
      message: `${firstName} ${lastName} created as ${role}.`,
      // Only sent back when auto-generated — shown once, admin must share it with the new user.
      // When the admin set the password manually, nothing is echoed back.
      ...(usingManualPassword ? {} : { tempPassword }),
      ...(parentLinkMessage ? { parentLinkMessage } : {}),
      ...(childLinkMessages.length ? { childLinkMessages } : {}),
      ...(advisoryMessage ? { advisoryMessage } : {}),
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
    const { whereClause, params } = buildUserFilter(req.query);

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       LEFT JOIN sections advSec ON advSec.adviser_id = u.id
       LEFT JOIN sections studSec ON studSec.id = u.section_id
       ${whereClause}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT u.id, u.role, u.id_number, u.first_name, u.middle_initial, u.last_name, u.contact_number, u.email,
              u.is_active, u.created_at, u.profile_picture_url, u.temp_password, u.must_change_password,
              advSec.id AS advisory_section_id, advSec.name AS advisory_section_name, advSec.grade_level AS advisory_grade_level,
              advSt.code AS advisory_strand_code,
              studSec.id AS student_section_id, studSec.name AS student_section_name, studSec.grade_level AS student_grade_level,
              studSt.code AS student_strand_code
       FROM users u
       LEFT JOIN sections advSec ON advSec.adviser_id = u.id
       LEFT JOIN strands advSt ON advSt.id = advSec.strand_id
       LEFT JOIN sections studSec ON studSec.id = u.section_id
       LEFT JOIN strands studSt ON studSt.id = studSec.strand_id
       ${whereClause}
       ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const users = rows.map((u) => {
      let advisoryClass = null;
      if (u.advisory_section_name) {
        const parts = [];
        if (u.advisory_grade_level) parts.push(`Grade ${u.advisory_grade_level}`);
        if (u.advisory_strand_code) parts.push(u.advisory_strand_code);
        const prefix = parts.join(' - ');
        advisoryClass = prefix ? `${prefix} (${u.advisory_section_name})` : u.advisory_section_name;
      }

      let studentSection = null;
      if (u.student_section_name) {
        const parts = [];
        if (u.student_grade_level) parts.push(`Grade ${u.student_grade_level}`);
        if (u.student_strand_code) parts.push(u.student_strand_code);
        const prefix = parts.join(' - ');
        studentSection = prefix ? `${prefix} (${u.student_section_name})` : u.student_section_name;
      }

      return {
        ...u,
        advisoryClass,
        studentSection,
      };
    });

    return res.json({ success: true, users, ...paginatedMeta(total, page, limit) });
  } catch (err) {
    console.error('listUsers error:', err);
    return res.status(500).json({ success: false, message: 'Could not load users.' });
  }
}

/**
 * GET /api/users/export?role=&search=&format=csv|xlsx
 * Exports the users directory -- respects the exact same role/search
 * filter as the on-screen table (via buildUserFilter), so "Download"
 * exports whatever the admin is currently looking at, not everyone.
 */
async function exportUsers(req, res) {
  try {
    const { whereClause, params } = buildUserFilter(req.query);
    const [rows] = await pool.query(
      `SELECT u.role, u.id_number, u.first_name, u.middle_initial, u.last_name, u.contact_number, u.email,
              u.temp_password, u.is_active, u.created_at,
              advSec.name AS advisory_section_name, advSec.grade_level AS advisory_grade_level, advSt.code AS advisory_strand_code,
              studSec.name AS student_section_name, studSec.grade_level AS student_grade_level, studSt.code AS student_strand_code
       FROM users u
       LEFT JOIN sections advSec ON advSec.adviser_id = u.id
       LEFT JOIN strands advSt ON advSt.id = advSec.strand_id
       LEFT JOIN sections studSec ON studSec.id = u.section_id
       LEFT JOIN strands studSt ON studSt.id = studSec.strand_id
       ${whereClause}
       ORDER BY u.created_at DESC`,
      params
    );

    const headers = ['Role', 'LRN / ID Number', 'First Name', 'M.I.', 'Last Name', 'Section / Advisory', 'Contact Number', 'Email', 'Initial / Generated Password', 'Status', 'Date Added'];
    const dataRows = rows.map((u) => {
      let sectionOrAdvisory = '—';
      if (u.role === 'teacher') {
        if (u.advisory_section_name) {
          const parts = [];
          if (u.advisory_grade_level) parts.push(`Grade ${u.advisory_grade_level}`);
          if (u.advisory_strand_code) parts.push(u.advisory_strand_code);
          const prefix = parts.join(' - ');
          sectionOrAdvisory = `Advisory: ${prefix ? `${prefix} (${u.advisory_section_name})` : u.advisory_section_name}`;
        } else {
          sectionOrAdvisory = 'No Advisory';
        }
      } else if (u.role === 'student') {
        if (u.student_section_name) {
          const parts = [];
          if (u.student_grade_level) parts.push(`Grade ${u.student_grade_level}`);
          if (u.student_strand_code) parts.push(u.student_strand_code);
          const prefix = parts.join(' - ');
          sectionOrAdvisory = prefix ? `${prefix} (${u.student_section_name})` : u.student_section_name;
        } else {
          sectionOrAdvisory = 'Unassigned';
        }
      }
      return [
        u.role.charAt(0).toUpperCase() + u.role.slice(1),
        u.id_number,
        u.first_name,
        u.middle_initial || '',
        u.last_name,
        sectionOrAdvisory,
        u.contact_number || '',
        u.email,
        u.temp_password || 'Private (Changed)',
        u.is_active ? 'Active' : 'Inactive',
        new Date(u.created_at).toISOString().slice(0, 10),
      ];
    });

    const format = (req.query.format || 'csv').toLowerCase();

    if (format === 'xlsx' || format === 'excel') {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Users');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="users-directory.xlsx"');
      return res.send(buffer);
    }

    // Default: CSV. Values are quoted and internal quotes escaped so names/emails
    // with commas or quotes in them don't corrupt the column layout.
    const escapeCsv = (val) => `"${String(val).replace(/"/g, '""')}"`;
    let csv = headers.map(escapeCsv).join(',') + '\n';
    for (const row of dataRows) {
      csv += row.map(escapeCsv).join(',') + '\n';
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users-directory.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('exportUsers error:', err);
    return res.status(500).json({ success: false, message: 'Could not export users.' });
  }
}

/** GET /api/users/:id */
async function getUser(req, res) {
  try {
    const [[user]] = await pool.query(
      `SELECT id, role, id_number, first_name, middle_initial, last_name, contact_number, email, program, is_active, section_id, profile_picture_url, created_at
       FROM users WHERE id = ?`,
      [req.params.id]
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    let adviserSectionId = null;
    let subjectIds = [];
    let parentName = '';
    let childrenNames = '';

    if (user.role === 'teacher') {
      const [[section]] = await pool.query('SELECT id FROM sections WHERE adviser_id = ?', [user.id]);
      if (section) adviserSectionId = section.id;
      const [subjects] = await pool.query('SELECT subject_id FROM teacher_subjects WHERE teacher_id = ?', [user.id]);
      subjectIds = subjects.map(s => s.subject_id);
    } else if (user.role === 'student') {
      const [parents] = await pool.query(
        `SELECT CONCAT(p.first_name, ' ', p.last_name) AS name
         FROM parent_student_links l
         JOIN users p ON p.id = l.parent_id
         WHERE l.student_id = ? LIMIT 1`,
        [user.id]
      );
      if (parents.length) parentName = parents[0].name;
    } else if (user.role === 'parent') {
      const [children] = await pool.query(
        `SELECT CONCAT(s.first_name, ' ', s.last_name) AS name
         FROM parent_student_links l
         JOIN users s ON s.id = l.student_id
         WHERE l.parent_id = ?`,
        [user.id]
      );
      childrenNames = children.map(c => c.name).join(', ');
    }

    return res.json({
      success: true,
      user: {
        ...user,
        adviserSectionId,
        subjectIds,
        parent_name: parentName,
        children_names: childrenNames,
      }
    });
  } catch (err) {
    console.error('getUser error:', err);
    return res.status(500).json({ success: false, message: 'Could not load user details.' });
  }
}

/** PATCH /api/users/:id */
async function updateUser(req, res) {
  const {
    isActive,
    archived,
    sectionId,
    avatarBase64,
    firstName,
    middleInitial,
    lastName,
    contactNumber,
    email,
    idNumber,
    program,
    parentName,
    childrenNames,
    adviserSectionId,
    subjectIds
  } = req.body;
  try {
    const [[user]] = await pool.query('SELECT id, role FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const updates = [];
    const params = [];

    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }
    if (archived !== undefined) {
      updates.push('is_active = ?');
      params.push(archived ? 0 : 1);
    }
    if (firstName !== undefined) {
      if (typeof firstName !== 'string' || !firstName.trim()) {
        return res.status(400).json({ success: false, message: 'First name cannot be empty.' });
      }
      updates.push('first_name = ?');
      params.push(firstName.trim());
    }
    if (middleInitial !== undefined) {
      updates.push('middle_initial = ?');
      params.push(typeof middleInitial === 'string' ? middleInitial.trim() || null : null);
    }
    if (lastName !== undefined) {
      if (typeof lastName !== 'string' || !lastName.trim()) {
        return res.status(400).json({ success: false, message: 'Last name cannot be empty.' });
      }
      updates.push('last_name = ?');
      params.push(lastName.trim());
    }
    if (contactNumber !== undefined) {
      updates.push('contact_number = ?');
      params.push(typeof contactNumber === 'string' ? contactNumber.trim() || null : null);
    }
    if (email !== undefined) {
      if (typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({ success: false, message: 'Email cannot be empty.' });
      }
      updates.push('email = ?');
      params.push(email.trim().toLowerCase());
    }
    if (idNumber !== undefined) {
      if (typeof idNumber !== 'string' || !idNumber.trim()) {
        return res.status(400).json({ success: false, message: 'LRN / ID Number cannot be empty.' });
      }
      const [dup] = await pool.query('SELECT id FROM users WHERE id_number = ? AND id != ?', [idNumber.trim(), req.params.id]);
      if (dup.length) {
        return res.status(409).json({ success: false, message: `The LRN / ID "${idNumber.trim()}" is already in use by another user.` });
      }
      updates.push('id_number = ?');
      params.push(idNumber.trim());
    }
    if (program !== undefined && user.role === 'student') {
      updates.push('program = ?');
      params.push(program);
    }

    if (sectionId !== undefined) {
      if (user.role !== 'student') {
        return res.status(400).json({ success: false, message: 'Only students can be assigned to a section.' });
      }
      if (sectionId !== null) {
        const [[section]] = await pool.query('SELECT id FROM sections WHERE id = ?', [sectionId]);
        if (!section) {
          return res.status(400).json({ success: false, message: 'That section does not exist.' });
        }
      }
      updates.push('section_id = ?');
      params.push(sectionId);
    }

    if (avatarBase64 !== undefined) {
      if (user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only student profile photos can be updated in admin user management.' });
      }
      if (avatarBase64 && !/^data:image\/(png|jpe?g|webp);base64,/.test(avatarBase64)) {
        return res.status(400).json({ success: false, message: 'Profile picture must be a PNG, JPG, or WEBP image.' });
      }
      updates.push('profile_picture_url = ?');
      params.push(avatarBase64 || null);
    }

    if (updates.length) {
      params.push(req.params.id);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    if (user.role === 'teacher') {
      if (adviserSectionId !== undefined) {
        await pool.query('UPDATE sections SET adviser_id = NULL WHERE adviser_id = ?', [user.id]);
        if (adviserSectionId) {
          await pool.query('UPDATE sections SET adviser_id = ? WHERE id = ?', [user.id, adviserSectionId]);
        }
      }
      if (Array.isArray(subjectIds)) {
        await pool.query('DELETE FROM teacher_subjects WHERE teacher_id = ?', [user.id]);
        if (subjectIds.length) {
          const values = subjectIds.map(sId => [user.id, sId]);
          await pool.query('INSERT IGNORE INTO teacher_subjects (teacher_id, subject_id) VALUES ?', [values]);
        }
      }
    }

    if (user.role === 'parent' && childrenNames !== undefined) {
      await pool.query('DELETE FROM parent_student_links WHERE parent_id = ?', [user.id]);
      if (childrenNames && childrenNames.trim()) {
        const rawNames = childrenNames.split(',').map(n => n.trim()).filter(Boolean);
        for (const rawName of rawNames) {
          const [studentMatches] = await pool.query(
            "SELECT id FROM users WHERE role = 'student' AND (CONCAT(first_name, ' ', last_name) = ? OR last_name = ?)",
            [rawName, rawName]
          );
          if (studentMatches.length >= 1) {
            await pool.query(
              'INSERT IGNORE INTO parent_student_links (parent_id, student_id) VALUES (?, ?)',
              [user.id, studentMatches[0].id]
            );
          }
        }
      }
    }

    if (user.role === 'student' && parentName !== undefined) {
      await pool.query('DELETE FROM parent_student_links WHERE student_id = ?', [user.id]);
      if (parentName && parentName.trim()) {
        const [parentMatches] = await pool.query(
          "SELECT id FROM users WHERE role = 'parent' AND (CONCAT(first_name, ' ', last_name) = ? OR last_name = ?)",
          [parentName.trim(), parentName.trim()]
        );
        if (parentMatches.length >= 1) {
          await pool.query(
            'INSERT IGNORE INTO parent_student_links (parent_id, student_id) VALUES (?, ?)',
            [parentMatches[0].id, user.id]
          );
        }
      }
    }

    return res.json({ success: true, message: 'User updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'That email is already in use.' });
    }
    console.error('updateUser error:', err);
    return res.status(500).json({ success: false, message: 'Could not update user.' });
  }
}

/** DELETE /api/users/:id */
async function deleteUser(req, res) {
  try {
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    console.error('deleteUser error:', err);
    return res.status(500).json({ success: false, message: 'Could not delete user.' });
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
/**
 * GET /api/users/bulk-import/template — Multi-tab Mentorae .xlsx template
 * matching the user's Google Sheet:
 *   - Tab 1: "Student/Parent" (LRN, Name of student, Sex, Contact Number, Grade Level, Strand, Section, Status, Parent's Name, Parent's Contact Number)
 *   - Tab 2: "Teacher" (Name, Contact Number, Advisory Section, Subjects Handled)
 */
async function downloadImportTemplate(req, res) {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Mentorae SIS';
    wb.lastModifiedBy = 'Mentorae SIS Admin';
    wb.created = new Date();
    wb.modified = new Date();

    // ==========================================
    // 1. Tab 1: Student-Parent (Matches Student/Parent in Google Sheets)
    // ==========================================
    const wsStudent = wb.addWorksheet('Student-Parent', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }]
    });

    wsStudent.columns = [
      { header: 'LRN', key: 'lrn', width: 18 },
      { header: 'Name of student', key: 'nameOfStudent', width: 28 },
      { header: 'Sex', key: 'sex', width: 12 },
      { header: 'Contact Number', key: 'contactNumber', width: 18 },
      { header: 'Grade Level', key: 'gradeLevel', width: 15 },
      { header: 'Strand', key: 'strand', width: 14 },
      { header: 'Section', key: 'section', width: 32 },
      { header: 'Status(Student, 4ps or Aral Program)', key: 'status', width: 34 },
      { header: "Parent's Name", key: 'parentName', width: 26 },
      { header: "Parent's Contact Number", key: 'parentContact', width: 22 },
    ];

    const studentHeader = wsStudent.getRow(1);
    studentHeader.height = 30;
    studentHeader.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A5C2C' } };
      cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF07421F' } },
        bottom: { style: 'medium', color: { argb: 'FF07421F' } },
        left: { style: 'thin', color: { argb: 'FF15803D' } },
        right: { style: 'thin', color: { argb: 'FF15803D' } },
      };
    });

    const studentSampleRows = [
      ['10774111001', 'Adrian M. Suelto', 'Male', '0917-628-3491', 'Grade 11', 'ABM', 'Accountancy', 'Student', 'Roberto M. Suelto', '0917-482-6310'],
      ['10774111002', 'Angelica R. Maligalig', 'Female', '0926-913-5742', 'Grade 11', 'STEM', 'Engineering', '4Ps', 'Marissa R. Maligalig', '0926-715-3048'],
      ['10774112003', 'Joshua P. Castillo', 'Male', '0908-245-7813', 'Grade 12', 'HUMSS', 'Criminology 1', 'Student', 'Ernesto P. Castillo', '0908-392-7461'],
    ];

    studentSampleRows.forEach((r, idx) => {
      const row = wsStudent.addRow(r);
      row.height = 22;
      const isEven = idx % 2 === 0;
      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1F2937' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF0FDF4' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
        if ([1, 3, 4, 5, 6, 8, 10].includes(colNum)) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });
    });

    wsStudent.autoFilter = 'A1:J1';

    // Dropdown validations for rows 2..500
    for (let r = 2; r <= 500; r++) {
      wsStudent.getCell(`C${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Male,Female"'],
      };
      wsStudent.getCell(`E${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Grade 11,Grade 12,11,12"'],
      };
      wsStudent.getCell(`F${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"STEM,ABM,HUMSS,ASSH,BAE,HE,H&T"'],
      };
      wsStudent.getCell(`H${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Student,4Ps,Aral Program"'],
      };
    }

    // ==========================================
    // 2. Tab 2: Teacher
    // ==========================================
    const wsTeacher = wb.addWorksheet('Teacher', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }]
    });

    wsTeacher.columns = [
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Contact Number', key: 'contactNumber', width: 18 },
      { header: 'Advisory Section', key: 'advisorySection', width: 30 },
      { header: 'Subjects Handled', key: 'subjectsHandled', width: 50 },
    ];

    const teacherHeader = wsTeacher.getRow(1);
    teacherHeader.height = 30;
    teacherHeader.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A5C2C' } };
      cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF07421F' } },
        bottom: { style: 'medium', color: { argb: 'FF07421F' } },
        left: { style: 'thin', color: { argb: 'FF15803D' } },
        right: { style: 'thin', color: { argb: 'FF15803D' } },
      };
    });

    const teacherSampleRows = [
      ['Andrey M. Augustine', '09612345678', 'Arts & Social Sciences 1', 'Creative Composition, Philippine Governance'],
      ['Benice I. Zuela', '09612345679', 'Engineering', 'Finite Mathematics 1, Physics 1'],
      ['Charmaine N. Cruz', '09612345671', 'Sports Management', 'Human Movement 1'],
      ['Dan E. Daranobo', '09612345672', 'Education 1', 'Creative Writing, English for Academic and Professional Purposes'],
      ['Elsa A. Macy', '09612345673', 'Biomedical Engineering', 'Physics 1, Chemistry 1'],
    ];

    teacherSampleRows.forEach((r, idx) => {
      const row = wsTeacher.addRow(r);
      row.height = 22;
      const isEven = idx % 2 === 0;
      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF1F2937' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF0FDF4' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
        if (colNum === 2) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });
    });

    wsTeacher.autoFilter = 'A1:D1';

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="mentorae-users-import-template.xlsx"');
    return res.send(buffer);
  } catch (err) {
    console.error('downloadImportTemplate error:', err);
    return res.status(500).json({ success: false, message: 'Could not generate template file.' });
  }
}

// --------------------------------------------------------------------------
// Helpers for Parsing Names, Numbers, Programs, Sections
// --------------------------------------------------------------------------

function parseFullName(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    return { firstName: '', middleInitial: null, lastName: '' };
  }
  const str = rawName.trim().replace(/\s+/g, ' ');
  if (!str) return { firstName: '', middleInitial: null, lastName: '' };

  // "Lastname, Firstname M." format
  if (str.includes(',')) {
    const parts = str.split(',').map(s => s.trim());
    const lastName = parts[0];
    const rest = parts[1] || '';
    const restParts = rest.split(' ').filter(Boolean);
    let middleInitial = null;
    if (restParts.length > 1 && (restParts[restParts.length - 1].length <= 2 || restParts[restParts.length - 1].endsWith('.'))) {
      middleInitial = restParts.pop().replace(/\./g, '').toUpperCase();
    }
    const firstName = restParts.join(' ');
    return { firstName, middleInitial, lastName };
  }

  // "Firstname M. Lastname" or "Firstname Lastname"
  const tokens = str.split(' ').filter(Boolean);
  if (tokens.length === 1) {
    return { firstName: tokens[0], middleInitial: null, lastName: tokens[0] };
  }
  if (tokens.length === 2) {
    return { firstName: tokens[0], middleInitial: null, lastName: tokens[1] };
  }

  // Check if intermediate token is single letter / MI (e.g., "M" or "M.")
  let miIndex = -1;
  for (let i = 1; i < tokens.length - 1; i++) {
    const t = tokens[i].replace(/\./g, '');
    if (t.length === 1 && /^[a-zA-Z]$/.test(t)) {
      miIndex = i;
      break;
    }
  }

  if (miIndex !== -1) {
    const firstName = tokens.slice(0, miIndex).join(' ');
    const middleInitial = tokens[miIndex].replace(/\./g, '').toUpperCase();
    const lastName = tokens.slice(miIndex + 1).join(' ');
    return { firstName, middleInitial, lastName };
  }

  // If no single-character MI, pop last token as surname
  const lastName = tokens.pop();
  const firstName = tokens.join(' ');
  return { firstName, middleInitial: null, lastName };
}

function cleanPhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('9')) {
    digits = '0' + digits;
  } else if (digits.length === 12 && digits.startsWith('639')) {
    digits = '0' + digits.slice(2);
  }
  return digits;
}

function mapProgram(statusRaw) {
  if (!statusRaw) return 'none';
  const s = String(statusRaw).toLowerCase().trim();
  if (s.includes('4p')) return '4ps';
  if (s.includes('aral')) return 'aral';
  return 'none';
}

function parseGradeLevel(raw) {
  if (!raw) return '';
  const match = String(raw).match(/\d+/);
  return match ? match[0] : String(raw).trim();
}

async function findSection(strandCode, gradeLevel, sectionName) {
  if (!sectionName) return null;
  const normName = sectionName.trim();

  // 1. Exact match with strand + grade
  if (strandCode && gradeLevel) {
    const [[sec]] = await pool.query(
      `SELECT sec.id, sec.name, sec.grade_level, st.code AS strand_code
       FROM sections sec
       JOIN strands st ON st.id = sec.strand_id
       WHERE LOWER(TRIM(st.code)) = LOWER(TRIM(?))
         AND sec.grade_level = ?
         AND LOWER(TRIM(sec.name)) = LOWER(TRIM(?))`,
      [strandCode, gradeLevel, normName]
    );
    if (sec) return sec;
  }

  // 2. Match by section name and grade
  if (gradeLevel) {
    const [[sec]] = await pool.query(
      `SELECT sec.id, sec.name, sec.grade_level, st.code AS strand_code
       FROM sections sec
       JOIN strands st ON st.id = sec.strand_id
       WHERE sec.grade_level = ?
         AND LOWER(TRIM(sec.name)) = LOWER(TRIM(?))`,
      [gradeLevel, normName]
    );
    if (sec) return sec;
  }

  // 3. Match solely by section name
  const [matches] = await pool.query(
    `SELECT sec.id, sec.name, sec.grade_level, st.code AS strand_code
     FROM sections sec
     JOIN strands st ON st.id = sec.strand_id
     WHERE LOWER(TRIM(sec.name)) = LOWER(TRIM(?))`,
    [normName]
  );
  if (matches.length === 1) return matches[0];

  // 4. Match prefix
  const [likeMatches] = await pool.query(
    `SELECT sec.id, sec.name, sec.grade_level, st.code AS strand_code
     FROM sections sec
     JOIN strands st ON st.id = sec.strand_id
     WHERE LOWER(TRIM(sec.name)) LIKE LOWER(CONCAT(TRIM(?), '%'))`,
    [normName]
  );
  if (likeMatches.length === 1) return likeMatches[0];

  return null;
}

/**
 * POST /api/users/bulk-import  (multipart, field "importFile")
 * Unified bulk import supporting:
 *   - "Student/Parent" tab: Creates Student account, creates Parent account, and links them.
 *   - "Teacher" tab: Creates Teacher account, assigns Advisory Section, and links Subjects Handled.
 */
async function bulkImportStudents(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file was uploaded.' });
  }

  let workbook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Could not read that file. Make sure it is a valid .xlsx, .xls, or .csv file.' });
  }

  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) {
    return res.status(400).json({ success: false, message: 'The uploaded file has no sheets.' });
  }

  const mode = (req.query.mode || req.body.mode || 'all').toLowerCase();

  // Helper to extract value from row using case-insensitive header lookup
  function get(row, ...names) {
    const keys = Object.keys(row);
    for (const name of names) {
      const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
      if (key && String(row[key]).trim() !== '') return String(row[key]).trim();
    }
    return '';
  }

  // Detect sheets
  let studentSheet = null;
  let teacherSheet = null;

  for (const name of sheetNames) {
    const norm = name.trim().toLowerCase().replace(/[\/\-_&]/g, ' ');
    if (norm.includes('student')) {
      studentSheet = workbook.Sheets[name];
    } else if (norm.includes('teacher')) {
      teacherSheet = workbook.Sheets[name];
    }
  }

  // Fallback if sheets have arbitrary names (e.g. Sheet1)
  if (!studentSheet && !teacherSheet && sheetNames.length > 0) {
    const firstSheet = workbook.Sheets[sheetNames[0]];
    const sample = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
    if (sample.length > 0) {
      const keys = Object.keys(sample[0]).map(k => k.toLowerCase());
      const isTeacher = keys.some(k => k.includes('advisory') || k.includes('subjects handled'));
      if (isTeacher) {
        teacherSheet = firstSheet;
      } else {
        studentSheet = firstSheet;
      }
    }
  }

  const results = [];
  const studentCreds = [];
  const parentCreds = [];
  const teacherCreds = [];

  let studentsCreatedCount = 0;
  let studentsSkippedCount = 0;
  let parentsCreatedCount = 0;
  let parentsLinkedCount = 0;
  let teachersCreatedCount = 0;

  // ----------------------------------------------------
  // Pre-fetch reference data to eliminate hundreds of remote DB queries
  // ----------------------------------------------------
  const [allSections] = await pool.query(
    `SELECT sec.id, sec.name, sec.grade_level, st.code AS strand_code
     FROM sections sec
     JOIN strands st ON st.id = sec.strand_id`
  );

  function findSectionCached(strandCode, gradeLevel, sectionName) {
    if (!sectionName) return null;
    const normName = sectionName.trim().toLowerCase();
    const normStrand = (strandCode || '').trim().toLowerCase();
    const normGrade = gradeLevel ? String(gradeLevel).trim() : '';

    if (normStrand && normGrade) {
      const match = allSections.find(s =>
        (s.strand_code || '').trim().toLowerCase() === normStrand &&
        String(s.grade_level).trim() === normGrade &&
        s.name.trim().toLowerCase() === normName
      );
      if (match) return match;
    }

    if (normGrade) {
      const match = allSections.find(s =>
        String(s.grade_level).trim() === normGrade &&
        s.name.trim().toLowerCase() === normName
      );
      if (match) return match;
    }

    const exactNameMatches = allSections.filter(s => s.name.trim().toLowerCase() === normName);
    if (exactNameMatches.length === 1) return exactNameMatches[0];

    const prefixMatches = allSections.filter(s => s.name.trim().toLowerCase().startsWith(normName));
    if (prefixMatches.length === 1) return prefixMatches[0];

    return null;
  }

  const [allSubjects] = await pool.query(`SELECT id, name, code FROM subjects`);
  function findSubjectCached(subjName) {
    if (!subjName) return null;
    const norm = subjName.trim().toLowerCase();
    const exact = allSubjects.find(s =>
      s.name.trim().toLowerCase() === norm ||
      (s.code && s.code.trim().toLowerCase() === norm)
    );
    if (exact) return exact;
    const prefix = allSubjects.find(s => s.name.trim().toLowerCase().startsWith(norm));
    return prefix || null;
  }

  const [existingUsers] = await pool.query(
    `SELECT id, role, id_number, first_name, last_name, contact_number, email, temp_password FROM users`
  );

  const existingIdSet = new Set();
  const existingEmailSet = new Set();
  const parentsByPhone = new Map();
  const parentsByName = new Map();
  const teachersByPhone = new Map();
  const teachersByName = new Map();

  const year = new Date().getFullYear().toString().slice(-2);
  let currentMaxIdNum = 0;

  for (const u of existingUsers) {
    const id = String(u.id_number || '').trim();
    if (id) {
      existingIdSet.add(id.toLowerCase());
      if (id.startsWith(`${year}-`)) {
        const parts = id.split('-');
        const num = parseInt(parts[1], 10);
        if (!isNaN(num) && num > currentMaxIdNum) currentMaxIdNum = num;
      }
    }
    const em = String(u.email || '').trim().toLowerCase();
    if (em) existingEmailSet.add(em);

    const phone = cleanPhone(u.contact_number);
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase();

    if (u.role === 'parent') {
      if (phone) parentsByPhone.set(phone, u);
      if (fullName) parentsByName.set(fullName, u);
    } else if (u.role === 'teacher') {
      if (phone) teachersByPhone.set(phone, u);
      if (fullName) teachersByName.set(fullName, u);
    }
  }

  function allocateNextIdNumber() {
    while (true) {
      currentMaxIdNum++;
      const candidate = `${year}-${String(currentMaxIdNum).padStart(5, '0')}`;
      if (!existingIdSet.has(candidate.toLowerCase())) {
        existingIdSet.add(candidate.toLowerCase());
        return candidate;
      }
    }
  }

  function allocateUniqueEmail(firstName, lastName, role) {
    const slugFirst = (firstName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const slugLast = (lastName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const roleSlug = (role || '').trim().toLowerCase();
    let email = `${slugFirst}.${slugLast}@${roleSlug}.tshs.edu.ph`;
    let suffix = 1;
    while (existingEmailSet.has(email.toLowerCase())) {
      suffix++;
      email = `${slugFirst}.${slugLast}${suffix}@${roleSlug}.tshs.edu.ph`;
    }
    existingEmailSet.add(email.toLowerCase());
    return email;
  }

  const pendingNotifications = [];
  const pendingParentLinks = [];
  const pendingTeacherSubjects = [];

  // ==========================================
  // A. Process Student/Parent Sheet
  // ==========================================
  if (studentSheet && mode !== 'teachers') {
    const studentRows = XLSX.utils.sheet_to_json(studentSheet, { defval: '' });
    for (let i = 0; i < studentRows.length; i++) {
      const row = studentRows[i];
      const rowNum = i + 2;

      const lrnRaw = get(row, 'LRN', 'Learner Reference Number', 'Student LRN', 'ID Number', 'ID');
      const nameOfStudent = get(row, 'Name of student', 'Student Name', 'Name');
      let firstName = get(row, 'First Name', 'FirstName');
      let middleInitial = get(row, 'Middle Initial', 'MI');
      let lastName = get(row, 'Last Name', 'LastName');

      if (nameOfStudent) {
        const parsed = parseFullName(nameOfStudent);
        firstName = parsed.firstName;
        middleInitial = parsed.middleInitial;
        lastName = parsed.lastName;
      }

      const sexRaw = get(row, 'Sex', 'Gender');
      const sex = ['male', 'female', 'other'].includes(sexRaw.toLowerCase())
        ? (sexRaw.charAt(0).toUpperCase() + sexRaw.slice(1).toLowerCase())
        : null;

      const contactNumber = cleanPhone(get(row, 'Contact Number', 'Contact', 'Phone'));
      const gradeLevel = parseGradeLevel(get(row, 'Grade Level', 'Grade'));
      const strandCode = get(row, 'Strand', 'Strand Code');
      const sectionName = get(row, 'Section', 'Section Name');
      const statusRaw = get(row, 'Status(Student, 4ps or Aral Program)', 'Status', 'Program');
      const program = mapProgram(statusRaw);

      const parentName = get(row, "Parent's Name", 'Parent Name', 'Parent');
      const parentContact = cleanPhone(get(row, "Parent's Contact Number", 'Parent Contact', 'Parent Phone'));

      const rowLabel = `${firstName} ${lastName}`.trim() || (nameOfStudent || `(row ${rowNum})`);

      if (!firstName || !lastName || !sectionName) {
        results.push({
          type: 'student',
          row: rowNum,
          name: rowLabel,
          status: 'error',
          message: 'Missing required student field (Name of student, Section).',
        });
        continue;
      }

      try {
        const section = findSectionCached(strandCode, gradeLevel, sectionName);
        if (!section) {
          results.push({
            type: 'student',
            row: rowNum,
            name: rowLabel,
            status: 'error',
            message: `Section "${(strandCode ? strandCode + ' ' : '')}${sectionName}" does not exist. Please check spelling or create the section in Sections & Subjects first.`,
          });
          continue;
        }

        let idNumber = lrnRaw || allocateNextIdNumber();
        let email = get(row, 'Email');
        if (!email) email = allocateUniqueEmail(firstName, lastName, 'Student');

        if (existingIdSet.has(String(idNumber).toLowerCase())) {
          studentsSkippedCount++;
          results.push({
            type: 'student',
            row: rowNum,
            name: rowLabel,
            status: 'skipped',
            message: `Account with ID/LRN "${idNumber}" already exists — skipped (ignored).`,
          });
          continue;
        }

        existingIdSet.add(String(idNumber).toLowerCase());
        existingEmailSet.add(String(email).toLowerCase());

        const tempPassword = idNumber;
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        const [studentRes] = await pool.query(
          `INSERT INTO users (role, program, id_number, first_name, middle_initial, last_name, sex, contact_number, email, password_hash, must_change_password, temp_password, section_id)
           VALUES ('student', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [program, idNumber, firstName, middleInitial || null, lastName, sex, contactNumber || null, email, passwordHash, tempPassword, section.id]
        );
        const studentUserId = studentRes.insertId;
        studentsCreatedCount++;

        pendingNotifications.push([
          studentUserId,
          'account_created',
          'Welcome to Mentorae',
          'Your Student account has been created. Go to your Profile to review your details and add a personal email for real-time updates.',
          null
        ]);

        studentCreds.push({
          idNumber,
          name: rowLabel,
          email,
          tempPassword,
          role: 'Student',
          section: section.name,
          gradeLevel: section.grade_level,
        });

        // ----------------------------------------------------
        // Simultaneous Parent Account Creation & Linking
        // ----------------------------------------------------
        let parentLinkedNotice = '';
        if (parentName && parentName.trim()) {
          const pParsed = parseFullName(parentName);
          const pTypedFullName = `${pParsed.firstName} ${pParsed.lastName}`.trim().toLowerCase();

          let parentUser = null;
          if (parentContact && parentsByPhone.has(parentContact)) {
            parentUser = parentsByPhone.get(parentContact);
          } else if (pTypedFullName && parentsByName.has(pTypedFullName)) {
            parentUser = parentsByName.get(pTypedFullName);
          }

          let isNewParent = false;
          if (!parentUser) {
            const parentIdNumber = allocateNextIdNumber();
            const parentEmail = allocateUniqueEmail(pParsed.firstName, pParsed.lastName, 'Parent');
            const parentTempPass = parentIdNumber;
            const parentHash = await bcrypt.hash(parentTempPass, 10);

            const [pRes] = await pool.query(
              `INSERT INTO users (role, id_number, first_name, middle_initial, last_name, contact_number, email, password_hash, must_change_password, temp_password)
               VALUES ('parent', ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
              [parentIdNumber, pParsed.firstName, pParsed.middleInitial || null, pParsed.lastName, parentContact || null, parentEmail, parentHash, parentTempPass]
            );

            parentUser = {
              id: pRes.insertId,
              id_number: parentIdNumber,
              first_name: pParsed.firstName,
              last_name: pParsed.lastName,
              email: parentEmail,
              temp_password: parentTempPass,
            };
            isNewParent = true;
            parentsCreatedCount++;

            existingIdSet.add(String(parentIdNumber).toLowerCase());
            existingEmailSet.add(String(parentEmail).toLowerCase());
            if (parentContact) parentsByPhone.set(parentContact, parentUser);
            if (pTypedFullName) parentsByName.set(pTypedFullName, parentUser);

            pendingNotifications.push([
              pRes.insertId,
              'account_created',
              'Welcome to Mentorae',
              "Your Parent account has been created. Log in to monitor your child's attendance and academic progress.",
              null
            ]);
          }

          // Link parent to student
          pendingParentLinks.push([parentUser.id, studentUserId]);
          parentsLinkedCount++;

          parentLinkedNotice = ` Linked to parent: ${parentUser.first_name} ${parentUser.last_name}${isNewParent ? ' (New Account Created)' : ''}.`;

          parentCreds.push({
            idNumber: parentUser.id_number,
            name: `${parentUser.first_name} ${parentUser.last_name}`.trim(),
            email: parentUser.email,
            tempPassword: isNewParent ? parentUser.temp_password : '(Existing Account)',
            role: 'Parent',
            childName: rowLabel,
            isNew: isNewParent,
          });
        }

        results.push({
          type: 'student',
          row: rowNum,
          name: rowLabel,
          status: 'created',
          message: `Created Student (${idNumber}).${parentLinkedNotice}`,
        });
      } catch (err) {
        console.error('bulkImport student row error:', err);
        const message = err.code === 'ER_DUP_ENTRY'
          ? 'That ID/LRN or email is already in use.'
          : 'Could not create this student account.';
        results.push({ type: 'student', row: rowNum, name: rowLabel, status: 'error', message });
      }
    }
  }

  // ==========================================
  // B. Process Teacher Sheet
  // ==========================================
  if (teacherSheet && mode !== 'students') {
    const teacherRows = XLSX.utils.sheet_to_json(teacherSheet, { defval: '' });
    for (let i = 0; i < teacherRows.length; i++) {
      const row = teacherRows[i];
      const rowNum = i + 2;

      const rawName = get(row, 'Name', 'Teacher Name', 'Full Name');
      let firstName = get(row, 'First Name', 'FirstName');
      let middleInitial = get(row, 'Middle Initial', 'MI');
      let lastName = get(row, 'Last Name', 'LastName');

      if (rawName) {
        const parsed = parseFullName(rawName);
        firstName = parsed.firstName;
        middleInitial = parsed.middleInitial;
        lastName = parsed.lastName;
      }

      const contactNumber = cleanPhone(get(row, 'Contact Number', 'Contact', 'Phone'));
      const advisorySectionName = get(row, 'Advisory Section', 'Advisory', 'Section');
      const subjectsHandled = get(row, 'Subjects Handled', 'Subjects', 'Subject');

      const rowLabel = `${firstName} ${lastName}`.trim() || (rawName || `(row ${rowNum})`);

      if (!firstName || !lastName) {
        results.push({
          type: 'teacher',
          row: rowNum,
          name: rowLabel,
          status: 'error',
          message: 'Missing teacher name.',
        });
        continue;
      }

      try {
        let teacherUser = null;
        if (contactNumber && teachersByPhone.has(contactNumber)) {
          teacherUser = teachersByPhone.get(contactNumber);
        } else {
          const tFullName = `${firstName} ${lastName}`.trim().toLowerCase();
          if (tFullName && teachersByName.has(tFullName)) {
            teacherUser = teachersByName.get(tFullName);
          }
        }

        let isNewTeacher = false;
        let teacherUserId;
        let tIdNumber;
        let tEmail;
        let tTempPass;

        if (!teacherUser) {
          tIdNumber = allocateNextIdNumber();
          tEmail = allocateUniqueEmail(firstName, lastName, 'Teacher');
          tTempPass = tIdNumber;
          const tHash = await bcrypt.hash(tTempPass, 10);

          const [tRes] = await pool.query(
            `INSERT INTO users (role, id_number, first_name, middle_initial, last_name, contact_number, email, password_hash, must_change_password, temp_password)
             VALUES ('teacher', ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [tIdNumber, firstName, middleInitial || null, lastName, contactNumber || null, tEmail, tHash, tTempPass]
          );
          teacherUserId = tRes.insertId;
          isNewTeacher = true;
          teachersCreatedCount++;

          teacherUser = {
            id: teacherUserId,
            id_number: tIdNumber,
            first_name: firstName,
            last_name: lastName,
            email: tEmail,
            temp_password: tTempPass,
          };
          existingIdSet.add(String(tIdNumber).toLowerCase());
          existingEmailSet.add(String(tEmail).toLowerCase());
          if (contactNumber) teachersByPhone.set(contactNumber, teacherUser);
          const tFullName = `${firstName} ${lastName}`.trim().toLowerCase();
          if (tFullName) teachersByName.set(tFullName, teacherUser);

          pendingNotifications.push([
            teacherUserId,
            'account_created',
            'Welcome to Mentorae',
            'Your Teacher account has been created. Log in to manage your classes, grading, and attendance.',
            null
          ]);
        } else {
          teacherUserId = teacherUser.id;
          tIdNumber = teacherUser.id_number;
          tEmail = teacherUser.email;
          tTempPass = '(Existing account)';
        }

        // Handle Advisory Section
        let advisoryAssigned = null;
        if (advisorySectionName) {
          const sec = allSections.find(s => s.name.trim().toLowerCase() === advisorySectionName.trim().toLowerCase());
          if (sec) {
            await pool.query('UPDATE sections SET adviser_id = ? WHERE id = ?', [teacherUserId, sec.id]);
            advisoryAssigned = sec.name;
          }
        }

        // Handle Subjects Handled
        let subjectsAssigned = [];
        if (subjectsHandled) {
          const subjectList = subjectsHandled.split(/[,;]/).map(s => s.trim()).filter(Boolean);
          for (const subjName of subjectList) {
            const matchedSubj = findSubjectCached(subjName);
            if (matchedSubj) {
              pendingTeacherSubjects.push([teacherUserId, matchedSubj.id]);
              subjectsAssigned.push(matchedSubj.name);
            }
          }
        }

        teacherCreds.push({
          idNumber: tIdNumber,
          name: rowLabel,
          email: tEmail,
          tempPassword: tTempPass,
          role: 'Teacher',
          advisorySection: advisoryAssigned || 'None',
          subjectsCount: subjectsAssigned.length,
          isNew: isNewTeacher,
        });

        let msg = `Created Teacher account (${tIdNumber}).`;
        if (!isNewTeacher) msg = `Updated existing Teacher account (${tIdNumber}).`;
        if (advisoryAssigned) msg += ` Assigned adviser for ${advisoryAssigned}.`;
        if (subjectsAssigned.length) msg += ` Linked ${subjectsAssigned.length} subject(s).`;

        results.push({
          type: 'teacher',
          row: rowNum,
          name: rowLabel,
          status: 'created',
          message: msg,
        });
      } catch (err) {
        console.error('bulkImport teacher row error:', err);
        results.push({ type: 'teacher', row: rowNum, name: rowLabel, status: 'error', message: 'Could not create this teacher account.' });
      }
    }
  }

  // ----------------------------------------------------
  // Bulk write notifications, parent links, teacher subjects
  // ----------------------------------------------------
  if (pendingNotifications.length > 0) {
    try {
      await pool.query(
        `INSERT INTO notifications (recipient_id, type, title, message, related_student_id) VALUES ?`,
        [pendingNotifications]
      );
    } catch (e) {
      console.error('Bulk notifications insert error:', e);
    }
  }

  if (pendingParentLinks.length > 0) {
    try {
      await pool.query(
        `INSERT IGNORE INTO parent_student_links (parent_id, student_id) VALUES ?`,
        [pendingParentLinks]
      );
    } catch (e) {
      console.error('Bulk parent links insert error:', e);
    }
  }

  if (pendingTeacherSubjects.length > 0) {
    try {
      await pool.query(
        `INSERT IGNORE INTO teacher_subjects (teacher_id, subject_id) VALUES ?`,
        [pendingTeacherSubjects]
      );
    } catch (e) {
      console.error('Bulk teacher subjects insert error:', e);
    }
  }

  // Combined flat credentials list for backwards compatibility
  const flatCredentials = [
    ...studentCreds.map(s => ({ role: 'Student', idNumber: s.idNumber, name: s.name, email: s.email, tempPassword: s.tempPassword })),
    ...parentCreds.filter(p => p.isNew).map(p => ({ role: 'Parent', idNumber: p.idNumber, name: p.name, email: p.email, tempPassword: p.tempPassword })),
    ...teacherCreds.filter(t => t.isNew).map(t => ({ role: 'Teacher', idNumber: t.idNumber, name: t.name, email: t.email, tempPassword: t.tempPassword })),
  ];

  const totalCreated = studentsCreatedCount + parentsCreatedCount + teachersCreatedCount;
  return res.json({
    success: true,
    message: `Import complete: ${studentsCreatedCount} student(s), ${parentsCreatedCount} new parent(s) (${parentsLinkedCount} linked), and ${teachersCreatedCount} teacher(s) created.`,
    summary: {
      studentsCreated: studentsCreatedCount,
      studentsSkipped: studentsSkippedCount,
      parentsCreated: parentsCreatedCount,
      parentsLinked: parentsLinkedCount,
      teachersCreated: teachersCreatedCount,
      totalErrors: results.filter(r => r.status === 'error').length,
    },
    results,
    credentials: flatCredentials,
    categorizedCredentials: {
      students: studentCreds,
      parents: parentCreds,
      teachers: teacherCreds,
    },
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
    return res.json({
      success: true,
      total: Number(counts.total || 0),
      students: Number(counts.students || 0),
      teachers: Number(counts.teachers || 0),
      parents: Number(counts.parents || 0),
      staff: Number(counts.staff || 0),
    });
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

/** POST /api/users/:id/reset-default-password */
async function resetDefaultPassword(req, res) {
  try {
    const [[user]] = await pool.query('SELECT id, role, id_number, first_name, last_name FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const defaultPassword = user.id_number;
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    await pool.query(
      'UPDATE users SET password_hash = ?, temp_password = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?',
      [passwordHash, defaultPassword, user.id]
    );

    await notify({
      recipientId: user.id,
      type: 'password_reset',
      title: 'Password Reset to Default',
      message: `Your password has been reset by the administrator to your ID/LRN (${defaultPassword}). You will be required to choose a new password upon your next login.`,
    });

    return res.json({
      success: true,
      message: `Password for ${user.first_name} ${user.last_name} has been reset to default (${defaultPassword}).`,
      defaultPassword,
    });
  } catch (err) {
    console.error('resetDefaultPassword error:', err);
    return res.status(500).json({ success: false, message: 'Could not reset password.' });
  }
}

module.exports = {
  generateId,
  generateEmail,
  createUser,
  getUser,
  listUsers,
  exportUsers,
  updateUser,
  deleteUser,
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
  resetDefaultPassword,
};
