const pool = require('../config/db');
const { canViewStudent, teacherTeachesStudent, teacherTeachesSection } = require('../utils/authz');

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

/**
 * GET /api/badges/leaderboard?scope=section|school&sectionId=&limit=
 * Ranks students by total badge points. Students/parents default to their
 * own section; teachers/admins can pass sectionId or scope=school for the
 * whole campus.
 */
async function getLeaderboard(req, res) {
  try {
    let sectionId = req.query.sectionId || null;
    const scope = req.query.scope === 'school' ? 'school' : 'section';
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    if (req.user.role === 'student' && scope !== 'school') {
      const [rows] = await pool.query('SELECT section_id FROM users WHERE id = ?', [req.user.id]);
      sectionId = rows[0]?.section_id || null;
    }
    if (req.user.role === 'parent' && scope !== 'school') {
      if (!sectionId) {
        const [rows] = await pool.query(
          `SELECT u.section_id FROM parent_student_links l JOIN users u ON u.id = l.student_id
           WHERE l.parent_id = ? LIMIT 1`,
          [req.user.id]
        );
        sectionId = rows[0]?.section_id || null;
      }
    }
    if (req.user.role === 'teacher' && sectionId) {
      const teaches = await teacherTeachesSection(req.user.id, sectionId);
      if (!teaches) {
        return res.status(403).json({ success: false, message: 'You do not teach this section.' });
      }
    }

    const conditions = ["u.role = 'student'"];
    const params = [];
    if (scope === 'section') {
      if (!sectionId) {
        return res.json({ success: true, leaderboard: [] });
      }
      conditions.push('u.section_id = ?');
      params.push(sectionId);
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name, u.profile_picture_url,
              sec.name AS sectionName, st.code AS strandCode, sec.grade_level,
              COALESCE(SUM(bc.points), 0) AS totalPoints,
              COUNT(sb.badge_id) AS badgeCount
       FROM users u
       LEFT JOIN sections sec ON sec.id = u.section_id
       LEFT JOIN strands st ON st.id = sec.strand_id
       LEFT JOIN student_badges sb ON sb.student_id = u.id
       LEFT JOIN badge_catalog bc ON bc.id = sb.badge_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY u.id
       ORDER BY totalPoints DESC, badgeCount DESC, u.last_name ASC
       LIMIT ?`,
      [...params, limit]
    );

    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      id: r.id,
      idNumber: r.id_number,
      name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
      profilePictureUrl: r.profile_picture_url || null,
      section: r.sectionName ? `Grade ${r.grade_level} - ${r.strandCode} (${r.sectionName})` : null,
      points: Number(r.totalPoints),
      badgeCount: r.badgeCount,
    }));

    return res.json({ success: true, leaderboard, scope, sectionId });
  } catch (err) {
    console.error('getLeaderboard error:', err);
    return res.status(500).json({ success: false, message: 'Could not load the leaderboard.' });
  }
}

module.exports = { getCatalog, awardBadges, getStudentBadges, getLeaderboard };
