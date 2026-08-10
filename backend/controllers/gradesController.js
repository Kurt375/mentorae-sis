const pool = require('../config/db');
const { canViewStudent, teacherTeachesSection, teacherTeachesStudent } = require('../utils/authz');

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
  const e = Number(exam) || 0;
  if (q < 0 || q > 30 || a < 0 || a > 20 || e < 0 || e > 50) {
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
      `SELECT sub.name AS subject, g.term, g.quiz_score, g.activity_score, g.exam_score, g.average
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

module.exports = { getRosterGrades, saveGrade, getMyGrades, getStudentGrades };
