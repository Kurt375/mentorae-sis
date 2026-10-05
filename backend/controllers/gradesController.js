const pool = require('../config/db');
const { canViewStudent, teacherTeachesSection, teacherTeachesStudent } = require('../utils/authz');
const { classifyRisk, toFeatureVector } = require('../ml/features');
const riskModel = require('../ml/riskModel');
const { buildRecommendations, QUIZ_MAX, ACTIVITY_MAX, EXAM_MAX } = require('../ml/prescriptive');

function transmuteDepEdGrade(initialGrade) {
  const g = parseFloat(initialGrade) || 0;
  if (g >= 100) return 100;
  if (g >= 99.50) return 100;
  if (g >= 98.32) return 99;
  if (g >= 97.14) return 98;
  if (g >= 95.96) return 97;
  if (g >= 94.78) return 96;
  if (g >= 93.60) return 95;
  if (g >= 92.42) return 94;
  if (g >= 91.24) return 93;
  if (g >= 90.06) return 92;
  if (g >= 88.88) return 91;
  if (g >= 87.70) return 90;
  if (g >= 86.52) return 89;
  if (g >= 85.34) return 88;
  if (g >= 84.16) return 87;
  if (g >= 82.98) return 86;
  if (g >= 81.80) return 85;
  if (g >= 80.62) return 84;
  if (g >= 79.44) return 83;
  if (g >= 78.26) return 82;
  if (g >= 77.08) return 81;
  if (g >= 75.90) return 80;
  if (g >= 74.72) return 79;
  if (g >= 73.54) return 78;
  if (g >= 72.36) return 77;
  if (g >= 71.18) return 76;
  if (g >= 70.00) return 75; // DepEd Order 15 passing mark
  if (g >= 65.34) return 74;
  if (g >= 60.67) return 73;
  if (g >= 56.01) return 72;
  if (g >= 51.34) return 71;
  if (g >= 46.67) return 70;
  if (g >= 42.01) return 69;
  if (g >= 37.34) return 68;
  if (g >= 32.68) return 67;
  if (g >= 28.01) return 66;
  if (g >= 23.35) return 65;
  if (g >= 18.68) return 64;
  if (g >= 14.01) return 63;
  if (g >= 9.35) return 62;
  if (g >= 4.68) return 61;
  return 60;
}

function getRemarks(average) {
  if (average === null || average === undefined || isNaN(average)) return 'Pending';
  if (average >= 90) return 'Advancing';
  if (average >= 80) return 'Benchmarking';
  if (average >= 75) return 'Connecting';
  if (average >= 65) return 'Developing';
  return 'Emerging';
}

function getTermVariants(term) {
  const t = String(term || '').trim().toLowerCase();
  if (t === 't1' || t.includes('1st') || t.includes('first')) return ['1st Term', '1st Quarter', 't1'];
  if (t === 't2' || t.includes('2nd') || t.includes('second')) return ['2nd Term', '2nd Quarter', 't2'];
  if (t === 't3' || t.includes('3rd') || t.includes('third')) return ['3rd Term', '3rd Quarter', 't3'];
  if (t === 't4' || t.includes('4th') || t.includes('fourth')) return ['4th Term', '4th Quarter', 't4'];
  return [term];
}

