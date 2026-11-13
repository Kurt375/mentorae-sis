const pool = require('../config/db');
const bcrypt = require('bcrypt');
const { teacherTeachesSection, teacherTeachesStudent, getAdviserIdForStudent, isTeacherAdviserOfStudent } = require('../utils/authz');
const { getManilaDate } = require('../utils/dateUtils');

/**
 * GET /api/classes/roster?sectionId=
 * Powers the top student roster table on Class Management (id, name,
 * overall grade, attendance %, today's status, profilePictureUrl).
 */
async function getRosterOverview(req, res) {
  const { sectionId, subjectId } = req.query;
  if (!sectionId) {
    return res.status(400).json({ success: false, message: 'sectionId is required.' });
  }

  try {
    const today = getManilaDate();
    const parsedSubId = (subjectId && subjectId !== 'all' && !isNaN(parseInt(subjectId, 10))) ? parseInt(subjectId, 10) : null;
    const gradeSubquery = parsedSubId
      ? `(SELECT ROUND(AVG(average), 1) FROM grades WHERE student_id = u.id AND subject_id = ${parsedSubId})`
      : `(SELECT ROUND(AVG(average), 1) FROM grades WHERE student_id = u.id)`;

    // 1. Fetch roster for the requested section (or all handled sections)
    let rows;
    if (sectionId === 'all' || sectionId === 'ALL') {
      if (req.user.role === 'admin') {
        [rows] = await pool.query(
          `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name, u.profile_picture_url, sec.name AS sectionName,
                  ${gradeSubquery} AS grade,
                  (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id) AS attendanceRate,
                  (SELECT status FROM attendance_logs WHERE student_id = u.id AND scan_date = ? ORDER BY id DESC LIMIT 1) AS todayStatus
           FROM users u
           LEFT JOIN sections sec ON sec.id = u.section_id
           WHERE u.role = 'student'
           ORDER BY u.last_name`,
          [today]
        );
      } else {
        [rows] = await pool.query(
          `SELECT DISTINCT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name, u.profile_picture_url, sec.name AS sectionName,
                  ${gradeSubquery} AS grade,
                  (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id) AS attendanceRate,
                  (SELECT status FROM attendance_logs WHERE student_id = u.id AND scan_date = ? ORDER BY id DESC LIMIT 1) AS todayStatus
           FROM users u
           LEFT JOIN sections sec ON sec.id = u.section_id
           WHERE u.role = 'student'
             AND (u.section_id IN (SELECT section_id FROM schedules WHERE teacher_id = ?)
                  OR u.section_id IN (SELECT id FROM sections WHERE adviser_id = ? OR co_adviser_id = ?))
           ORDER BY u.last_name`,
          [today, req.user.id, req.user.id, req.user.id]
        );
      }
    } else {
      [rows] = await pool.query(
        `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name, u.profile_picture_url, sec.name AS sectionName,
                ${gradeSubquery} AS grade,
                (SELECT ROUND(100 * SUM(status IN ('present','late')) / COUNT(*)) FROM attendance_logs WHERE student_id = u.id) AS attendanceRate,
                (SELECT status FROM attendance_logs WHERE student_id = u.id AND scan_date = ? ORDER BY id DESC LIMIT 1) AS todayStatus
         FROM users u
         LEFT JOIN sections sec ON sec.id = u.section_id
         WHERE u.role = 'student' AND u.section_id = ?
         ORDER BY u.last_name`,
        [today, sectionId]
      );
    }

    const roster = rows.map((r) => ({
      id: r.id,
      idNumber: r.id_number,
      name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
      profilePictureUrl: r.profile_picture_url || null,
      sectionName: r.sectionName || null,
      grade: r.grade,
      attendance: r.attendanceRate !== null ? `${r.attendanceRate}%` : '—',
      status: r.todayStatus || 'not_scanned',
    }));

    // 2. Fetch overall overview metrics across all students handled by this teacher
    let allHandledRows;
    if (req.user.role === 'admin') {
      [allHandledRows] = await pool.query(
        `SELECT u.id,
                (SELECT status FROM attendance_logs WHERE student_id = u.id AND scan_date = ? ORDER BY id DESC LIMIT 1) AS todayStatus
         FROM users u
         WHERE u.role = 'student'`,
        [today]
      );
    } else {
      [allHandledRows] = await pool.query(
        `SELECT DISTINCT u.id,
                (SELECT status FROM attendance_logs WHERE student_id = u.id AND scan_date = ? ORDER BY id DESC LIMIT 1) AS todayStatus
         FROM users u
         WHERE u.role = 'student'
           AND (u.section_id IN (SELECT section_id FROM schedules WHERE teacher_id = ?)
                OR u.section_id IN (SELECT id FROM sections WHERE adviser_id = ? OR co_adviser_id = ?))`,
        [today, req.user.id, req.user.id, req.user.id]
      );
    }

    const totalHandled = allHandledRows.length;
    const presentToday = allHandledRows.filter((s) => s.todayStatus === 'present' || s.todayStatus === 'late').length;
    const absentToday = allHandledRows.filter((s) => s.todayStatus === 'absent').length;
    const excusedToday = allHandledRows.filter((s) => s.todayStatus === 'excused').length;

    return res.json({
      success: true,
      roster,
      overview: {
        totalHandled,
        presentToday,
        absentToday,
        excusedToday,
      },
    });
  } catch (err) {
    console.error('getRosterOverview error:', err);
    return res.status(500).json({ success: false, message: 'Could not load class roster.' });
  }
}

