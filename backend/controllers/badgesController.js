const pool = require('../config/db');
const { canViewStudent, teacherTeachesStudent } = require('../utils/authz');

/** GET /api/badges/catalog — the fixed set of awardable badges */
async function getCatalog(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM badge_catalog');
    return res.json({ success: true, badges: rows });
  } catch (err) {
    console.error('getCatalog error:', err);
    return res.status(500).json({ success: false, message: 'Could not load the badge catalog.' });
  }
}

/** POST /api/badges/award  { studentId, badgeIds: [] } */
async function awardBadges(req, res) {
  const { studentId, badgeIds } = req.body;
  if (!studentId || !Array.isArray(badgeIds) || !badgeIds.length) {
    return res.status(400).json({ success: false, message: 'studentId and at least one badgeId are required.' });
  }

  try {
    if (req.user.role === 'teacher') {
      const teaches = await teacherTeachesStudent(req.user.id, studentId);
      if (!teaches) {
        return res.status(403).json({ success: false, message: 'You do not teach this student.' });
      }
    }

    const [catalogRows] = await pool.query('SELECT * FROM badge_catalog WHERE id IN (?)', [badgeIds]);
    if (!catalogRows.length) {
      return res.status(400).json({ success: false, message: 'No valid badges selected.' });
    }

    for (const badge of catalogRows) {
      await pool.query('INSERT IGNORE INTO student_badges (student_id, badge_id, awarded_by) VALUES (?, ?, ?)', [
        studentId,
        badge.id,
        req.user.id,
      ]);
      await pool.query('INSERT INTO activity_log (student_id, description) VALUES (?, ?)', [
        studentId,
        `Awarded "${badge.name}" badge`,
      ]);
    }

    return res.json({
      success: true,
      message: `Awarded "${catalogRows.map((b) => b.name).join(', ')}" badge(s).`,
    });
  } catch (err) {
    console.error('awardBadges error:', err);
    return res.status(500).json({ success: false, message: 'Could not award badges.' });
  }
}

/** GET /api/badges/student/:studentId — a student's earned badges + recent activity */
async function getStudentBadges(req, res) {
  try {
    if (String(req.user.id) !== String(req.params.studentId)) {
      const gate = await canViewStudent(req.user, req.params.studentId);
      if (!gate.ok) return res.status(gate.status).json({ success: false, message: gate.message });
    }

    const [badges] = await pool.query(
      `SELECT sb.badge_id, sb.earned_at, bc.name, bc.icon, bc.symbol, bc.bg, bc.color
       FROM student_badges sb JOIN badge_catalog bc ON bc.id = sb.badge_id
       WHERE sb.student_id = ? ORDER BY sb.earned_at DESC`,
      [req.params.studentId]
    );
    const [activity] = await pool.query(
      'SELECT description, created_at FROM activity_log WHERE student_id = ? ORDER BY created_at DESC LIMIT 15',
      [req.params.studentId]
    );
    return res.json({ success: true, badges, activity });
  } catch (err) {
    console.error('getStudentBadges error:', err);
    return res.status(500).json({ success: false, message: 'Could not load badges.' });
  }
}

module.exports = { getCatalog, awardBadges, getStudentBadges };