function normalizeCanonicalTerm(term) {
  const t = String(term || '').trim().toLowerCase();
  if (t === 't1' || t.includes('1st') || t.includes('first')) return '1st Term';
  if (t === 't2' || t.includes('2nd') || t.includes('second')) return '2nd Term';
  if (t === 't3' || t.includes('3rd') || t.includes('third')) return '3rd Term';
  if (t === 't4' || t.includes('4th') || t.includes('fourth')) return '4th Term';
  return term || '1st Term';
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

    const termList = getTermVariants(term);

    const [rows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name,
              g.quiz_score, g.activity_score, g.exam_score, g.raw_scores, g.average
       FROM users u
       LEFT JOIN grades g ON g.student_id = u.id AND g.subject_id = ? AND (g.section_id = ? OR g.section_id = 0) AND g.term IN (?)
       WHERE u.role = 'student' AND u.section_id = ?
       ORDER BY u.last_name`,
      [subjectId, sectionId, termList, sectionId]
    );

    // Fetch all grades for these students in this term to compute DepEd Transmuted GWA accurately
    const studentIds = rows.map((r) => r.id);
    const [allGradesRows] = studentIds.length
      ? await pool.query(
          `SELECT student_id, term, average FROM grades WHERE student_id IN (?) AND average IS NOT NULL`,
          [studentIds]
        )
      : [[]];

    const studentGradesMap = {};
    for (const gr of allGradesRows) {
      if (!studentGradesMap[gr.student_id]) {
        studentGradesMap[gr.student_id] = { termGrades: [], overallGrades: [] };
      }
      const transmuted = transmuteDepEdGrade(gr.average);
      studentGradesMap[gr.student_id].overallGrades.push(transmuted);
      if (termList.includes(gr.term)) {
        studentGradesMap[gr.student_id].termGrades.push(transmuted);
      }
    }

    const roster = rows.map((r) => {
      let parsedRaw = null;
      if (r.raw_scores) {
        try {
          parsedRaw = typeof r.raw_scores === 'string' ? JSON.parse(r.raw_scores) : r.raw_scores;
        } catch (e) {
          parsedRaw = null;
        }
      }

      const sGrades = studentGradesMap[r.id] || { termGrades: [], overallGrades: [] };
      const termGwa = sGrades.termGrades.length
        ? Number((sGrades.termGrades.reduce((a, b) => a + b, 0) / sGrades.termGrades.length).toFixed(1))
        : null;
      const overallGwa = sGrades.overallGrades.length
        ? Number((sGrades.overallGrades.reduce((a, b) => a + b, 0) / sGrades.overallGrades.length).toFixed(1))
        : null;
      const gwa = termGwa !== null ? termGwa : overallGwa;

      return {
        studentId: r.id,
        idNumber: r.id_number,
        name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
        quiz: r.quiz_score,
        activity: r.activity_score,
        exam: r.exam_score,
        quiz_score: r.quiz_score,
        activity_score: r.activity_score,
        exam_score: r.exam_score,
        rawScores: parsedRaw,
        raw_scores: parsedRaw,
        average: r.average,
        remarks: r.average !== null ? getRemarks(r.average) : null,
        gwa,
        termGwa,
        overallGwa,
      };
    });

    return res.json({ success: true, roster });
  } catch (err) {
    console.error('getRosterGrades error:', err);
    return res.status(500).json({ success: false, message: 'Could not load the grade sheet.' });
  }
}

/** POST /api/grades  { studentId, subjectId, sectionId, term, quiz, activity, exam, raw_scores } — save one student's grade */
async function saveGrade(req, res) {
  const { studentId, subjectId, sectionId, term, quiz, activity, exam, raw_scores } = req.body;

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
  if (q < 0 || q > 100 || a < 0 || a > 100 || (e !== null && (e < 0 || e > 100))) {
    return res.status(400).json({ success: false, message: 'Component scores must be between 0 and 100.' });
  }

  const rawScoresJson = raw_scores ? (typeof raw_scores === 'string' ? raw_scores : JSON.stringify(raw_scores)) : null;

  try {
    if (req.user.role === 'teacher') {
      const teaches = await teacherTeachesStudent(req.user.id, studentId);
      if (!teaches) {
        return res.status(403).json({ success: false, message: 'You do not teach this student.' });
      }
    }

    const canonicalTerm = normalizeCanonicalTerm(term);

    await pool.query(
      `INSERT INTO grades (student_id, subject_id, section_id, term, quiz_score, activity_score, exam_score, raw_scores, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE quiz_score = VALUES(quiz_score), activity_score = VALUES(activity_score),
         exam_score = VALUES(exam_score), raw_scores = VALUES(raw_scores), recorded_by = VALUES(recorded_by)`,
      [studentId, subjectId, sectionId, canonicalTerm, q, a, e, rawScoresJson, req.user.id]
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

/** Shared helper: build full student grade performance and analytics */
async function computeStudentGradePerformance(studentId) {
  // Student profile, section, strand, and adviser info
  const [studentRows] = await pool.query(
    `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name,
            u.section_id, s.name AS sectionName, s.grade_level AS gradeLevel,
            st.code AS strandCode, st.title AS strandTitle,
            CONCAT(adv.first_name, ' ', adv.last_name) AS adviserName
     FROM users u
     LEFT JOIN sections s ON s.id = u.section_id
     LEFT JOIN strands st ON st.id = s.strand_id
     LEFT JOIN users adv ON adv.id = s.adviser_id
     WHERE u.id = ?`,
    [studentId]
  );
  const s = studentRows[0] || {};

  // Rank in class section based on badge points
  let rank = 1;
  let totalStudents = 1;
  if (s.section_id) {
    const [lbRows] = await pool.query(
      `SELECT u.id, COALESCE(SUM(b.points), 0) AS points
       FROM users u
       LEFT JOIN student_badges sb ON sb.student_id = u.id
       LEFT JOIN badge_catalog b ON b.id = sb.badge_id
       WHERE u.role = 'student' AND u.section_id = ?
       GROUP BY u.id
       ORDER BY points DESC, u.id ASC`,
      [s.section_id]
    );
    totalStudents = lbRows.length || 1;
    const idx = lbRows.findIndex((r) => r.id === studentId);
    if (idx !== -1) rank = idx + 1;
  }

  // Rank suffix helper
  function getRankSuffix(n) {
    const sfx = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (sfx[(v - 20) % 10] || sfx[v] || sfx[0]);
  }

  // Active term from system settings
  const [setRows] = await pool.query(
    "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('current_quarter', 'current_semester')"
  );
  const currentQuarterSetting = setRows.find((r) => r.setting_key === 'current_quarter')?.setting_value || '1st Term';
  const canonicalTerm = normalizeCanonicalTerm(currentQuarterSetting);
  const activeTermList = getTermVariants(canonicalTerm);
  let termNum = 1;
  if (canonicalTerm.includes('2')) termNum = 2;
  if (canonicalTerm.includes('3')) termNum = 3;
  if (canonicalTerm.includes('4')) termNum = 4;

  // 1. Scheduled subjects for student's section (each subject has its assigned teacher)
  const [scheduledRows] = s.section_id
    ? await pool.query(
        `SELECT sc.subject_id, sc.teacher_id, CONCAT(t.first_name, ' ', t.last_name) AS teacherName,
                sub.id, sub.code, sub.name, sub.classification,
                COALESCE(sub.ww_weight, 20.00) AS ww_weight,
                COALESCE(sub.pt_weight, 50.00) AS pt_weight,
                COALESCE(sub.qa_weight, 30.00) AS qa_weight
         FROM schedules sc
         JOIN subjects sub ON sub.id = sc.subject_id
         LEFT JOIN users t ON t.id = sc.teacher_id
         WHERE sc.section_id = ?`,
        [s.section_id]
      )
    : [[]];

  function quarterToTerm(quarterNum) {
    const q = Number(quarterNum);
    if (q === 1) return '1st Term';
    if (q === 2) return '2nd Term';
    if (q === 3) return '3rd Term';
    if (q === 4) return '4th Term';
    return '1st Term';
  }

  // 2. Curriculum subjects for student's grade level, strand, and section across all terms
  const [curriculumRows] = await pool.query(
    `SELECT DISTINCT sub.id, sub.code, sub.name, sub.classification, sub.grade_level, sub.quarter, sub.strand, sub.strand_section,
            COALESCE(sub.ww_weight, 20.00) AS ww_weight,
            COALESCE(sub.pt_weight, 50.00) AS pt_weight,
            COALESCE(sub.qa_weight, 30.00) AS qa_weight
     FROM subjects sub
     WHERE (sub.grade_level = ? OR sub.grade_level = 0)
       AND (sub.strand = 'Common' OR sub.strand = 'ALL' OR sub.strand IS NULL OR sub.strand = '' OR sub.strand = ?)
       AND (
         sub.strand_section IS NULL 
         OR sub.strand_section = '' 
         OR sub.strand_section = 'All Sections' 
         OR sub.strand_section = CONCAT(?, ' ', ?)
         OR sub.strand_section LIKE CONCAT('%', ?, '%')
       )
     ORDER BY sub.quarter ASC, sub.name ASC`,
    [s.gradeLevel || 11, s.strandCode || 'STEM', s.strandCode || 'STEM', s.gradeLevel || 11, s.sectionName || '']
  );

  // 3. Existing recorded grades for student
  const [rows] = await pool.query(
    `SELECT g.id AS gradeId, g.subject_id AS subjectId, sub.code AS subjectCode, sub.name AS subject,
            sub.classification,
            COALESCE(sub.ww_weight, 20.00) AS ww_weight,
            COALESCE(sub.pt_weight, 50.00) AS pt_weight,
            COALESCE(sub.qa_weight, 30.00) AS qa_weight,
            g.term, g.quiz_score, g.activity_score, g.exam_score, g.average, g.raw_scores,
            CONCAT(t.first_name, ' ', t.last_name) AS teacherName
     FROM grades g
     JOIN subjects sub ON sub.id = g.subject_id
     LEFT JOIN users t ON t.id = g.recorded_by
     WHERE g.student_id = ?
     ORDER BY g.updated_at DESC`,
    [studentId]
  );

  // Merge subjects to show all real enrolled/curriculum/scheduled subjects
  const subjectsMap = new Map();

  // Scheduled subjects
  for (const sc of scheduledRows) {
    subjectsMap.set(sc.subject_id, {
      subjectId: sc.subject_id,
      subjectCode: sc.code || 'SUBJ',
      subject: sc.name,
      teacherName: sc.teacherName || null,
      classification: sc.classification || 'Specialized',
      defaultTerm: normalizeCanonicalTerm(sc.quarter),
      ww_weight: Number(sc.ww_weight) || 20,
      pt_weight: Number(sc.pt_weight) || 50,
      qa_weight: Number(sc.qa_weight) || 30,
    });
  }

  // Curriculum subjects
  for (const cur of curriculumRows) {
    if (!subjectsMap.has(cur.id)) {
      subjectsMap.set(cur.id, {
        subjectId: cur.id,
        subjectCode: cur.code || 'SUBJ',
        subject: cur.name,
        teacherName: null,
        classification: cur.classification || 'Core Subject',
        defaultTerm: quarterToTerm(cur.quarter),
        ww_weight: Number(cur.ww_weight) || 20,
        pt_weight: Number(cur.pt_weight) || 50,
        qa_weight: Number(cur.qa_weight) || 30,
      });
    }
  }

  // Also include any subjects that have recorded grades even if not caught by curriculum query
  for (const gr of rows) {
    if (!subjectsMap.has(gr.subjectId)) {
      subjectsMap.set(gr.subjectId, {
        subjectId: gr.subjectId,
        subjectCode: gr.subjectCode || 'SUBJ',
        subject: gr.subject,
        teacherName: gr.teacherName || null,
        classification: gr.classification || 'Core Subject',
        defaultTerm: normalizeCanonicalTerm(gr.term),
        ww_weight: Number(gr.ww_weight) || 20,
        pt_weight: Number(gr.pt_weight) || 50,
        qa_weight: Number(gr.qa_weight) || 30,
      });
    } else {
      const existingMeta = subjectsMap.get(gr.subjectId);
      if (gr.ww_weight) existingMeta.ww_weight = Number(gr.ww_weight);
      if (gr.pt_weight) existingMeta.pt_weight = Number(gr.pt_weight);
      if (gr.qa_weight) existingMeta.qa_weight = Number(gr.qa_weight);
    }
  }

  const grades = [];
  for (const [subjId, meta] of subjectsMap.entries()) {
    // Find matching grade for active term, or fallback to any recorded grade for that subject
    const existing = rows.find((r) => r.subjectId === subjId && activeTermList.includes(r.term)) ||
      rows.find((r) => r.subjectId === subjId);

    const subjectTerm = existing
      ? normalizeCanonicalTerm(existing.term)
      : (meta.defaultTerm || canonicalTerm);

    const wwMax = Number(meta.ww_weight) || 20;
    const ptMax = Number(meta.pt_weight) || 50;
    const qaMax = Number(meta.qa_weight) || 30;

    if (existing && existing.average !== null) {
      const rawAvg = Number(existing.average);
      const transmuted = transmuteDepEdGrade(rawAvg);
      const q = existing.quiz_score !== null ? Number(existing.quiz_score) : null;
      const a = existing.activity_score !== null ? Number(existing.activity_score) : null;
      const e = existing.exam_score !== null ? Number(existing.exam_score) : null;

      const qPct = q !== null ? Math.min(100, Math.max(0, Math.round((q / wwMax) * 100))) : null;
      const aPct = a !== null ? Math.min(100, Math.max(0, Math.round((a / ptMax) * 100))) : null;
      const ePct = e !== null ? Math.min(100, Math.max(0, Math.round((e / qaMax) * 100))) : null;

      grades.push({
        gradeId: existing.gradeId,
        subjectId: subjId,
        subjectCode: meta.subjectCode,
        subject: meta.subject,
        classification: meta.classification,
        teacherName: meta.teacherName || existing.teacherName || 'No Teacher Assigned',
        term: subjectTerm,
        quiz_score: q,
        activity_score: a,
        exam_score: e,
        average: transmuted,
        rawAverage: rawAvg,
        quizPct: qPct,
        activityPct: aPct,
        examPct: ePct,
        ww_weight: wwMax,
        pt_weight: ptMax,
        qa_weight: qaMax,
        remarks: getRemarks(transmuted),
        status: transmuted >= 75 ? 'Passed' : 'Needs Remediation',
      });
    } else {
      // Pending subject (student enrolled, grade not yet encoded)
      grades.push({
        gradeId: null,
        subjectId: subjId,
        subjectCode: meta.subjectCode,
        subject: meta.subject,
        classification: meta.classification,
        teacherName: meta.teacherName || 'No Teacher Assigned',
        term: subjectTerm,
        quiz_score: null,
        activity_score: null,
        exam_score: null,
        average: null,
        rawAverage: null,
        quizPct: null,
        activityPct: null,
        examPct: null,
        ww_weight: wwMax,
        pt_weight: ptMax,
        qa_weight: qaMax,
        remarks: 'Pending',
        status: 'Pending',
      });
    }
  }

  // Calculate GWA strictly from graded subjects with DepEd transmuted grades
  const gradedSubjects = grades.filter((g) => g.average !== null && !isNaN(Number(g.average)));
  const overall = gradedSubjects.length
    ? (gradedSubjects.reduce((sum, g) => sum + Number(g.average), 0) / gradedSubjects.length).toFixed(1)
    : null;

  const gradedWithQuiz = gradedSubjects.filter((g) => g.quizPct !== null);
  const writtenWorkAvg = gradedWithQuiz.length
    ? Math.round(gradedWithQuiz.reduce((sum, g) => sum + g.quizPct, 0) / gradedWithQuiz.length)
    : null;

  const gradedWithAct = gradedSubjects.filter((g) => g.activityPct !== null);
  const performanceTaskAvg = gradedWithAct.length
    ? Math.round(gradedWithAct.reduce((sum, g) => sum + g.activityPct, 0) / gradedWithAct.length)
    : null;

  const gradedWithExam = gradedSubjects.filter((g) => g.examPct !== null);
  const quarterlyExamAvg = gradedWithExam.length
    ? Math.round(gradedWithExam.reduce((sum, g) => sum + g.examPct, 0) / gradedWithExam.length)
    : null;

  const improvingCount = gradedSubjects.filter((g) => g.average >= 75).length;

  const fullName = `${s.first_name || ''} ${s.middle_initial ? s.middle_initial + ' ' : ''}${s.last_name || ''}`.trim();
  const formattedName = `${s.last_name || ''}, ${s.first_name || ''} ${s.middle_initial || ''}`.trim();

  const sectionStr = [s.strandCode, s.gradeLevel ? `${s.gradeLevel}-${s.sectionName || ''}` : s.sectionName]
    .filter(Boolean)
    .join(' ');

  const studentMeta = {
    id: s.id,
    idNumber: s.id_number || '123456789012',
    name: fullName || 'Student',
    formattedName: formattedName || 'Student, Name',
    gradeLevel: s.gradeLevel || 11,
    sectionName: s.sectionName || 'Medical Sciences',
    strandCode: s.strandCode || 'SHS',
    strandTitle: s.strandTitle || 'Senior High School',
    sectionFormatted: sectionStr || 'Senior High School',
    trackStrand: s.strandCode ? `Academic Track - ${s.strandCode}` : 'Academic Track - SHS',
    adviserName: s.adviserName || 'Class Adviser',
    rank: rank,
    rankLabel: getRankSuffix(rank),
    totalStudents: totalStudents,
  };

  return {
    student: studentMeta,
    activeTerm: canonicalTerm,
    overallGrade: overall,
    overallRemarks: overall ? getRemarks(Number(overall)) : 'No grades yet',
    totalSubjects: grades.length,
    gradedCount: gradedSubjects.length,
    improvingCount: improvingCount,
    writtenWorkAvg: writtenWorkAvg !== null ? writtenWorkAvg : 0,
    performanceTaskAvg: performanceTaskAvg !== null ? performanceTaskAvg : 0,
    quarterlyExamAvg: quarterlyExamAvg !== null ? quarterlyExamAvg : 0,
    grades,
  };
}

/** GET /api/grades/mine — student's own grades across all subjects/terms */
async function getMyGrades(req, res) {
  try {
    const data = await computeStudentGradePerformance(req.user.id);
    return res.json({ success: true, ...data });
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

    const data = await computeStudentGradePerformance(studentId);
    return res.json({ success: true, ...data });
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
    let targetStudentId = req.user.id;
    if (req.query.studentId && String(req.query.studentId) !== String(req.user.id)) {
      const gate = await canViewStudent(req.user, req.query.studentId);
      if (!gate.ok) return res.status(gate.status).json({ success: false, message: gate.message });
      targetStudentId = req.query.studentId;
    }

    const [gradeRows] = await pool.query(
      `SELECT g.quiz_score, g.activity_score, g.exam_score, g.average, sub.name AS subjectName,
              COALESCE(sub.ww_weight, 20.00) AS ww_weight,
              COALESCE(sub.pt_weight, 50.00) AS pt_weight,
              COALESCE(sub.qa_weight, 30.00) AS qa_weight
       FROM grades g JOIN subjects sub ON sub.id = g.subject_id
       WHERE g.student_id = ? AND g.subject_id = ? AND g.term = ? LIMIT 1`,
      [targetStudentId, subjectId, term]
    );
    if (!gradeRows.length) {
      return res.status(404).json({ success: false, message: 'No grade record found for that subject/term yet.' });
    }
    const g = gradeRows[0];

    const wwMax = Number(g.ww_weight) || 20;
    const ptMax = Number(g.pt_weight) || 50;
    const qaMax = Number(g.qa_weight) || 30;

    const [attRows] = await pool.query(
      `SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) AS attendanceRate
       FROM attendance_logs WHERE student_id = ?`,
      [targetStudentId]
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
      writtenWork: Math.min(100, Math.max(0, Math.round((quiz / wwMax) * 100))),
      performanceTask: Math.min(100, Math.max(0, Math.round((activity / ptMax) * 100))),
      quarterlyExam: examRecorded ? Math.min(100, Math.max(0, Math.round((exam / qaMax) * 100))) : null,
      wwWeight: wwMax,
      ptWeight: ptMax,
      qaWeight: qaMax,
    };

    // Goal math: how much of the exam (or remaining components) is needed
    // to reach the student's target grade, given what's already recorded.
    let goal = null;
    if (targetGrade !== null) {
      const neededFromExam = targetGrade - quiz - activity;
      const feasible = neededFromExam <= qaMax;
      goal = {
        targetGrade,
        currentLocked: quiz + activity, // Written Work + Performance Task already recorded
        neededExamScore: examRecorded ? null : Math.max(0, Math.min(qaMax, Math.round(neededFromExam * 10) / 10)),
        feasible: examRecorded ? null : feasible,
        note: examRecorded
          ? 'The Quarterly Assessment for this term is already recorded — this target reflects the final average.'
          : (feasible
            ? 'Reaching this target is still possible based on the Quarterly Assessment alone.'
            : `Even a perfect Quarterly Assessment score (${qaMax}) would fall short of this target — consider improving Written Work or Performance Task scores too, or set a more achievable goal.`),
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
      wwMax,
      ptMax,
      qaMax,
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

/**
 * GET /api/grades/section-report-cards?sectionId=&term=
 * Fetches the complete SF9 report card data for all students in a section.
 * Accessible by teachers who teach or advise the section, and admins.
 */
async function getSectionReportCards(req, res) {
  const { sectionId } = req.query;
  const term = req.query.term || '1st Term';
  if (!sectionId) {
    return res.status(400).json({ success: false, message: 'sectionId is required.' });
  }

  try {
    // 1. Fetch section and adviser info
    const [[sec]] = await pool.query(
      `SELECT sec.id, sec.name AS sectionName, sec.grade_level, sec.adviser_id,
              st.code AS strandCode, st.title AS strandName, st.department AS track,
              CONCAT(adv.first_name, ' ', IFNULL(CONCAT(adv.middle_initial, ' '), ''), adv.last_name) AS adviserName
       FROM sections sec
       JOIN strands st ON st.id = sec.strand_id
       LEFT JOIN users adv ON adv.id = sec.adviser_id
       WHERE sec.id = ?`,
      [sectionId]
    );
    if (!sec) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    if (req.user.role === 'teacher') {
      const isAdviser = sec.adviser_id === req.user.id;
      const teaches = await teacherTeachesSection(req.user.id, sectionId);
      if (!isAdviser && !teaches) {
        return res.status(403).json({ success: false, message: 'You are not authorized to view report cards for this section.' });
      }
    }

    // 2. Fetch all students in this section
    const [students] = await pool.query(
      `SELECT id, id_number, first_name, middle_initial, last_name, profile_picture_url, is_active
       FROM users
       WHERE role = 'student' AND section_id = ?
       ORDER BY last_name, first_name`,
      [sectionId]
    );

    const fallbackAdviserName = sec.adviserName || `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Class Adviser';

    if (!students.length) {
      return res.json({
        success: true,
        section: {
          id: sec.id,
          name: sec.sectionName,
          gradeLevel: sec.grade_level,
          strandCode: sec.strandCode,
          strandName: sec.strandName,
          track: sec.track || 'Academic Track',
          adviserName: fallbackAdviserName,
        },
        term,
        reportCards: [],
      });
    }

    const studentIds = students.map((s) => s.id);

    // 3. Fetch all grades recorded for these students
    const [gradeRows] = await pool.query(
      `SELECT g.student_id, g.id AS gradeId, g.subject_id, sub.code AS subjectCode, sub.name AS subjectName,
              COALESCE(sub.ww_weight, 20.00) AS ww_weight,
              COALESCE(sub.pt_weight, 50.00) AS pt_weight,
              COALESCE(sub.qa_weight, 30.00) AS qa_weight,
              g.term, g.quiz_score, g.activity_score, g.exam_score, g.average,
              CONCAT(t.first_name, ' ', t.last_name) AS teacherName
       FROM grades g
       JOIN subjects sub ON sub.id = g.subject_id
       LEFT JOIN users t ON t.id = g.recorded_by
       WHERE g.student_id IN (?)
       ORDER BY sub.code, sub.name`,
      [studentIds]
    );

    // 4. Fetch attendance rate summary for each student
    const [attendanceRows] = await pool.query(
      `SELECT student_id,
              COUNT(*) AS totalDays,
              SUM(status IN ('present', 'late')) AS attendedDays
       FROM attendance_logs
       WHERE student_id IN (?)
       GROUP BY student_id`,
      [studentIds]
    );
    const attendanceMap = {};
    for (const a of attendanceRows) {
      const rate = a.totalDays > 0 ? Math.round((a.attendedDays / a.totalDays) * 100) : null;
      attendanceMap[a.student_id] = { totalDays: a.totalDays, attendedDays: a.attendedDays, rate };
    }

    // Group grades by student
    const gradesByStudent = {};
    for (const g of gradeRows) {
      if (!gradesByStudent[g.student_id]) gradesByStudent[g.student_id] = [];
      const q = Number(g.quiz_score) || 0;
      const a = Number(g.activity_score) || 0;
      const e = Number(g.exam_score) || 0;
      const avg = Number(g.average);
      const wwMax = Number(g.ww_weight) || 20;
      const ptMax = Number(g.pt_weight) || 50;
      const qaMax = Number(g.qa_weight) || 30;

      gradesByStudent[g.student_id].push({
        gradeId: g.gradeId,
        subjectId: g.subject_id,
        subjectCode: g.subjectCode || 'SUBJ',
        subject: g.subjectName,
        teacherName: g.teacherName || 'Subject Teacher',
        term: g.term,
        quiz_score: q,
        activity_score: a,
        exam_score: e,
        average: avg,
        ww_weight: wwMax,
        pt_weight: ptMax,
        qa_weight: qaMax,
        quizPct: Math.min(100, Math.max(0, Math.round((q / wwMax) * 100))),
        activityPct: Math.min(100, Math.max(0, Math.round((a / ptMax) * 100))),
        examPct: Math.min(100, Math.max(0, Math.round((e / qaMax) * 100))),
        remarks: getRemarks(avg),
        status: avg >= 75 ? 'Passed' : 'Failed',
      });
    }

    // Build the report cards list
    const reportCards = students.map((s) => {
      const sGrades = gradesByStudent[s.id] || [];
      const overall = sGrades.length
        ? (sGrades.reduce((sum, g) => sum + Number(g.average), 0) / sGrades.length).toFixed(1)
        : null;
      const writtenWorkAvg = sGrades.length
        ? Math.round(sGrades.reduce((sum, g) => sum + g.quizPct, 0) / sGrades.length)
        : null;
      const performanceTaskAvg = sGrades.length
        ? Math.round(sGrades.reduce((sum, g) => sum + g.activityPct, 0) / sGrades.length)
        : null;
      const quarterlyExamAvg = sGrades.length
        ? Math.round(sGrades.reduce((sum, g) => sum + g.examPct, 0) / sGrades.length)
        : null;

      const formattedName = `${s.last_name}, ${s.first_name}${s.middle_initial ? ' ' + s.middle_initial + '.' : ''}`;
      const att = attendanceMap[s.id] || { rate: null };

      return {
        id: s.id,
        idNumber: s.id_number,
        fullName: `${s.first_name} ${s.middle_initial ? s.middle_initial + ' ' : ''}${s.last_name}`,
        formattedName,
        profilePictureUrl: s.profile_picture_url,
        attendanceRate: att.rate !== null ? `${att.rate}%` : '—',
        grades: sGrades,
        overallGrade: overall,
        overallRemarks: overall !== null ? getRemarks(Number(overall)) : 'No Grades Yet',
        writtenWorkAvg,
        performanceTaskAvg,
        quarterlyExamAvg,
      };
    });

    return res.json({
      success: true,
      section: {
        id: sec.id,
        name: sec.sectionName,
        gradeLevel: sec.grade_level,
        strandCode: sec.strandCode,
        strandName: sec.strandName,
        track: sec.track || 'Academic Track',
        adviserName: fallbackAdviserName,
      },
      term,
      reportCards,
    });
  } catch (err) {
    console.error('getSectionReportCards error:', err);
    return res.status(500).json({ success: false, message: 'Could not load section report cards.' });
  }
}