/** GET /api/classes/my-sections — sections this teacher has a schedule in or advises (for the filter dropdowns) */
async function getMySections(req, res) {
  try {
    let [rows] = await pool.query(
      `SELECT sec.id, sec.name, sec.grade_level, st.code AS strandCode,
              IF(sec.adviser_id = ? OR sec.co_adviser_id = ?, 1, 0) AS isAdvisory,
              GROUP_CONCAT(DISTINCT sub.name ORDER BY sub.name SEPARATOR ', ') AS subjectsTaught
       FROM sections sec
       JOIN strands st ON st.id = sec.strand_id
       LEFT JOIN schedules sch ON sch.section_id = sec.id AND sch.teacher_id = ?
       LEFT JOIN subjects sub ON sub.id = sch.subject_id
       WHERE sch.teacher_id = ? OR sec.adviser_id = ? OR sec.co_adviser_id = ?
       GROUP BY sec.id, sec.name, sec.grade_level, st.code, sec.adviser_id, sec.co_adviser_id
       ORDER BY isAdvisory DESC, st.code, sec.grade_level, sec.name`,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    );
    if (!rows.length || req.user.role === 'admin') {
      [rows] = await pool.query(
        `SELECT sec.id, sec.name, sec.grade_level, st.code AS strandCode,
                IF(sec.adviser_id = ? OR sec.co_adviser_id = ?, 1, 0) AS isAdvisory,
                GROUP_CONCAT(DISTINCT sub.name ORDER BY sub.name SEPARATOR ', ') AS subjectsTaught
         FROM sections sec
         JOIN strands st ON st.id = sec.strand_id
         LEFT JOIN schedules sch ON sch.section_id = sec.id
         LEFT JOIN subjects sub ON sub.id = sch.subject_id
         GROUP BY sec.id, sec.name, sec.grade_level, st.code, sec.adviser_id, sec.co_adviser_id
         ORDER BY isAdvisory DESC, st.code, sec.grade_level, sec.name`,
        [req.user.id, req.user.id]
      );
    }
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
      SELECT DISTINCT sub.id, sub.code, sub.name, sub.classification, sub.grade_level, sub.quarter,
                      COALESCE(sub.ww_weight, 20.00) AS ww_weight,
                      COALESCE(sub.pt_weight, 50.00) AS pt_weight,
                      COALESCE(sub.qa_weight, 30.00) AS qa_weight
      FROM schedules sch JOIN subjects sub ON sub.id = sch.subject_id
      WHERE sch.teacher_id = ?`;
    if (req.query.sectionId && req.query.sectionId !== 'all') {
      sql += ' AND sch.section_id = ?';
      params.push(req.query.sectionId);
    }
    sql += ' ORDER BY sub.name';
    let [rows] = await pool.query(sql, params);
    if (!rows.length && req.query.sectionId && req.query.sectionId !== 'all') {
      [rows] = await pool.query(`
        SELECT DISTINCT sub.id, sub.code, sub.name, sub.classification, sub.grade_level, sub.quarter,
               COALESCE(sub.ww_weight, 20.00) AS ww_weight,
               COALESCE(sub.pt_weight, 50.00) AS pt_weight,
               COALESCE(sub.qa_weight, 30.00) AS qa_weight
        FROM schedules sch
        JOIN subjects sub ON sub.id = sch.subject_id
        WHERE sch.section_id = ?
        ORDER BY sub.name
      `, [req.query.sectionId]);

      if (!rows.length) {
        const [secRows] = await pool.query('SELECT grade_level, strand_id FROM sections WHERE id = ?', [req.query.sectionId]);
        if (secRows.length) {
          const [subRows] = await pool.query(`
            SELECT DISTINCT sub.id, sub.code, sub.name, sub.classification, sub.grade_level, sub.quarter,
                   COALESCE(sub.ww_weight, 20.00) AS ww_weight,
                   COALESCE(sub.pt_weight, 50.00) AS pt_weight,
                   COALESCE(sub.qa_weight, 30.00) AS qa_weight
            FROM subjects sub
            WHERE sub.grade_level = ? OR sub.grade_level = 0 OR sub.name = 'General Mathematics'
            ORDER BY sub.name
          `, [secRows[0].grade_level]);
          rows = subRows;
        }
      }
    }

    // Filter subjects by academic term if provided
    if (req.query.term && req.query.term !== 'all') {
      const termStr = String(req.query.term).toLowerCase();
      let targetTerm = 1;
      if (termStr.includes('2') || termStr.includes('second')) targetTerm = 2;
      else if (termStr.includes('3') || termStr.includes('third')) targetTerm = 3;

      rows = rows.filter(sub => {
        const q = sub.quarter != null ? Number(sub.quarter) : 0;
        // 0 = All terms (year-round), targetTerm = specific term
        return q === 0 || q === targetTerm;
      });
    }

    return res.json({ success: true, subjects: rows });
  } catch (err) {
    console.error('getMySubjects error:', err);
    return res.status(500).json({ success: false, message: 'Could not load your subjects.' });
  }
}

/**
 * GET /api/classes/my-assigned-classes
 * Returns the teacher's scheduled teaching classes (unique subject + section combinations),
 * along with student counts, strand, grade level, and category.
 */
async function getMyAssignedClasses(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT
         sub.id AS subjectId,
         sub.code AS subjectCode,
         sub.name AS subjectName,
         COALESCE(sub.classification, 'Specialized Subject') AS category,
         sub.quarter,
         sec.id AS sectionId,
         sec.name AS sectionName,
         sec.grade_level AS gradeLevel,
         st.code AS strand,
         IF(sec.adviser_id = ? OR sec.co_adviser_id = ?, 1, 0) AS isAdvisory,
         (SELECT COUNT(*) FROM users u WHERE u.section_id = sec.id AND u.role = 'student') AS studentCount
       FROM schedules sch
       JOIN subjects sub ON sub.id = sch.subject_id
       JOIN sections sec ON sec.id = sch.section_id
       JOIN strands st ON st.id = sec.strand_id
       WHERE sch.teacher_id = ?
       ORDER BY sec.name, sub.name`,
      [req.user.id, req.user.id, req.user.id]
    );

    return res.json({ success: true, assignedClasses: rows });
  } catch (err) {
    console.error('getMyAssignedClasses error:', err);
    return res.status(500).json({ success: false, message: 'Could not load your assigned classes.' });
  }
}

