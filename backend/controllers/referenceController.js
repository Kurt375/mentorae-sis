const pool = require('../config/db');

/** GET /api/reference/strands */
async function listStrands(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM strands ORDER BY code');
    return res.json({ success: true, strands: rows });
  } catch (err) {
    console.error('listStrands error:', err);
    return res.status(500).json({ success: false, message: 'Could not load strands.' });
  }
}

/** GET /api/reference/sections?strandId=&gradeLevel= */
async function listSections(req, res) {
  try {
    const params = [];
    let sql = `
      SELECT s.id, s.name, s.grade_level, s.strand_id, st.code AS strandCode, st.title AS strandTitle,
             (SELECT COUNT(*) FROM users u WHERE u.section_id = s.id AND u.role = 'student') AS studentCount
      FROM sections s JOIN strands st ON st.id = s.strand_id
      WHERE 1=1`;
    if (req.query.strandId) {
      sql += ' AND s.strand_id = ?';
      params.push(req.query.strandId);
    }
    if (req.query.gradeLevel) {
      sql += ' AND s.grade_level = ?';
      params.push(req.query.gradeLevel);
    }
    sql += ' ORDER BY st.code, s.grade_level, s.name';

    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, sections: rows });
  } catch (err) {
    console.error('listSections error:', err);
    return res.status(500).json({ success: false, message: 'Could not load sections.' });
  }
}

/** POST /api/reference/sections — admin creates a section { strandId, gradeLevel, name } */
async function createSection(req, res) {
  const { strandId, gradeLevel, name } = req.body;
  if (!strandId || !gradeLevel || !name) {
    return res.status(400).json({ success: false, message: 'Strand, grade level, and section name are required.' });
  }
  try {
    await pool.query('INSERT INTO sections (strand_id, grade_level, name) VALUES (?, ?, ?)', [
      strandId,
      gradeLevel,
      name,
    ]);
    return res.json({ success: true, message: 'Section created.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'That section already exists for this strand/grade.' });
    }
    console.error('createSection error:', err);
    return res.status(500).json({ success: false, message: 'Could not create section.' });
  }
}

/** GET /api/reference/subjects */
async function listSubjects(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM subjects ORDER BY name');
    return res.json({ success: true, subjects: rows });
  } catch (err) {
    console.error('listSubjects error:', err);
    return res.status(500).json({ success: false, message: 'Could not load subjects.' });
  }
}

module.exports = { listStrands, listSections, createSection, listSubjects };
