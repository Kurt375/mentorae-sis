const pool = require('../config/db');
const { classifyRisk, toFeatureVector } = require('../ml/features');
const riskModel = require('../ml/riskModel');
const { buildRecommendations } = require('../ml/prescriptive');

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

/**
 * GET /api/analytics/predictive-risk — ML-forecasted risk for students
 * with a term still in progress (exam not yet recorded), using the
 * trained Random Forest (backend/ml/riskModel.js + scripts/train-risk-model.js).
 * Falls back to the rule-based classification (labeled as such) if no
 * model has been trained yet.
 */
async function getPredictiveRisk(req, res) {
  try {
    const loaded = riskModel.load();

    // "In progress" = latest grade row per student/subject where the exam
    // hasn't been recorded yet — these are exactly the students for whom a
    // forecast (as opposed to just reading off the final grade) is useful.
    const [rows] = await pool.query(
      `SELECT g.id AS gradeId, u.id AS studentId, u.id_number, u.first_name, u.middle_initial, u.last_name,
              sub.name AS subjectName, g.term, g.quiz_score, g.activity_score, g.exam_score,
              (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id) AS attendanceRate
       FROM grades g
       JOIN users u ON u.id = g.student_id
       JOIN subjects sub ON sub.id = g.subject_id
       WHERE u.role = 'student' AND g.exam_score IS NULL
       ORDER BY g.updated_at DESC`
    );

    const predictions = rows.map((r) => {
      const features = toFeatureVector({
        quiz_score: r.quiz_score,
        activity_score: r.activity_score,
        attendanceRate: r.attendanceRate,
      });

      let risk;
      let confidence = null;
      if (loaded) {
        const result = riskModel.predictOne(loaded.rf, features);
        risk = result.risk;
        confidence = result.confidence;
      } else {
        // Fallback: same rule the descriptive dashboard uses, so the
        // endpoint still returns something useful before the model is trained.
        risk = classifyRisk(r.quiz_score + r.activity_score, r.attendanceRate);
      }

      const { driver, driverLabel, actions } = buildRecommendations({
        subjectName: r.subjectName,
        quiz_score: r.quiz_score,
        activity_score: r.activity_score,
        exam_score: null, // not recorded yet — this is a forecast
        attendanceRate: r.attendanceRate,
        risk,
      });

      return {
        studentId: r.studentId,
        idNumber: r.id_number,
        name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
        subject: r.subjectName,
        term: r.term,
        attendanceRate: r.attendanceRate,
        predictedRisk: risk,
        confidence,
        driver,
        driverLabel,
        recommendedActions: actions,
      };
    });

    predictions.sort((a, b) => {
      const order = { High: 0, Medium: 1, Low: 2 };
      return order[a.predictedRisk] - order[b.predictedRisk];
    });

    return res.json({
      success: true,
      modelTrained: !!loaded,
      trainedAt: loaded ? loaded.trainedAt : null,
      modelMeta: loaded ? loaded.meta : null,
      predictions,
    });
  } catch (err) {
    console.error('getPredictiveRisk error:', err);
    return res.status(500).json({ success: false, message: 'Could not load predictive risk analytics.' });
  }
}

module.exports = { getGradeTrend, getRiskDistribution, getRiskDirectory, getPredictiveRisk };