/**
 * PATCH /api/classes/student/:studentId/avatar
 * Allows teachers (and admins) to upload/update an official school ID photo for a student.
 */
async function updateStudentAvatar(req, res) {
  const { studentId } = req.params;
  const { avatarBase64 } = req.body;

  if (!avatarBase64 || !/^data:image\/(png|jpe?g|webp);base64,/.test(avatarBase64)) {
    return res.status(400).json({ success: false, message: 'A valid PNG, JPG, or WEBP image is required.' });
  }

  try {
    const [studentRows] = await pool.query('SELECT id, role, section_id FROM users WHERE id = ?', [studentId]);
    const student = studentRows[0];
    if (!student || student.role !== 'student') {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    if (req.user.role !== 'admin') {
      const teaches = await teacherTeachesStudent(req.user.id, studentId);
      const isAdviser = await isTeacherAdviserOfStudent(req.user.id, studentId);
      if (!teaches && !isAdviser) {
        return res.status(403).json({
          success: false,
          message: 'You can only update profile photos for students in your assigned sections.',
        });
      }
    }

    await pool.query('UPDATE users SET profile_picture_url = ? WHERE id = ?', [avatarBase64, studentId]);

    return res.json({
      success: true,
      message: 'Student official ID photo updated successfully.',
      profilePictureUrl: avatarBase64,
    });
  } catch (err) {
    console.error('updateStudentAvatar error:', err);
    return res.status(500).json({ success: false, message: 'Could not update student ID photo.' });
  }
}

/**
 * GET /api/classes/eclass-data?sectionId=&subjectId=
 * Returns section info, subject info, students enrolled, and any existing grades.
 */
async function getEclassData(req, res) {
  try {
    let { sectionId, subjectId } = req.query;

    if (!sectionId) {
      const [secRows] = await pool.query(
        `SELECT sec.id FROM sections sec
         LEFT JOIN schedules sch ON sch.section_id = sec.id AND sch.teacher_id = ?
         ORDER BY (sch.teacher_id IS NOT NULL) DESC, sec.grade_level, sec.name LIMIT 1`,
        [req.user.id]
      );
      if (secRows.length) sectionId = secRows[0].id;
    }

    if (!subjectId) {
      const [subRows] = await pool.query(
        `SELECT sub.id FROM subjects sub
         LEFT JOIN schedules sch ON sch.subject_id = sub.id AND sch.teacher_id = ?
         ORDER BY (sch.teacher_id IS NOT NULL) DESC, sub.name LIMIT 1`,
        [req.user.id]
      );
      if (subRows.length) subjectId = subRows[0].id;
    }

    let section = null;
    if (sectionId) {
      const [sRows] = await pool.query(
        `SELECT sec.id, sec.name, sec.grade_level, st.code AS strandCode, st.title AS strandTitle
         FROM sections sec
         JOIN strands st ON st.id = sec.strand_id
         WHERE sec.id = ?`,
        [sectionId]
      );
      section = sRows[0] || null;
    }

    let subject = null;
    if (subjectId) {
      const [sbRows] = await pool.query(
        `SELECT id, code, name, classification FROM subjects WHERE id = ?`,
        [subjectId]
      );
      subject = sbRows[0] || null;
    }

    let students = [];
    if (sectionId) {
      const [stRows] = await pool.query(
        `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name, u.sex,
                MAX(CASE WHEN g.term LIKE '%1st%' OR g.term LIKE '%Q1%' THEN g.average END) AS term1,
                MAX(CASE WHEN g.term LIKE '%2nd%' OR g.term LIKE '%Q2%' THEN g.average END) AS term2,
                MAX(CASE WHEN g.term LIKE '%3rd%' OR g.term LIKE '%Q3%' THEN g.average END) AS term3,
                ROUND(AVG(g.average), 1) AS average
         FROM users u
         LEFT JOIN grades g ON g.student_id = u.id AND g.subject_id = ?
         WHERE u.role = 'student' AND u.section_id = ?
         GROUP BY u.id, u.id_number, u.first_name, u.middle_initial, u.last_name, u.sex
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [subjectId || 0, sectionId]
      );
      students = stRows.map((r, idx) => ({
        no: idx + 1,
        id: r.id,
        idNumber: r.id_number,
        name: `${r.last_name}, ${r.first_name}${r.middle_initial ? ' ' + r.middle_initial + '.' : ''}`,
        firstName: r.first_name,
        lastName: r.last_name,
        sex: r.sex || 'Male',
        term1: r.term1 !== null ? Number(r.term1) : null,
        term2: r.term2 !== null ? Number(r.term2) : null,
        term3: r.term3 !== null ? Number(r.term3) : null,
        average: r.average !== null ? Number(r.average) : null,
      }));
    }

    return res.json({
      success: true,
      section,
      subject,
      teacher: {
        id: req.user.id,
        name: req.user.full_name || `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Subject Teacher'
      },
      students,
    });
  } catch (err) {
    console.error('getEclassData error:', err);
    return res.status(500).json({ success: false, message: 'Could not load e-Class record data.' });
  }
}

