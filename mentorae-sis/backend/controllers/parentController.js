const pool = require('../config/db');

/** GET /api/parent/children — linked children with a quick overview each */
async function getMyChildren(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name,
              sec.grade_level, sec.name AS sectionName, st.code AS strandCode,
              (SELECT ROUND(AVG(average), 1) FROM grades WHERE student_id = u.id) AS overallGrade,
              (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id) AS attendanceRate,
              (SELECT status FROM attendance_logs WHERE student_id = u.id ORDER BY scan_date DESC LIMIT 1) AS lastStatus
       FROM parent_student_links pl
       JOIN users u ON u.id = pl.student_id
       LEFT JOIN sections sec ON sec.id = u.section_id
       LEFT JOIN strands st ON st.id = sec.strand_id
       WHERE pl.parent_id = ?`,
      [req.user.id]
    );

    const children = rows.map((r) => ({
      id: r.id,
      idNumber: r.id_number,
      name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
      section: r.sectionName ? `Grade ${r.grade_level} - ${r.strandCode} (${r.sectionName})` : '—',
      overallGrade: r.overallGrade,
      attendanceRate: r.attendanceRate,
      lastStatus: r.lastStatus,
    }));

    return res.json({ success: true, children });
  } catch (err) {
    console.error('getMyChildren error:', err);
    return res.status(500).json({ success: false, message: 'Could not load your children.' });
  }
}

module.exports = { getMyChildren };
