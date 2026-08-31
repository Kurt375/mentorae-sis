const pool = require('../config/db');
const { canViewStudent, teacherTeachesSection, teacherTeachesStudent } = require('../utils/authz');
const { classifyRisk, toFeatureVector } = require('../ml/features');
const riskModel = require('../ml/riskModel');
const { buildRecommendations, QUIZ_MAX, ACTIVITY_MAX, EXAM_MAX } = require('../ml/prescriptive');

function getRemarks(average) {
  if (average >= 90) return 'Outstanding';
  if (average >= 85) return 'Very Satisfactory';
  if (average >= 80) return 'Satisfactory';
  if (average >= 75) return 'Fairly Satisfactory';
  return 'Did Not Meet Expectations';
}

/** GET /api/grades/roster?sectionId=&subjectId=&term= — teacher's grade encoding sheet */
async function getRosterGrades(req, res) {
  const { sectionId, subjectId, term } = req.query;
  if (!sectionId || !subjectId || !term) {
    return res.status(400).json({ success: false, message: 'sectionId, subjectId, and term are required.' });
  }

  try {
    if (req.user.role === 'teacher') {
      const teaches = await teacherTeachesSection(req.user.id, sectionId);
      if (!teaches) {
        return res.status(403).json({ success: false, message: 'You do not teach this section.' });
      }
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name,
              g.quiz_score, g.activity_score, g.exam_score, g.average
       FROM users u
       LEFT JOIN grades g ON g.student_id = u.id AND g.subject_id = ? AND g.section_id = ? AND g.term = ?
       WHERE u.role = 'student' AND u.section_id = ?
       ORDER BY u.last_name`,
      [subjectId, sectionId, term, sectionId]
    );

    const roster = rows.map((r) => ({
      studentId: r.id,
      idNumber: r.id_number,
      name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
      quiz: r.quiz_score,
      activity: r.activity_score,
      exam: r.exam_score,
      average: r.average,
      remarks: r.average !== null ? getRemarks(r.average) : null,
    }));

    return res.json({ success: true, roster });
  } catch (err) {
    console.error('getRosterGrades error:', err);
    return res.status(500).json({ success: false, message: 'Could not load the grade sheet.' });
  }
}

/** POST /api/grades  { studentId, subjectId, sectionId, term, quiz, activity, exam } — save one student's grade */
async function saveGrade(req, res) {
  const { studentId, subjectId, sectionId, term, quiz, activity, exam } = req.body;

  if (!studentId || !subjectId || !sectionId || !term) {
    return res.status(400).json({ success: false, message: 'studentId, subjectId, sectionId, and term are required.' });
  }
  const q = Number(quiz) || 0;
  const a = Number(activity) || 0;
  // exam is intentionally NOT coerced with "|| 0" -- an empty/omitted exam
  // means "not recorded yet" (stored as NULL) and must stay distinguishable
  // from a real, entered score of 0. See migration 007 for why this matters.
  const examProvided = exam !== undefined && exam !== null && exam !== '';
  const e = examProvided ? Number(exam) : null;
  if (q < 0 || q > 30 || a < 0 || a > 20 || (e !== null && (e < 0 || e > 50))) {
    return res.status(400).json({ success: false, message: 'Quiz (0-30), Activity (0-20), and Exam (0-50) are out of range.' });
  }

  try {
    if (req.user.role === 'teacher') {
      const teaches = await teacherTeachesStudent(req.user.id, studentId);
      if (!teaches) {
        return res.status(403).json({ success: false, message: 'You do not teach this student.' });
      }
    }

    await pool.query(
      `INSERT INTO grades (student_id, subject_id, section_id, term, quiz_score, activity_score, exam_score, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE quiz_score = VALUES(quiz_score), activity_score = VALUES(activity_score),
         exam_score = VALUES(exam_score), recorded_by = VALUES(recorded_by)`,
      [studentId, subjectId, sectionId, term, q, a, e, req.user.id]
    );

    const average = q + a + e;
    await pool.query('INSERT INTO activity_log (student_id, description) VALUES (?, ?)', [
      studentId,
      `Grade posted (${term}): ${average} — ${getRemarks(average)}`,
    ]);

    return res.json({ success: true, message: 'Grade saved.', average, remarks: getRemarks(average) });
  } catch (err) {
    console.error('saveGrade error:', err);
    return res.status(500).json({ success: false, message: 'Could not save grade.' });
  }
}

/** GET /api/grades/mine — student's own grades across all subjects/terms */
async function getMyGrades(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT g.subject_id AS subjectId, sub.name AS subject, g.term, g.quiz_score, g.activity_score, g.exam_score, g.average
       FROM grades g JOIN subjects sub ON sub.id = g.subject_id
       WHERE g.student_id = ? ORDER BY g.updated_at DESC`,
      [req.user.id]
    );
    const grades = rows.map((r) => ({ ...r, remarks: getRemarks(r.average) }));
    const overall = grades.length
      ? (grades.reduce((sum, g) => sum + Number(g.average), 0) / grades.length).toFixed(1)
      : null;

    return res.json({ success: true, overallGrade: overall, grades });
  } catch (err) {
    console.error('getMyGrades error:', err);
    return res.status(500).json({ success: false, message: 'Could not load grades.' });
  }
}

/** GET /api/grades/student/:studentId — teacher/admin/parent (with link check) view */
async function getStudentGrades(req, res) {
  const { studentId } = req.params;
  try {
    if (String(req.user.id) !== String(studentId)) {
      const gate = await canViewStudent(req.user, studentId);
      if (!gate.ok) return res.status(gate.status).json({ success: false, message: gate.message });
    }

    const [rows] = await pool.query(
      `SELECT sub.name AS subject, g.term, g.average
       FROM grades g JOIN subjects sub ON sub.id = g.subject_id
       WHERE g.student_id = ? ORDER BY g.updated_at DESC`,
      [studentId]
    );
    const grades = rows.map((r) => ({ ...r, remarks: getRemarks(r.average) }));
    const overall = grades.length
      ? (grades.reduce((sum, g) => sum + Number(g.average), 0) / grades.length).toFixed(1)
      : null;

    return res.json({ success: true, overallGrade: overall, grades });
  } catch (err) {
    console.error('getStudentGrades error:', err);
    return res.status(500).json({ success: false, message: 'Could not load grades.' });
  }
}

/**
 * GET /api/grades/prescriptive-path?subjectId=&term=&targetGrade= — student-only.
 * Implements the "Prescriptive Path to Goal" screen from the capstone paper:
 * given a target grade, works out what's still needed and returns an
 * ML-informed recommended practice path.
 */
async function getPrescriptivePath(req, res) {
  const { subjectId, term } = req.query;
  const targetGrade = req.query.targetGrade !== undefined ? Number(req.query.targetGrade) : null;

  if (!subjectId || !term) {
    return res.status(400).json({ success: false, message: 'subjectId and term are required.' });
  }
  if (targetGrade !== null && (Number.isNaN(targetGrade) || targetGrade < 0 || targetGrade > 100)) {
    return res.status(400).json({ success: false, message: 'targetGrade must be a number between 0 and 100.' });
  }

  try {
    const [gradeRows] = await pool.query(
      `SELECT g.quiz_score, g.activity_score, g.exam_score, g.average, sub.name AS subjectName
       FROM grades g JOIN subjects sub ON sub.id = g.subject_id
       WHERE g.student_id = ? AND g.subject_id = ? AND g.term = ? LIMIT 1`,
      [req.user.id, subjectId, term]
    );
    if (!gradeRows.length) {
      return res.status(404).json({ success: false, message: 'No grade record found for that subject/term yet.' });
    }
    const g = gradeRows[0];

    const [attRows] = await pool.query(
      `SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) AS attendanceRate
       FROM attendance_logs WHERE student_id = ?`,
      [req.user.id]
    );
    const attendanceRate = attRows[0]?.attendanceRate ?? null;

    const quiz = Number(g.quiz_score) || 0;
    const activity = Number(g.activity_score) || 0;
    // Check the raw DB value for null BEFORE coercing -- coercing first
    // (e.g. "Number(g.exam_score) || 0") would make a real exam score of 0
    // indistinguishable from "not recorded yet." See migration 007.
    const examRecorded = g.exam_score !== null && g.exam_score !== undefined;
    const exam = examRecorded ? Number(g.exam_score) : 0;

    // Category performance indicators (the circular % displays in Figure 14).
    const categoryPerformance = {
      writtenWork: Math.round((quiz / QUIZ_MAX) * 100),
      performanceTask: Math.round((activity / ACTIVITY_MAX) * 100),
      quarterlyExam: examRecorded ? Math.round((exam / EXAM_MAX) * 100) : null,
    };

    // Goal math: how much of the exam (or remaining components) is needed
    // to reach the student's target grade, given what's already recorded.
    let goal = null;
    if (targetGrade !== null) {
      const neededFromExam = targetGrade - quiz - activity;
      const feasible = neededFromExam <= EXAM_MAX;
      goal = {
        targetGrade,
        currentLocked: quiz + activity, // Written Work + Performance Task already recorded
        neededExamScore: examRecorded ? null : Math.max(0, Math.min(EXAM_MAX, Math.round(neededFromExam * 10) / 10)),
        feasible: examRecorded ? null : feasible,
        note: examRecorded
          ? 'The Quarterly Exam for this term is already recorded — this target reflects the final average.'
          : (feasible
            ? 'Reaching this target is still possible based on the Quarterly Exam alone.'
            : `Even a perfect Quarterly Exam score (${EXAM_MAX}) would fall short of this target — consider improving Written Work or Performance Task scores too, or set a more achievable goal.`),
      };
    }

    // ML-informed risk forecast + recommended practice path.
    const loaded = riskModel.load();
    const features = toFeatureVector({ quiz_score: quiz, activity_score: activity, attendanceRate });
    let predictedRisk;
    let confidence = null;
    if (!examRecorded && loaded) {
      const result = riskModel.predictOne(loaded.rf, features);
      predictedRisk = result.risk;
      confidence = result.confidence;
    } else {
      predictedRisk = classifyRisk(g.average, attendanceRate);
    }

    const { driverLabel, actions } = buildRecommendations({
      subjectName: g.subjectName,
      quiz_score: quiz,
      activity_score: activity,
      exam_score: examRecorded ? exam : null,
      attendanceRate,
      risk: predictedRisk,
    });

    return res.json({
      success: true,
      subject: g.subjectName,
      term,
      current: { quiz, activity, exam: examRecorded ? exam : null, average: g.average },
      categoryPerformance,
      attendanceRate,
      goal,
      predictedRisk,
      confidence,
      modelTrained: !!loaded,
      focusArea: driverLabel,
      recommendedPath: actions,
    });
  } catch (err) {
    console.error('getPrescriptivePath error:', err);
    return res.status(500).json({ success: false, message: 'Could not build the prescriptive path.' });
  }
}

module.exports = { getRosterGrades, saveGrade, getMyGrades, getStudentGrades, getPrescriptivePath };