function normalizeCanonicalTerm(term) {
  const t = String(term || '').trim().toLowerCase();
  if (t === 't1' || t.includes('1st') || t.includes('first')) return '1st Term';
  if (t === 't2' || t.includes('2nd') || t.includes('second')) return '2nd Term';
  if (t === 't3' || t.includes('3rd') || t.includes('third')) return '3rd Term';
  if (t === 't4' || t.includes('4th') || t.includes('fourth')) return '4th Term';
  return term || '1st Term';
}

/**
 * POST /api/classes/eclass-save
 * Body: { sectionId, subjectId, term, grades: [ { studentId, idNumber, name, written_works, performance_tasks, quarterly_assessment, average } ] }
 * Saves or updates transmuted grades into database grades table.
 */
async function saveEclassGrades(req, res) {
  const { sectionId, subjectId, grades } = req.body;
  if (!subjectId || !Array.isArray(grades) || grades.length === 0) {
    return res.status(400).json({ success: false, message: 'Subject and grades array are required.' });
  }

  const termName = normalizeCanonicalTerm(req.body.term || '1st Term');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [subRows] = await conn.query('SELECT ww_weight, pt_weight, qa_weight FROM subjects WHERE id = ? LIMIT 1', [subjectId]);
    const subWwRatio = subRows[0] ? (Number(subRows[0].ww_weight) / 100) : 0.20;
    const subPtRatio = subRows[0] ? (Number(subRows[0].pt_weight) / 100) : 0.50;
    const subQaRatio = subRows[0] ? (Number(subRows[0].qa_weight) / 100) : 0.30;

    // Fast-path: Pre-fetch valid student IDs in bulk
    const numericIds = grades.map((g) => Number(g.studentId)).filter((id) => !isNaN(id) && id > 0);
    const validStudentIdSet = new Set();
    if (numericIds.length > 0) {
      const [uRows] = await conn.query('SELECT id FROM users WHERE role = "student" AND id IN (?)', [numericIds]);
      uRows.forEach((u) => validStudentIdSet.add(u.id));
    }

    // Fallback: If any entries have string names or id_number without a numeric studentId
    const unresolved = grades.filter((g) => {
      const n = Number(g.studentId);
      return isNaN(n) || n <= 0;
    });
    const fallbackMap = new Map();
    if (unresolved.length > 0) {
      const [allStudentRows] = await conn.query('SELECT id, id_number, first_name, last_name FROM users WHERE role = "student"');
      for (const s of allStudentRows) {
        if (s.id_number) fallbackMap.set(String(s.id_number).trim().toLowerCase(), s.id);
        const fullName1 = `${s.first_name} ${s.last_name}`.trim().toLowerCase();
        const fullName2 = `${s.last_name}, ${s.first_name}`.trim().toLowerCase();
        fallbackMap.set(fullName1, s.id);
        fallbackMap.set(fullName2, s.id);
      }
    }

    const gradesValues = [];
    const activityLogValues = [];
    let savedCount = 0;

    for (const g of grades) {
      let targetStudentId = Number(g.studentId);
      if (!isNaN(targetStudentId) && targetStudentId > 0) {
        if (!validStudentIdSet.has(targetStudentId)) continue;
      } else {
        const keyId = (g.idNumber || g.studentId || '').toString().trim().toLowerCase();
        const keyName = (g.name || '').toString().trim().toLowerCase();
        targetStudentId = fallbackMap.get(keyId) || fallbackMap.get(keyName);
        if (!targetStudentId) continue;
      }

      if (g.written_works !== undefined || g.average !== undefined) {
        const q = (g.written_works !== undefined && g.written_works !== null && g.written_works !== '') ? Number(g.written_works) : null;
        const a = (g.performance_tasks !== undefined && g.performance_tasks !== null && g.performance_tasks !== '') ? Number(g.performance_tasks) : null;
        const e = (g.quarterly_assessment !== undefined && g.quarterly_assessment !== null && g.quarterly_assessment !== '') ? Number(g.quarterly_assessment) : null;
        
        let avg = (g.average !== undefined && g.average !== null && g.average !== '' && !isNaN(Number(g.average))) ? Number(g.average) : null;
        if (avg === null) {
          let weightedSum = 0;
          let activeWeightSum = 0;
          if (q !== null) { weightedSum += q; activeWeightSum += (subWwRatio * 100); }
          if (a !== null) { weightedSum += a; activeWeightSum += (subPtRatio * 100); }
          if (e !== null) { weightedSum += e; activeWeightSum += (subQaRatio * 100); }
          if (activeWeightSum > 0) {
            const initial = (weightedSum / activeWeightSum) * 100;
            avg = initial >= 70 ? Math.round(75 + ((initial - 70) / 30) * 25) : Math.round(60 + (initial / 70) * 14);
          }
        }
        const rawScoresJson = g.raw_scores ? (typeof g.raw_scores === 'string' ? g.raw_scores : JSON.stringify(g.raw_scores)) : null;

        gradesValues.push([
          targetStudentId,
          subjectId,
          sectionId || 0,
          termName,
          q,
          a,
          e,
          avg,
          rawScoresJson,
          req.user.id,
        ]);

        activityLogValues.push([
          targetStudentId,
          `ECR Grade synchronized (${termName}): WW ${q !== null ? q : 'Pending'}, PT ${a !== null ? a : 'Pending'}, QA ${e !== null ? e : 'Pending'} (Average: ${avg !== null ? avg : 'Pending'})`,
        ]);
        savedCount++;
      } else {
        const termsToSave = [
          { term: '1st Term', score: g.term1 },
          { term: '2nd Term', score: g.term2 },
          { term: '3rd Term', score: g.term3 },
        ];

        let studentSaved = false;
        for (const t of termsToSave) {
          if (t.score !== undefined && t.score !== null && t.score !== '' && !isNaN(Number(t.score))) {
            const score = Number(t.score);
            const q = Math.round(score * subWwRatio * 100) / 100;
            const a = Math.round(score * subPtRatio * 100) / 100;
            const e = Math.round((score - q - a) * 100) / 100;

            gradesValues.push([
              targetStudentId,
              subjectId,
              sectionId || 0,
              t.term,
              q,
              a,
              e,
              score,
              null,
              req.user.id,
            ]);
            studentSaved = true;
          }
        }
        if (studentSaved) savedCount++;
      }
    }

    if (gradesValues.length > 0) {
      await conn.query(
        `INSERT INTO grades (student_id, subject_id, section_id, term, quiz_score, activity_score, exam_score, average, raw_scores, recorded_by)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           section_id = VALUES(section_id),
           quiz_score = VALUES(quiz_score),
           activity_score = VALUES(activity_score),
           exam_score = VALUES(exam_score),
           average = VALUES(average),
           raw_scores = VALUES(raw_scores),
           recorded_by = VALUES(recorded_by)`,
        [gradesValues]
      );
    }

    if (activityLogValues.length > 0) {
      await conn.query(
        'INSERT INTO activity_log (student_id, description) VALUES ?',
        [activityLogValues]
      );
    }

    await conn.commit();
    return res.json({
      success: true,
      message: `Successfully synchronized ${savedCount} learner records to Mentorae database.`,
      savedCount,
    });
  } catch (err) {
    await conn.rollback();
    console.error('saveEclassGrades error:', err);
    return res.status(500).json({ success: false, message: 'Could not save e-Class grades.' });
  } finally {
    conn.release();
  }
}

