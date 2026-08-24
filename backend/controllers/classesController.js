const pool = require('../config/db');
const { teacherTeachesSection } = require('../utils/authz');

/**
 * GET /api/classes/roster?sectionId=
 * Powers the top student roster table on Class Management (id, name,
 * overall grade, attendance %, today's status).
 */
async function getRosterOverview(req, res) {
  const { sectionId } = req.query;
  if (!sectionId) {
    return res.status(400).json({ success: false, message: 'sectionId is required.' });
  }

  try {
    if (req.user.role === 'teacher') {
      const teaches = await teacherTeachesSection(req.user.id, sectionId);
      if (!teaches) {
        return res.status(403).json({ success: false, message: 'You do not teach this section.' });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name,
              (SELECT ROUND(AVG(average), 1) FROM grades WHERE student_id = u.id) AS grade,
              (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id) AS attendanceRate,
              (SELECT status FROM attendance_logs WHERE student_id = u.id AND scan_date = ?) AS todayStatus
       FROM users u
       WHERE u.role = 'student' AND u.section_id = ?
       ORDER BY u.last_name`,
      [today, sectionId]
    );

    const roster = rows.map((r) => ({
      id: r.id,
      idNumber: r.id_number,
      name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
      grade: r.grade,
      attendance: r.attendanceRate !== null ? `${r.attendanceRate}%` : '—',
      status: r.todayStatus || 'absent',
    }));

    return res.json({ success: true, roster });
  } catch (err) {
    console.error('getRosterOverview error:', err);
    return res.status(500).json({ success: false, message: 'Could not load class roster.' });
  }
}

/** GET /api/classes/my-sections — sections this teacher has a schedule in (for the filter dropdowns) */
async function getMySections(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT sec.id, sec.name, sec.grade_level, st.code AS strandCode
       FROM schedules sch
       JOIN sections sec ON sec.id = sch.section_id
       JOIN strands st ON st.id = sec.strand_id
       WHERE sch.teacher_id = ?
       ORDER BY st.code, sec.grade_level, sec.name`,
      [req.user.id]
    );
    return res.json({ success: true, sections: rows });
  } catch (err) {
    console.error('getMySections error:', err);
    return res.status(500).json({ success: false, message: 'Could not load your sections.' });
  }
}

/** GET /api/classes/my-subjects?sectionId= — subjects this teacher actually teaches (optionally scoped to one section) */
async function getMySubjects(req, res) {
  try {
    const params = [req.user.id];
    let sql = `
      SELECT DISTINCT sub.id, sub.code, sub.name
      FROM schedules sch JOIN subjects sub ON sub.id = sch.subject_id
      WHERE sch.teacher_id = ?`;
    if (req.query.sectionId) {
      sql += ' AND sch.section_id = ?';
      params.push(req.query.sectionId);
    }
    sql += ' ORDER BY sub.name';
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, subjects: rows });
  } catch (err) {
    console.error('getMySubjects error:', err);
    return res.status(500).json({ success: false, message: 'Could not load your subjects.' });
  }
}

module.exports = { getRosterOverview, getMySections, getMySubjects };
