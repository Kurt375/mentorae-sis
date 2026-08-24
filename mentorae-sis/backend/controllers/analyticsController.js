const pool = require('../config/db');

function classifyRisk(grade, attendanceRate) {
  const g = grade === null ? 100 : Number(grade);
  const a = attendanceRate === null ? 100 : Number(attendanceRate);
  if (g < 75 || a < 75) return 'High';
  if (g < 85 || a < 90) return 'Medium';
  return 'Low';
}

/** GET /api/analytics/grade-trend — school-wide average grade per term, in term order */
async function getGradeTrend(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT term, ROUND(AVG(average), 1) AS avgGrade, MIN(created_at) AS firstSeen
       FROM grades GROUP BY term ORDER BY firstSeen`
    );
    return res.json({
      success: true,
      labels: rows.map((r) => r.term),
      data: rows.map((r) => Number(r.avgGrade)),
    });
  } catch (err) {
    console.error('getGradeTrend error:', err);
    return res.status(500).json({ success: false, message: 'Could not load the grade trend.' });
  }
}

/** GET /api/analytics/risk-distribution — High/Medium/Low risk counts (%) across all students */
async function getRiskDistribution(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id,
              (SELECT ROUND(AVG(average), 1) FROM grades WHERE student_id = u.id) AS grade,
              (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id) AS attendanceRate
       FROM users u WHERE u.role = 'student'`
    );

    const counts = { High: 0, Medium: 0, Low: 0 };
    for (const r of rows) {
      counts[classifyRisk(r.grade, r.attendanceRate)]++;
    }
    const total = rows.length || 1;

    return res.json({
      success: true,
      labels: ['High Risk', 'Medium Risk', 'Low Risk'],
      data: [
        Math.round((counts.High / total) * 100),
        Math.round((counts.Medium / total) * 100),
        Math.round((counts.Low / total) * 100),
      ],
    });
  } catch (err) {
    console.error('getRiskDistribution error:', err);
    return res.status(500).json({ success: false, message: 'Could not load risk distribution.' });
  }
}

/** GET /api/analytics/risk-directory — named list of Medium/High risk students */
async function getRiskDirectory(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name,
              (SELECT ROUND(AVG(average), 1) FROM grades WHERE student_id = u.id) AS grade,
              (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id) AS attendanceRate
       FROM users u WHERE u.role = 'student'`
    );

    const directory = rows
      .map((r) => ({
        idNumber: r.id_number,
        name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
        grade: r.grade,
        attendanceRate: r.attendanceRate,
        risk: classifyRisk(r.grade, r.attendanceRate),
      }))
      .filter((s) => s.risk !== 'Low')
      .sort((a, b) => (a.risk === 'High' ? -1 : 1));

    return res.json({ success: true, directory });
  } catch (err) {
    console.error('getRiskDirectory error:', err);
    return res.status(500).json({ success: false, message: 'Could not load the risk directory.' });
  }
}

module.exports = { getGradeTrend, getRiskDistribution, getRiskDirectory };