/**
 * POST /api/classes/export-ecr
 * Streams the 100% original, pristine official DepEd Macro-Enabled Class Record (.xlsm)
 * preserving all official seals, styles, colors, formulas, and VBA macros without corruption.
 */
async function exportECRWorkbook(req, res) {
  try {
    const { sectionId, subjectId } = req.body;
    const path = require('path');
    const fs = require('fs');

    let templatePath = path.join(__dirname, '../../frontend/Teacher/Sample_Template.xlsm');
    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(__dirname, '../../frontend/Teacher/ASSH 11 - 2-e-CLASS-RECORD.xlsm');
    }
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ success: false, message: 'DepEd ECR template file not found on server.' });
    }

    let sectionName = 'Class';
    let subjectCode = 'Subject';

    if (sectionId) {
      const [secRows] = await pool.query('SELECT name FROM sections WHERE id = ?', [sectionId]);
      if (secRows.length) sectionName = secRows[0].name;
    }
    if (subjectId) {
      const [subRows] = await pool.query('SELECT code, name FROM subjects WHERE id = ?', [subjectId]);
      if (subRows.length) subjectCode = subRows[0].code || subRows[0].name || 'Subject';
    }

    const cleanSec = sectionName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanSub = subjectCode.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outFilename = `${cleanSec}_${cleanSub}_e-CLASS-RECORD.xlsm`;

    res.setHeader('Content-Type', 'application/vnd.ms-excel.sheet.macroEnabled.12');
    res.setHeader('Content-Disposition', `attachment; filename="${outFilename}"`);
    return res.sendFile(templatePath);
  } catch (err) {
    console.error('exportECRWorkbook error:', err);
    return res.status(500).json({ success: false, message: 'Could not export DepEd ECR template.' });
  }
}

