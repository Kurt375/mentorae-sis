const pool = require('../config/db');
const { classifyRisk } = require('../ml/features');
const { buildRecommendations } = require('../ml/prescriptive');
const { getActiveTermConfig } = require('../utils/termUtils');

/** GET /api/parent/children — linked children with a quick overview each */
async function getMyChildren(req, res) {
  try {
    const { currentTerm, termStartDate } = await getActiveTermConfig();

    const [rows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name,
              sec.grade_level, sec.name AS sectionName, st.code AS strandCode,
              (SELECT ROUND(AVG(average), 1) FROM grades WHERE student_id = u.id AND term = ?) AS overallGrade,
              (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id AND scan_date >= ?) AS attendanceRate,
              (SELECT status FROM attendance_logs WHERE student_id = u.id ORDER BY scan_date DESC LIMIT 1) AS lastStatus
       FROM parent_student_links pl
       JOIN users u ON u.id = pl.student_id
       LEFT JOIN sections sec ON sec.id = u.section_id
       LEFT JOIN strands st ON st.id = sec.strand_id
       WHERE pl.parent_id = ?`,
      [currentTerm, termStartDate, req.user.id]
    );

    const children = rows.map((r) => ({
      id: r.id,
      idNumber: r.id_number,
      name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
      section: r.sectionName ? `Grade ${r.grade_level} - ${r.strandCode} (${r.sectionName})` : '—',
      sectionName: r.sectionName || null,
      gradeLevel: r.grade_level || null,
      strandCode: r.strandCode || null,
      overallGrade: r.overallGrade !== null ? Number(r.overallGrade) : 0.0,
      attendanceRate: r.attendanceRate !== null ? Number(r.attendanceRate) : 0.0,
      lastStatus: r.lastStatus,
    }));

    return res.json({ success: true, children });
  } catch (err) {
    console.error('getMyChildren error:', err);
    return res.status(500).json({ success: false, message: 'Could not load your children.' });
  }
}

/** GET /api/parent/student/:studentId/recommendations — prescriptive guidance for parent home support */
async function getStudentRecommendationsForParent(req, res) {
  const { studentId } = req.params;
  try {
    if (req.user.role === 'parent') {
      const [links] = await pool.query(
        'SELECT id FROM parent_student_links WHERE parent_id = ? AND student_id = ?',
        [req.user.id, studentId]
      );
      if (!links.length) {
        return res.status(403).json({ success: false, message: 'Access denied. Student is not linked to your account.' });
      }
    }

    const { currentTerm, termStartDate } = await getActiveTermConfig();

    const [[student]] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.last_name,
              sec.name AS sectionName, st.code AS strandCode,
              (SELECT ROUND(AVG(average), 1) FROM grades WHERE student_id = u.id AND term = ?) AS overallGrade,
              (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id AND scan_date >= ?) AS attendanceRate
       FROM users u
       LEFT JOIN sections sec ON sec.id = u.section_id
       LEFT JOIN strands st ON st.id = sec.strand_id
       WHERE u.id = ?`,
      [currentTerm, termStartDate, studentId]
    );

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student record not found.' });
    }

    const [subRows] = await pool.query(
      `SELECT g.average, g.quiz_score, g.activity_score, g.exam_score,
              sub.id AS subjectId, sub.name AS subjectName,
              COALESCE(sub.ww_weight, 20.00) AS ww_weight,
              COALESCE(sub.pt_weight, 50.00) AS pt_weight,
              COALESCE(sub.qa_weight, 30.00) AS qa_weight
       FROM grades g
       JOIN subjects sub ON sub.id = g.subject_id
       WHERE g.student_id = ? AND g.term = ?
       ORDER BY g.average ASC
       LIMIT 1`,
      [studentId, currentTerm]
    );

    const lowest = subRows[0] || null;
    const risk = classifyRisk(student.overallGrade, student.attendanceRate);

    // Get ML/rule-based prescriptive guidance
    const engineRec = buildRecommendations({
      subjectName: lowest ? lowest.subjectName : 'Enrolled Subjects',
      quiz_score: lowest ? lowest.quiz_score : null,
      activity_score: lowest ? lowest.activity_score : null,
      exam_score: lowest ? lowest.exam_score : null,
      attendanceRate: student.attendanceRate,
      risk,
      wwMax: lowest ? lowest.ww_weight : 20,
      ptMax: lowest ? lowest.pt_weight : 50,
      qaMax: lowest ? lowest.qa_weight : 30,
    });

    // Check for active teacher intervention assignment
    let activeAssignment = null;
    try {
      const [assignRows] = await pool.query(
        `SELECT sla.created_at, t.title AS topicTitle, sub.name AS subjectName, sla.notes
         FROM student_lesson_assignments sla
         JOIN topics t ON t.id = sla.topic_id
         JOIN subjects sub ON sub.id = sla.subject_id
         WHERE sla.student_id = ?
         ORDER BY sla.created_at DESC
         LIMIT 1`,
        [studentId]
      );
      if (assignRows.length > 0) {
        activeAssignment = assignRows[0];
      }
    } catch (e) {
      // ignore
    }

    // Compose supportive, home-friendly prescriptive actions
    const homeActions = [];
    if (student.attendanceRate !== null && student.attendanceRate < 85) {
      homeActions.push({
        icon: 'bi-alarm-fill text-warning',
        title: 'Morning Routine & Daily Arrival',
        text: `Attendance is currently at ${student.attendanceRate}%. Ensure your child departs early to arrive and scan their attendance QR pass before 7:00 AM.`
      });
    }

    if (lowest && lowest.average < 75) {
      homeActions.push({
        icon: 'bi-journal-check text-danger',
        title: `Remediation in ${lowest.subjectName}`,
        text: `Current average is ${lowest.average}%. Encourage your child to complete the remedial review topics and practice quizzes in their student Learning Resources portal.`
      });
    } else if (lowest && lowest.average < 85) {
      homeActions.push({
        icon: 'bi-lightbulb-fill text-warning',
        title: `Reinforce ${lowest.subjectName}`,
        text: `Score is at ${lowest.average}%. Reviewing digital flashcards and homework activities together at home will help reinforce key learning competencies.`
      });
    }

    if (activeAssignment) {
      homeActions.push({
        icon: 'bi-check2-circle text-success',
        title: `Teacher Assigned Task: ${activeAssignment.topicTitle}`,
        text: `The subject teacher assigned targeted practice for ${activeAssignment.subjectName}. Confirm that your child has accessed and completed this study task.`
      });
    }

    if (homeActions.length === 0) {
      homeActions.push({
        icon: 'bi-hand-thumbs-up-fill text-success',
        title: 'Maintain Excellent Study Habits',
        text: 'Your child is maintaining good academic performance and attendance. Continue encouraging their hard work and celebrate their earned badges!'
      });
    }

    return res.json({
      success: true,
      student: {
        id: student.id,
        name: `${student.first_name} ${student.last_name}`,
        overallGrade: student.overallGrade,
        attendanceRate: student.attendanceRate,
        riskTier: `${risk} Risk`,
        riskColor: risk === 'High' ? 'text-danger' : risk === 'Medium' ? 'text-warning' : 'text-success'
      },
      prescriptive: {
        focusArea: engineRec.driverLabel,
        subjectName: lowest ? lowest.subjectName : null,
        failingAverage: lowest ? lowest.average : null,
        homeActions,
        activeAssignment
      }
    });
  } catch (err) {
    console.error('getStudentRecommendationsForParent error:', err);
    return res.status(500).json({ success: false, message: 'Could not load parent recommendations.' });
  }
}

module.exports = { getMyChildren, getStudentRecommendationsForParent };

