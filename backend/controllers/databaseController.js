const pool = require('../config/db');

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

module.exports = { browseStudents, browseSubjects, browseStrands };
