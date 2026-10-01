const pool = require('../config/db');
const { teacherTeachesSection, teacherTeachesStudent, getAdviserIdForStudent } = require('../utils/authz');

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
    const today = new Date().toISOString().slice(0, 10);
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
                  OR u.section_id IN (SELECT id FROM sections WHERE adviser_id = ?))
           ORDER BY u.last_name`,
          [today, req.user.id, req.user.id]
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
                OR u.section_id IN (SELECT id FROM sections WHERE adviser_id = ?))`,
        [today, req.user.id, req.user.id]
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

/** GET /api/classes/my-sections — sections this teacher has a schedule in (for the filter dropdowns) */
async function getMySections(req, res) {
  try {
    let [rows] = await pool.query(
      `SELECT DISTINCT sec.id, sec.name, sec.grade_level, st.code AS strandCode,
              IF(sec.adviser_id = ?, 1, 0) AS isAdvisory
       FROM sections sec
       JOIN strands st ON st.id = sec.strand_id
       LEFT JOIN schedules sch ON sch.section_id = sec.id AND sch.teacher_id = ?
       WHERE sch.teacher_id = ? OR sec.adviser_id = ?
       ORDER BY isAdvisory DESC, st.code, sec.grade_level, sec.name`,
      [req.user.id, req.user.id, req.user.id, req.user.id]
    );
    if (!rows.length || req.user.role === 'admin') {
      [rows] = await pool.query(
        `SELECT DISTINCT sec.id, sec.name, sec.grade_level, st.code AS strandCode,
                IF(sec.adviser_id = ?, 1, 0) AS isAdvisory
         FROM sections sec
         JOIN strands st ON st.id = sec.strand_id
         ORDER BY isAdvisory DESC, st.code, sec.grade_level, sec.name`,
        [req.user.id]
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
    }
    if (!rows.length) {
      [rows] = await pool.query(`
        SELECT id, code, name, classification, grade_level, quarter,
               COALESCE(ww_weight, 20.00) AS ww_weight,
               COALESCE(pt_weight, 50.00) AS pt_weight,
               COALESCE(qa_weight, 30.00) AS qa_weight
        FROM subjects ORDER BY name LIMIT 10`);
    }
    return res.json({ success: true, subjects: rows });
  } catch (err) {
    console.error('getMySubjects error:', err);
    return res.status(500).json({ success: false, message: 'Could not load your subjects.' });
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
      const isAdviser = (await getAdviserIdForStudent(studentId)) === req.user.id;
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

    let savedCount = 0;
    for (const g of grades) {
      let targetStudentId = Number(g.studentId);
      if (isNaN(targetStudentId) || targetStudentId <= 0) {
        const [uRows] = await conn.query(
          `SELECT id FROM users WHERE role = 'student' AND (id_number = ? OR CONCAT(first_name, ' ', last_name) = ? OR CONCAT(last_name, ', ', first_name) = ?) LIMIT 1`,
          [g.idNumber || g.studentId, g.name || '', g.name || '']
        );
        if (uRows.length) {
          targetStudentId = uRows[0].id;
        } else {
          continue;
        }
      } else {
        const [uRows] = await conn.query(`SELECT id FROM users WHERE id = ? AND role = 'student'`, [targetStudentId]);
        if (!uRows.length) continue;
      }

      if (g.written_works !== undefined || g.average !== undefined) {
        const q = Math.max(0, Math.min(100, Number(g.written_works) || 0));
        const a = Math.max(0, Math.min(100, Number(g.performance_tasks) || 0));
        const e = Math.max(0, Math.min(100, Number(g.quarterly_assessment) || 0));
        const avg = Number(g.average) || (q + a + e);
        const rawScoresJson = g.raw_scores ? (typeof g.raw_scores === 'string' ? g.raw_scores : JSON.stringify(g.raw_scores)) : null;

        await conn.query(
          `INSERT INTO grades (student_id, subject_id, section_id, term, quiz_score, activity_score, exam_score, raw_scores, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             section_id = VALUES(section_id),
             quiz_score = VALUES(quiz_score),
             activity_score = VALUES(activity_score),
             exam_score = VALUES(exam_score),
             raw_scores = VALUES(raw_scores),
             recorded_by = VALUES(recorded_by)`,
          [targetStudentId, subjectId, sectionId || 0, termName, q, a, e, rawScoresJson, req.user.id]
        );

        await conn.query('INSERT INTO activity_log (student_id, description) VALUES (?, ?)', [
          targetStudentId,
          `ECR Grade synchronized (${termName}): WW ${q}, PT ${a}, QA ${e} (Average: ${avg})`,
        ]);
      } else {
        const termsToSave = [
          { term: '1st Term', score: g.term1 },
          { term: '2nd Term', score: g.term2 },
          { term: '3rd Term', score: g.term3 },
        ];

        for (const t of termsToSave) {
          if (t.score !== undefined && t.score !== null && t.score !== '' && !isNaN(Number(t.score))) {
            const score = Number(t.score);
            const q = Math.round(score * subWwRatio * 100) / 100;
            const a = Math.round(score * subPtRatio * 100) / 100;
            const e = Math.round((score - q - a) * 100) / 100;

            await conn.query(
              `INSERT INTO grades (student_id, subject_id, section_id, term, quiz_score, activity_score, exam_score, recorded_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 section_id = VALUES(section_id),
                 quiz_score = VALUES(quiz_score),
                 activity_score = VALUES(activity_score),
                 exam_score = VALUES(exam_score),
                 recorded_by = VALUES(recorded_by)`,
              [targetStudentId, subjectId, sectionId || 0, t.term, q, a, e, req.user.id]
            );
          }
        }
      }
      savedCount++;
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

    const templatePath = path.join(__dirname, '../../frontend/Teacher/ASSH 11 - 2-e-CLASS-RECORD.xlsm');
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

module.exports = {
  getRosterOverview,
  getMySections,
  getMySubjects,
  updateStudentAvatar,
  getEclassData,
  saveEclassGrades,
  exportECRWorkbook,
};