/**
 * POST /api/classes/student/:studentId/reset-password
 * Allows a teacher or admin to reset a student's password to their default (LRN / ID Number),
 * setting must_change_password = 1. Essential when a student has no personal email and forgets their password.
 */
async function resetStudentPasswordByTeacher(req, res) {
  const { studentId } = req.params;
  try {
    const [[student]] = await pool.query(
      'SELECT id, role, id_number, first_name, last_name, section_id FROM users WHERE id = ? AND role = "student"',
      [studentId]
    );
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student account not found.' });
    }

    const defaultPassword = student.id_number;
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    await pool.query(
      'UPDATE users SET password_hash = ?, temp_password = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?',
      [passwordHash, defaultPassword, student.id]
    );

    return res.json({
      success: true,
      message: `Password for ${student.first_name} ${student.last_name} has been reset to default (${defaultPassword}).`,
      defaultPassword,
    });
  } catch (err) {
    console.error('resetStudentPasswordByTeacher error:', err);
    return res.status(500).json({ success: false, message: 'Could not reset student password.' });
  }
}

module.exports = {
  getRosterOverview,
  getMySections,
  getMySubjects,
  getMyAssignedClasses,
  updateStudentAvatar,
  getEclassData,
  saveEclassGrades,
  exportECRWorkbook,
  resetStudentPasswordByTeacher,
};

