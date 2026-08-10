const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../config/db');
const { parsePagination, paginatedMeta } = require('../utils/pagination');

/** GET /api/users/generate-id?role=Student — next sequential ID for the current year */
async function generateId(req, res) {
  try {
    const year = new Date().getFullYear().toString().slice(-2);
    const [[{ count }]] = await pool.query(
      "SELECT COUNT(*) AS count FROM users WHERE id_number LIKE ?",
      [`${year}-%`]
    );
    let next = count + 1;
    let idNumber;
    // Guard against a rare collision (e.g. a manually-created account already used this number)
    for (let attempt = 0; attempt < 20; attempt++) {
      idNumber = `${year}-${String(next).padStart(5, '0')}`;
      const [existing] = await pool.query('SELECT 1 FROM users WHERE id_number = ?', [idNumber]);
      if (!existing[0]) break;
      next++;
    }
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

    return res.json({ success: true, email });
  } catch (err) {
    console.error('generateEmail error:', err);
    return res.status(500).json({ success: false, message: 'Could not generate an email.' });
  }
}

/** POST /api/users — create a user account, auto-generating a temporary password */
async function createUser(req, res) {
  const { firstName, middleInitial, lastName, contactNumber, idNumber, email, role, sectionId } = req.body;

  const validRoles = ['Student', 'Teacher', 'Parent', 'Admin', 'Security'];
  if (!firstName || !lastName || !contactNumber || !idNumber || !email || !role || !validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: 'All fields are required and role must be valid.' });
  }

  try {
    const tempPassword = crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10);
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await pool.query(
      `INSERT INTO users (role, id_number, first_name, middle_initial, last_name, contact_number, email, password_hash, section_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        role.toLowerCase(),
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

    return res.json({
      success: true,
      message: `${firstName} ${lastName} created as ${role}.`,
      tempPassword, // shown once — admin must share this with the new user
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
    const { page, limit, offset } = parsePagination(req.query, { limit: 25 });
    const conditions = [];
    const params = [];

    if (req.query.role && req.query.role !== 'All') {
      conditions.push('role = ?');
      params.push(req.query.role.toLowerCase());
    }
    if (req.query.search) {
      conditions.push('(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR id_number LIKE ?)');
      const like = `%${req.query.search}%`;
      params.push(like, like, like, like);
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

/** PATCH /api/users/:id  { isActive? } */
async function updateUser(req, res) {
  const { isActive } = req.body;
  try {
    if (isActive !== undefined) {
      await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, req.params.id]);
    }
    return res.json({ success: true, message: 'User updated.' });
  } catch (err) {
    console.error('updateUser error:', err);
    return res.status(500).json({ success: false, message: 'Could not update user.' });
  }
}

/** GET /api/users/overview — stat cards (Total/Students/Teachers/Parents/Staff) */
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
};