/** GET /api/grades/template?format=xlsm|xlsx — Download clean official DepEd ECR Template */
async function downloadECRTemplate(req, res) {
  const path = require('path');
  const fs = require('fs');
  const format = (req.query.format || 'xlsm').toLowerCase();
  const candidates = format === 'xlsx'
    ? ['ASSH 11 - 2-e-CLASS-RECORD.xlsx', 'DepEd_ECR_Template_DO15_s2026.xlsx']
    : ['ASSH 11 - 2-e-CLASS-RECORD.xlsm', 'ASSH 11 - 2-e-CLASS-RECORD (1).xlsm'];

  const searchDirs = [
    path.join(__dirname, '../../frontend/Teacher'),
    path.join(__dirname, '../../frontend'),
    path.join(__dirname, '../..')
  ];

  let resolvedPath = null;
  let resolvedFilename = null;

  for (const dir of searchDirs) {
    for (const name of candidates) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) {
        resolvedPath = p;
        resolvedFilename = name;
        break;
      }
    }
    if (resolvedPath) break;
  }

  if (!resolvedPath) {
    return res.status(404).json({ success: false, message: 'Template file not found.' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${resolvedFilename}"`);
  return res.sendFile(resolvedPath);
}

module.exports = {
  getRosterGrades,
  saveGrade,
  getMyGrades,
  getStudentGrades,
  getPrescriptivePath,
  getSectionReportCards,
  downloadECRTemplate,
};

