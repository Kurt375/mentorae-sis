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
        const teachesSec = await teacherTeachesSection(req.user.id, sectionId);
        if (!teachesSec) {
          return res.status(403).json({ success: false, message: 'You do not teach this student or section.' });
        }
      }
    }

    const canonicalTerm = normalizeCanonicalTerm(term);

    await pool.query(
      `INSERT INTO grades (student_id, subject_id, section_id, term, quiz_score, activity_score, exam_score, raw_scores, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         section_id = VALUES(section_id),
         quiz_score = VALUES(quiz_score),
         activity_score = VALUES(activity_score),
         exam_score = VALUES(exam_score),
         raw_scores = VALUES(raw_scores),
         recorded_by = VALUES(recorded_by)`,
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
            CONCAT(adv.first_name, ' ', adv.last_name) AS adviserName,
            CONCAT(coadv.first_name, ' ', coadv.last_name) AS coAdviserName
     FROM users u
     LEFT JOIN sections s ON s.id = u.section_id
     LEFT JOIN strands st ON st.id = s.strand_id
     LEFT JOIN users adv ON adv.id = s.adviser_id
     LEFT JOIN users coadv ON coadv.id = s.co_adviser_id
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
                sub.id, sub.code, sub.name, sub.classification, sc.quarter,
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
     WHERE (sub.grade_level = ? OR (sub.grade_level = 0 AND sub.classification != 'Specialized Subject'))
       AND ((sub.strand IN ('Common', 'ALL') AND sub.classification != 'Specialized Subject') OR sub.strand = ?)
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
  const scheduledTerms = new Set();
  const scheduledSpecializedByTerm = new Set();

  // Scheduled subjects
  for (const sc of scheduledRows) {
    const scTerm = normalizeCanonicalTerm(sc.quarter);
    scheduledTerms.add(scTerm);
    if ((sc.classification || '').toLowerCase().includes('specialized')) {
      scheduledSpecializedByTerm.add(scTerm);
    }
    subjectsMap.set(sc.subject_id, {
      subjectId: sc.subject_id,
      subjectCode: sc.code || 'SUBJ',
      subject: sc.name,
      teacherName: sc.teacherName || null,
      classification: sc.classification || 'Specialized',
      defaultTerm: scTerm,
      ww_weight: Number(sc.ww_weight) || 20,
      pt_weight: Number(sc.pt_weight) || 50,
      qa_weight: Number(sc.qa_weight) || 30,
    });
  }

  // Curriculum subjects (fallback for terms without active section schedules)
  for (const cur of curriculumRows) {
    if (!subjectsMap.has(cur.id)) {
      const curTerm = quarterToTerm(cur.quarter);
      const isCurSpecialized = (cur.classification || '').toLowerCase().includes('specialized');

      // If the section already has a scheduled specialized subject for this term (e.g. BIO1),
      // do not inject specialized subjects from other sections (e.g. FINMATH1).
      if (isCurSpecialized && scheduledSpecializedByTerm.has(curTerm)) {
        continue;
      }

      // If the student's section already has an official timetable for this term,
      // do not inject unscheduled subjects that have no teacher, schedule, or grades in that term.
      if (cur.quarter !== 0 && scheduledTerms.has(curTerm)) {
        continue;
      }

      subjectsMap.set(cur.id, {
        subjectId: cur.id,
        subjectCode: cur.code || 'SUBJ',
        subject: cur.name,
        teacherName: null,
        classification: cur.classification || 'Core Subject',
        defaultTerm: curTerm,
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
  const processedKeys = new Set();

  // 1. First, include all recorded grades for the student across all terms
  for (const gr of rows) {
    const subjectTerm = normalizeCanonicalTerm(gr.term);
    const key = `${gr.subjectId}_${subjectTerm}`;
    if (processedKeys.has(key)) continue;
    processedKeys.add(key);

    const meta = subjectsMap.get(gr.subjectId) || {};
    const wwMax = Number(gr.ww_weight || meta.ww_weight) || 20;
    const ptMax = Number(gr.pt_weight || meta.pt_weight) || 50;
    const qaMax = Number(gr.qa_weight || meta.qa_weight) || 30;

    const q = gr.quiz_score !== null ? Number(gr.quiz_score) : null;
    const a = gr.activity_score !== null ? Number(gr.activity_score) : null;
    const e = gr.exam_score !== null ? Number(gr.exam_score) : null;

    const qPct = q !== null ? Math.min(100, Math.max(0, Math.round((q / wwMax) * 100))) : null;
    const aPct = a !== null ? Math.min(100, Math.max(0, Math.round((a / ptMax) * 100))) : null;
    const ePct = e !== null ? Math.min(100, Math.max(0, Math.round((e / qaMax) * 100))) : null;

    let parsedRaw = null;
    if (gr.raw_scores) {
      try {
        parsedRaw = typeof gr.raw_scores === 'string' ? JSON.parse(gr.raw_scores) : gr.raw_scores;
      } catch (_) {
        parsedRaw = null;
      }
    }

    const hasAvg = gr.average !== null && !isNaN(Number(gr.average));
    const rawAvg = hasAvg ? Number(gr.average) : null;
    const transmuted = hasAvg ? transmuteDepEdGrade(rawAvg) : null;

    grades.push({
      gradeId: gr.gradeId,
      subjectId: gr.subjectId,
      subjectCode: gr.subjectCode || meta.subjectCode || 'SUBJ',
      subject: gr.subject || meta.subject,
      classification: gr.classification || meta.classification || 'Core Subject',
      teacherName: gr.teacherName || meta.teacherName || 'No Teacher Assigned',
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
      remarks: hasAvg ? getRemarks(transmuted) : 'Pending',
      status: hasAvg ? (transmuted >= 75 ? 'Passed' : 'Needs Remediation') : 'Pending',
      raw_scores: parsedRaw,
    });
  }

  // 2. Scheduled subjects that do not yet have a recorded grade in their scheduled quarter
  for (const sc of scheduledRows) {
    const scTerm = normalizeCanonicalTerm(sc.quarter);
    const key = `${sc.subject_id}_${scTerm}`;
    if (!processedKeys.has(key)) {
      processedKeys.add(key);
      const wwMax = Number(sc.ww_weight) || 20;
      const ptMax = Number(sc.pt_weight) || 50;
      const qaMax = Number(sc.qa_weight) || 30;
      grades.push({
        gradeId: null,
        subjectId: sc.subject_id,
        subjectCode: sc.code || 'SUBJ',
        subject: sc.name,
        classification: sc.classification || 'Specialized',
        teacherName: sc.teacherName || 'No Teacher Assigned',
        term: scTerm,
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

  // 3. Curriculum subjects that have no recorded grade in their curriculum term
  for (const cur of curriculumRows) {
    const curTerm = quarterToTerm(cur.quarter);
    const isCurSpecialized = (cur.classification || '').toLowerCase().includes('specialized');

    // If section already has scheduled specialized subjects for this term (e.g. BIO1 for Medical Sciences),
    // do not inject specialized subjects from other sections (e.g. FINMATH1 for Engineering).
    if (isCurSpecialized && scheduledSpecializedByTerm.has(curTerm)) {
      continue;
    }

    // If the student's section already has an official timetable for this term,
    // do not inject unscheduled subjects that have no teacher, schedule, or grades in that term.
    if (cur.quarter !== 0 && scheduledTerms.has(curTerm)) {
      continue;
    }

    const key = `${cur.id}_${curTerm}`;
    if (!processedKeys.has(key)) {
      processedKeys.add(key);
      const wwMax = Number(cur.ww_weight) || 20;
      const ptMax = Number(cur.pt_weight) || 50;
      const qaMax = Number(cur.qa_weight) || 30;
      grades.push({
        gradeId: null,
        subjectId: cur.id,
        subjectCode: cur.code || 'SUBJ',
        subject: cur.name,
        classification: cur.classification || 'Core Subject',
        teacherName: 'No Teacher Assigned',
        term: curTerm,
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

  // 4. Compute real per-term trends for terms taken or currently taking (1st Term, 2nd Term, 3rd Term)
  const activeTermNum = canonicalTerm.includes('3') ? 3 : canonicalTerm.includes('2') ? 2 : 1;
  const standardTerms = ['1st Term', '2nd Term', '3rd Term'];
  const termKeys = standardTerms.slice(0, activeTermNum);

  for (const gr of rows) {
    const norm = normalizeCanonicalTerm(gr.term);
    if (standardTerms.includes(norm) && !termKeys.includes(norm)) {
      termKeys.push(norm);
    }
  }
  termKeys.sort((a, b) => {
    const order = { '1st Term': 1, '2nd Term': 2, '3rd Term': 3 };
    return (order[a] || 1) - (order[b] || 1);
  });

  const termTrends = termKeys.map((termName) => {
    const termVariants = getTermVariants(termName);
    const termRows = rows.filter((r) => termVariants.includes(r.term) || normalizeCanonicalTerm(r.term) === termName);
    const termGraded = termRows.filter((r) => r.average !== null && !isNaN(Number(r.average)));

    let gwa = null;
    if (termGraded.length > 0) {
      const sum = termGraded.reduce((acc, r) => acc + transmuteDepEdGrade(Number(r.average)), 0);
      gwa = Number((sum / termGraded.length).toFixed(1));
    } else if (termName === canonicalTerm && overall !== null) {
      gwa = Number(overall);
    }

    let termWw = null;
    const wwRows = termGraded.filter((r) => r.quiz_score !== null);
    if (wwRows.length > 0) {
      termWw = Math.round(wwRows.reduce((acc, r) => acc + (Number(r.quiz_score) / (Number(r.ww_weight) || 20)) * 100, 0) / wwRows.length);
    } else if (termName === canonicalTerm) {
      termWw = writtenWorkAvg;
    }

    let termPt = null;
    const ptRows = termGraded.filter((r) => r.activity_score !== null);
    if (ptRows.length > 0) {
      termPt = Math.round(ptRows.reduce((acc, r) => acc + (Number(r.activity_score) / (Number(r.pt_weight) || 50)) * 100, 0) / ptRows.length);
    } else if (termName === canonicalTerm) {
      termPt = performanceTaskAvg;
    }

    let termQa = null;
    const qaRows = termGraded.filter((r) => r.exam_score !== null);
    if (qaRows.length > 0) {
      termQa = Math.round(qaRows.reduce((acc, r) => acc + (Number(r.exam_score) / (Number(r.qa_weight) || 30)) * 100, 0) / qaRows.length);
    } else if (termName === canonicalTerm) {
      termQa = quarterlyExamAvg;
    }

    return {
      term: termName,
      gwa: gwa !== null ? gwa : Number(overall || 75),
      writtenWorkAvg: termWw !== null ? termWw : (writtenWorkAvg || 75),
      performanceTaskAvg: termPt !== null ? termPt : (performanceTaskAvg || 75),
      quarterlyExamAvg: termQa !== null ? termQa : (quarterlyExamAvg || 75),
      hasRecordedGrades: termGraded.length > 0,
    };
  });

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
    coAdviserName: s.coAdviserName || null,
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
    termTrends,
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
      `SELECT sec.id, sec.name AS sectionName, sec.grade_level, sec.adviser_id, sec.co_adviser_id,
              st.code AS strandCode, st.title AS strandName, st.department AS track,
              CONCAT(adv.first_name, ' ', IFNULL(CONCAT(adv.middle_initial, ' '), ''), adv.last_name) AS adviserName,
              CONCAT(coadv.first_name, ' ', IFNULL(CONCAT(coadv.middle_initial, ' '), ''), coadv.last_name) AS coAdviserName
       FROM sections sec
       JOIN strands st ON st.id = sec.strand_id
       LEFT JOIN users adv ON adv.id = sec.adviser_id
       LEFT JOIN users coadv ON coadv.id = sec.co_adviser_id
       WHERE sec.id = ?`,
      [sectionId]
    );
    if (!sec) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    if (req.user.role === 'teacher') {
      const isAdviser = Boolean(sec.adviser_id === req.user.id || sec.co_adviser_id === req.user.id);
      if (!isAdviser) {
        return res.status(403).json({
          success: false,
          message: 'Access Restricted: Only the official Class Adviser or Co-Adviser of this section can view, edit, print, or download SF9 report cards.'
        });
      }
    }

    // 1b. Fetch School Head & School Year from system_settings
    let schoolHead = 'JAENA N. DELA CERNA';
    let schoolYear = '2026-2027';
    try {
      const [settingsRows] = await pool.query(
        `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('school_head', 'school_year')`
      );
      for (const r of settingsRows) {
        if (r.setting_key === 'school_head' && r.setting_value) schoolHead = r.setting_value;
        if (r.setting_key === 'school_year' && r.setting_value) schoolYear = r.setting_value;
      }
    } catch (e) {
      // ignore
    }

    // 2. Fetch all students in this section
    const [students] = await pool.query(
      `SELECT id, id_number, first_name, middle_initial, last_name, sex, profile_picture_url, is_active
       FROM users
       WHERE role = 'student' AND section_id = ?
       ORDER BY last_name, first_name`,
      [sectionId]
    );

    const fallbackAdviserName = sec.adviserName || `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'NIÑO M. LUNA';

    if (!students.length) {
      return res.json({
        success: true,
        section: {
          id: sec.id,
          name: sec.sectionName,
          gradeLevel: sec.grade_level,
          strandCode: sec.strandCode,
          strandName: sec.strandName,
          track: sec.track || 'Academic',
          adviserName: fallbackAdviserName,
          coAdviserName: sec.coAdviserName || null,
          schoolHead,
          schoolYear,
        },
        term,
        reportCards: [],
      });
    }

    const studentIds = students.map((s) => s.id);

    // 3. Fetch all subjects scheduled or handled in this section (robust group by)
    let schedSubjects = [];
    try {
      const [rows] = await pool.query(
        `SELECT sub.id AS subjectId, sub.code AS subjectCode, sub.name AS subjectName,
                COALESCE(sub.classification, 'Core') AS classification
         FROM schedules sch
         JOIN subjects sub ON sub.id = sch.subject_id
         WHERE sch.section_id = ?
         GROUP BY sub.id, sub.code, sub.name, sub.classification
         ORDER BY sub.name`,
        [sectionId]
      );
      schedSubjects = rows || [];
    } catch (schedErr) {
      console.warn('Could not load section schedules for report cards:', schedErr.message);
    }

    // 4. Fetch all grades recorded for these students
    let gradeRows = [];
    try {
      const [rows] = await pool.query(
        `SELECT g.student_id, g.id AS gradeId, g.subject_id, sub.code AS subjectCode, sub.name AS subjectName,
                COALESCE(sub.classification, 'Core') AS classification,
                20.00 AS ww_weight,
                50.00 AS pt_weight,
                30.00 AS qa_weight,
                g.term, g.quiz_score, g.activity_score, g.exam_score, g.average,
                CONCAT(t.first_name, ' ', t.last_name) AS teacherName
         FROM grades g
         JOIN subjects sub ON sub.id = g.subject_id
         LEFT JOIN users t ON t.id = g.recorded_by
         WHERE g.student_id IN (?)
         ORDER BY sub.code, sub.name`,
        [studentIds]
      );
      gradeRows = rows || [];
    } catch (gradeErr) {
      console.warn('Could not load grades for report cards:', gradeErr.message);
    }

    // 5. Fetch overall attendance rate and monthly attendance summary for each student
    const attendanceMap = {};
    try {
      const [attendanceRows] = await pool.query(
        `SELECT student_id,
                COUNT(*) AS totalDays,
                SUM(status IN ('present', 'late')) AS attendedDays
         FROM attendance_logs
         WHERE student_id IN (?)
         GROUP BY student_id`,
        [studentIds]
      );
      for (const a of (attendanceRows || [])) {
        const rate = a.totalDays > 0 ? Math.round((a.attendedDays / a.totalDays) * 100) : null;
        attendanceMap[a.student_id] = { totalDays: a.totalDays, attendedDays: a.attendedDays, rate };
      }
    } catch (attErr) {
      console.warn('Could not load attendance summary:', attErr.message);
    }

    const monthlyAttendanceMap = {};
    try {
      const [monthlyAttRows] = await pool.query(
        `SELECT student_id,
                MONTH(scan_date) AS monthNum,
                COUNT(*) AS totalDays,
                SUM(status IN ('present', 'late')) AS attendedDays,
                SUM(status = 'absent') AS absentDays
         FROM attendance_logs
         WHERE student_id IN (?)
         GROUP BY student_id, MONTH(scan_date)`,
        [studentIds]
      );
      for (const m of (monthlyAttRows || [])) {
        if (!monthlyAttendanceMap[m.student_id]) monthlyAttendanceMap[m.student_id] = {};
        monthlyAttendanceMap[m.student_id][m.monthNum] = {
          totalDays: Number(m.totalDays) || 0,
          present: Number(m.attendedDays) || 0,
          absent: Number(m.absentDays) || 0,
        };
      }
    } catch (mAttErr) {
      console.warn('Could not load monthly attendance summary:', mAttErr.message);
    }

    // 5b. Fetch any saved SF9 customizations/comments for these students
    const sf9SavedMap = {};
    let savedSchoolHead = null;
    let savedAdviser = null;
    try {
      const [sf9Rows] = await pool.query(
        `SELECT student_id, age, comment_term1, comment_term2, comment_term3,
                cert_admitted_to_grade, cert_eligible_for_admission,
                canc_admitted_in, canc_date, school_head_name, adviser_name
         FROM sf9_report_cards
         WHERE student_id IN (?) AND school_year = ?`,
        [studentIds, schoolYear]
      );
      for (const r of (sf9Rows || [])) {
        sf9SavedMap[r.student_id] = r;
        if (r.school_head_name && !savedSchoolHead) savedSchoolHead = r.school_head_name;
        if (r.adviser_name && !savedAdviser) savedAdviser = r.adviser_name;
      }
    } catch (sf9Err) {
      console.warn('Could not load saved sf9 report cards:', sf9Err.message);
    }

    // Helper to normalize term key
    function getNormalizedTermKey(tStr) {
      const t = String(tStr || '').trim().toLowerCase();
      if (t === 't1' || t.includes('1st') || t.includes('first')) return 't1';
      if (t === 't2' || t.includes('2nd') || t.includes('second')) return 't2';
      if (t === 't3' || t.includes('3rd') || t.includes('third')) return 't3';
      return null;
    }

    // Official DepEd SF9 Teacher's Comments / Remarks choices
    const OFFICIAL_SF9_COMMENTS = [
      "Needs more practice to improve understanding.",
      "Needs to work harder on difficult lessons.",
      "Shows effort but needs more guidance.",
      "Can improve with more focus and effort.",
      "Needs to participate more in class.",
      "Shows potential but needs more practice.",
      "Needs to improve study habits.",
      "Needs closer attention during discussions.",
      "Needs to stay focused during activities.",
      "Needs to develop better study habits.",
      "Shows satisfactory progress in class.",
      "Continues to improve in different areas.",
      "Performs well with regular guidance.",
      "Shows good effort in completing tasks.",
      "Participates in class activities.",
      "Understands most of the lessons.",
      "Shows steady progress this term.",
      "Does well when given proper guidance.",
      "Completes most tasks on time.",
      "Shows willingness to learn.",
      "Has shown good improvement.",
      "Participates well during discussions.",
      "Can improve further with more effort.",
      "Shows a positive attitude toward learning.",
      "Works well during classroom activities.",
      "Continues to develop good study habits.",
      "Performs better when focused.",
      "Shows consistent effort in class.",
      "Completes assigned activities responsibly.",
      "Can achieve more with continued effort.",
      "Shows excellent understanding of the lessons.",
      "Consistently performs well in class.",
      "Shows strong interest in learning.",
      "Completes tasks with confidence.",
      "Actively participates in discussions.",
      "Demonstrates excellent study habits.",
      "Shows initiative in classroom activities.",
      "Shows excellent progress this term.",
      "Works independently and responsibly.",
      "Demonstrates strong skills and understanding.",
      "Shows leadership during group activities.",
      "Continues to maintain excellent performance."
    ];

    function generateConstructiveComment(gradeVal) {
      if (gradeVal === null || gradeVal === undefined || isNaN(gradeVal)) return '';
      const g = Number(gradeVal);
      if (g >= 90) return 'Shows excellent understanding of the lessons.';
      if (g >= 80) return 'Shows consistent effort in class.';
      if (g >= 75) return 'Shows satisfactory progress in class.';
      return 'Needs more practice to improve understanding.';
    }

    // Month order for SF9 DepEd attendance: Jun, Jul, Aug, Sep, Oct, Nov, Dec, Jan, Feb, Mar, Apr
    const SF9_MONTHS = [
      { num: 6, key: 'jun', label: 'Jun' },
      { num: 7, key: 'jul', label: 'Jul' },
      { num: 8, key: 'aug', label: 'Aug' },
      { num: 9, key: 'sep', label: 'Sep' },
      { num: 10, key: 'oct', label: 'Oct' },
      { num: 11, key: 'nov', label: 'Nov' },
      { num: 12, key: 'dec', label: 'Dec' },
      { num: 1, key: 'jan', label: 'Jan' },
      { num: 2, key: 'feb', label: 'Feb' },
      { num: 3, key: 'mar', label: 'Mar' },
      { num: 4, key: 'apr', label: 'Apr' },
    ];

    // Standard school days per month reference (DO 15 s. 2026 calendar baseline)
    const DEFAULT_CLASS_DAYS = {
      jun: 0, jul: 0, aug: 20, sep: 20, oct: 20, nov: 20, dec: 18, jan: 20, feb: 18, mar: 20, apr: 5
    };

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
        classification: g.classification || 'Core',
        teacherName: g.teacherName || 'Subject Teacher',
        term: g.term,
        termKey: getNormalizedTermKey(g.term),
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

      // Combine section subjects and graded subjects
      const subjectMap = new Map();

      // Seed scheduled subjects
      schedSubjects.forEach((sub) => {
        subjectMap.set(sub.subjectId, {
          subjectId: sub.subjectId,
          subjectCode: sub.subjectCode,
          subjectName: sub.subjectName,
          classification: sub.classification || 'Core',
          t1: null,
          t2: null,
          t3: null,
          units: 1,
          finalGrade: null,
          remarks: '',
        });
      });

      // Populate student grade values into subjects
      sGrades.forEach((g) => {
        if (!subjectMap.has(g.subjectId)) {
          subjectMap.set(g.subjectId, {
            subjectId: g.subjectId,
            subjectCode: g.subjectCode,
            subjectName: g.subject,
            classification: g.classification || 'Core',
            t1: null,
            t2: null,
            t3: null,
            units: 1,
            finalGrade: null,
            remarks: '',
          });
        }
        const entry = subjectMap.get(g.subjectId);
        if (g.termKey === 't1') entry.t1 = Math.round(g.average);
        else if (g.termKey === 't2') entry.t2 = Math.round(g.average);
        else if (g.termKey === 't3') entry.t3 = Math.round(g.average);
      });

      // Calculate final grade and remarks per subject
      const subjectsList = Array.from(subjectMap.values()).map((sub) => {
        const recorded = [sub.t1, sub.t2, sub.t3].filter((v) => v !== null && v !== undefined && !isNaN(v));
        let finalGrade = null;
        let remarks = '';
        if (recorded.length > 0) {
          // If all 3 terms or user completed terms, calculate average
          const avg = recorded.reduce((sum, v) => sum + v, 0) / recorded.length;
          finalGrade = Math.round(avg);
          remarks = finalGrade >= 75 ? 'Passed' : 'Failed';
        }
        return {
          ...sub,
          finalGrade,
          remarks,
        };
      });

      // Group into Core and Elective subjects
      const coreSubjects = subjectsList.filter((sub) => {
        const cls = String(sub.classification || '').toLowerCase();
        return cls.includes('core') || (!cls.includes('elective') && !cls.includes('applied') && !cls.includes('specialized'));
      });
      const electiveSubjects = subjectsList.filter((sub) => {
        const cls = String(sub.classification || '').toLowerCase();
        return cls.includes('elective') || cls.includes('applied') || cls.includes('specialized');
      });

      // General Average across all subjects
      const allT1 = subjectsList.map((s) => s.t1).filter((v) => v !== null);
      const allT2 = subjectsList.map((s) => s.t2).filter((v) => v !== null);
      const allT3 = subjectsList.map((s) => s.t3).filter((v) => v !== null);
      const allFinal = subjectsList.map((s) => s.finalGrade).filter((v) => v !== null);

      const t1Avg = allT1.length ? Math.round(allT1.reduce((a, b) => a + b, 0) / allT1.length) : null;
      const t2Avg = allT2.length ? Math.round(allT2.reduce((a, b) => a + b, 0) / allT2.length) : null;
      const t3Avg = allT3.length ? Math.round(allT3.reduce((a, b) => a + b, 0) / allT3.length) : null;
      const finalGwa = allFinal.length ? Math.round(allFinal.reduce((a, b) => a + b, 0) / allFinal.length) : (t1Avg || null);

      const generalAverage = {
        t1: t1Avg,
        t2: t2Avg,
        t3: t3Avg,
        finalGrade: finalGwa,
        remarks: finalGwa !== null ? (finalGwa >= 75 ? 'Passed' : 'Failed') : '',
      };

      // Saved or Auto-generated Teacher Comments
      const savedSf9 = sf9SavedMap[s.id] || {};
      const comments = {
        term1: (savedSf9.comment_term1 !== null && savedSf9.comment_term1 !== undefined) ? savedSf9.comment_term1 : generateConstructiveComment(t1Avg),
        term2: (savedSf9.comment_term2 !== null && savedSf9.comment_term2 !== undefined) ? savedSf9.comment_term2 : generateConstructiveComment(t2Avg),
        term3: (savedSf9.comment_term3 !== null && savedSf9.comment_term3 !== undefined) ? savedSf9.comment_term3 : generateConstructiveComment(t3Avg),
      };

      const certTransfer = {
        admittedToGrade: savedSf9.cert_admitted_to_grade || '',
        eligibleForAdmission: savedSf9.cert_eligible_for_admission || '',
        cancAdmittedIn: savedSf9.canc_admitted_in || '',
        cancDate: savedSf9.canc_date || '',
      };

      const studentAge = (savedSf9.age !== null && savedSf9.age !== undefined && savedSf9.age > 0) ? savedSf9.age : 15;

      // Monthly Attendance Breakdown
      const sMonthly = monthlyAttendanceMap[s.id] || {};
      let totalClassDaysSum = 0;
      let totalPresentSum = 0;
      let totalAbsentSum = 0;

      const attendanceMonthly = SF9_MONTHS.map((m) => {
        const logData = sMonthly[m.num];
        const defaultDays = DEFAULT_CLASS_DAYS[m.key] || 0;
        const classDays = logData ? (logData.totalDays || defaultDays) : defaultDays;
        const present = logData ? logData.present : (classDays > 0 ? classDays : 0);
        const absent = logData ? logData.absent : 0;

        totalClassDaysSum += classDays;
        totalPresentSum += present;
        totalAbsentSum += absent;

        return {
          month: m.label,
          classDays,
          present,
          absent,
        };
      });

      const attendanceSummary = {
        months: attendanceMonthly,
        total: {
          classDays: totalClassDaysSum || 201,
          present: totalPresentSum || 201,
          absent: totalAbsentSum || 0,
        },
      };

      const formattedName = `${s.last_name}, ${s.first_name}${s.middle_initial ? ' ' + s.middle_initial + '.' : ''}`;
      const att = attendanceMap[s.id] || { rate: null };
      const sexDisplay = (s.sex === 'Female' || s.sex === 'F') ? 'F' : ((s.sex === 'Male' || s.sex === 'M') ? 'M' : (s.sex || ''));

      return {
        id: s.id,
        idNumber: s.id_number,
        fullName: `${s.first_name} ${s.middle_initial ? s.middle_initial + ' ' : ''}${s.last_name}`,
        formattedName,
        age: studentAge,
        sex: sexDisplay,
        profilePictureUrl: s.profile_picture_url,
        attendanceRate: att.rate !== null ? `${att.rate}%` : '—',
        grades: sGrades,
        coreSubjects,
        electiveSubjects,
        generalAverage,
        comments,
        certTransfer,
        attendanceSummary,
        overallGrade: finalGwa !== null ? finalGwa : (sGrades.length ? (sGrades.reduce((sum, g) => sum + Number(g.average), 0) / sGrades.length).toFixed(1) : null),
        overallRemarks: finalGwa !== null ? getRemarks(Number(finalGwa)) : 'No Grades Yet',
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
        track: sec.track ? sec.track.replace('Track', '').trim() : 'Academic',
        adviserName: savedAdviser || fallbackAdviserName,
        coAdviserName: sec.coAdviserName || null,
        schoolHead: savedSchoolHead || schoolHead,
        schoolYear,
      },
      term,
      officialComments: OFFICIAL_SF9_COMMENTS,
      reportCards,
    });
  } catch (err) {
    console.error('getSectionReportCards error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Could not load section report cards.' });
  }
}

/** POST /api/grades/section-report-cards/save — Save teacher comments, certificate, and custom metadata */
async function saveSectionReportCards(req, res) {
  const { sectionId, schoolYear, cards, schoolHeadName, adviserName } = req.body;
  if (!sectionId) {
    return res.status(400).json({ success: false, message: 'sectionId is required.' });
  }

  try {
    // 1. Permission check
    const [[sec]] = await pool.query(
      `SELECT id, adviser_id, co_adviser_id, name FROM sections WHERE id = ?`,
      [sectionId]
    );
    if (!sec) {
      return res.status(404).json({ success: false, message: 'Section not found.' });
    }

    if (req.user.role === 'teacher') {
      const isAdviser = Boolean(sec.adviser_id === req.user.id || sec.co_adviser_id === req.user.id);
      if (!isAdviser) {
        return res.status(403).json({
          success: false,
          message: 'Access Restricted: Only the official Class Adviser or Co-Adviser of this section can save SF9 report card remarks.'
        });
      }
    }

    const sy = schoolYear || '2026-2027';
    const cardList = Array.isArray(cards) ? cards : [];

    if (cardList.length > 0) {
      for (const c of cardList) {
        const studentId = Number(c.studentId);
        if (!studentId) continue;

        const age = c.age ? Number(c.age) : null;
        const comment1 = c.commentTerm1 !== undefined ? String(c.commentTerm1).trim() : null;
        const comment2 = c.commentTerm2 !== undefined ? String(c.commentTerm2).trim() : null;
        const comment3 = c.commentTerm3 !== undefined ? String(c.commentTerm3).trim() : null;
        const certAdmitted = c.certAdmittedToGrade !== undefined ? String(c.certAdmittedToGrade).trim() : null;
        const certEligible = c.certEligibleForAdmission !== undefined ? String(c.certEligibleForAdmission).trim() : null;
        const cancAdmitted = c.cancAdmittedIn !== undefined ? String(c.cancAdmittedIn).trim() : null;
        const cancDate = c.cancDate !== undefined ? String(c.cancDate).trim() : null;
        const sHead = schoolHeadName ? String(schoolHeadName).trim() : null;
        const advName = adviserName ? String(adviserName).trim() : null;

        await pool.query(
          `INSERT INTO sf9_report_cards (
             student_id, section_id, school_year, age,
             comment_term1, comment_term2, comment_term3,
             cert_admitted_to_grade, cert_eligible_for_admission,
             canc_admitted_in, canc_date,
             school_head_name, adviser_name, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             section_id = VALUES(section_id),
             age = VALUES(age),
             comment_term1 = VALUES(comment_term1),
             comment_term2 = VALUES(comment_term2),
             comment_term3 = VALUES(comment_term3),
             cert_admitted_to_grade = VALUES(cert_admitted_to_grade),
             cert_eligible_for_admission = VALUES(cert_eligible_for_admission),
             canc_admitted_in = VALUES(canc_admitted_in),
             canc_date = VALUES(canc_date),
             school_head_name = VALUES(school_head_name),
             adviser_name = VALUES(adviser_name),
             updated_by = VALUES(updated_by)`,
          [
            studentId, sec.id, sy, age,
            comment1, comment2, comment3,
            certAdmitted, certEligible,
            cancAdmitted, cancDate,
            sHead, advName, req.user.id
          ]
        );
      }
    }

    // Also update system_settings for school_head if provided
    if (schoolHeadName && String(schoolHeadName).trim()) {
      try {
        await pool.query(
          `INSERT INTO system_settings (setting_key, setting_value) VALUES ('school_head', ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          [String(schoolHeadName).trim()]
        );
      } catch (headErr) {
        // non-blocking
      }
    }

    // Log in activity_log
    try {
      await pool.query(
        `INSERT INTO activity_log (student_id, description) VALUES (?, ?)`,
        [
          cardList[0]?.studentId || 0,
          `Saved SF9 report card remarks & transfer certificate (${cardList.length} student(s), Section: ${sec.name})`
        ]
      );
    } catch (logErr) {
      // non-blocking
    }

    return res.json({
      success: true,
      message: `Successfully saved SF9 report card remarks and customizations for ${cardList.length} student(s).`
    });
  } catch (err) {
    console.error('saveSectionReportCards error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to save report cards: ' + (err.message || 'Server error.')
    });
  }
}

/** GET /api/grades/template?format=xlsm|xlsx — Download clean official DepEd ECR Template */
async function downloadECRTemplate(req, res) {
  const path = require('path');
  const fs = require('fs');
  const format = (req.query.format || 'xlsm').toLowerCase();
  const candidates = format === 'xlsx'
    ? ['Sample_Template.xlsx', 'Sample_ECR_Template.xlsx', 'DepEd_ECR_Blank_Template.xlsx', 'ASSH 11 - 2-e-CLASS-RECORD.xlsx', 'DepEd_ECR_Template_DO15_s2026.xlsx']
    : ['Sample_Template.xlsm', 'Sample_ECR_Template.xlsm', 'DepEd_ECR_Blank_Template.xlsm', 'ASSH 11 - 2-e-CLASS-RECORD.xlsm', 'ASSH 11 - 2-e-CLASS-RECORD (1).xlsm'];

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
  saveSectionReportCards,
  downloadECRTemplate,
};

