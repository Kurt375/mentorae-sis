const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { parsePagination, paginatedMeta } = require('../utils/pagination');
const { teacherTeachesSection, canViewStudent } = require('../utils/authz');

async function logActivity(studentId, description) {
  try {
    await pool.query('INSERT INTO activity_log (student_id, description) VALUES (?, ?)', [studentId, description]);
  } catch (err) {
    console.error('logActivity error:', err);
  }
}

/** GET /api/attendance/my-qr — the text a student's QR code should encode (their own ID number) */
async function getMyQrCode(req, res) {
  if (req.user.role !== 'student') {
    return res.status(403).json({ success: false, message: 'Only students have an attendance QR code.' });
  }
  return res.json({ success: true, qrText: req.user.id_number });
}

/**
 * POST /api/attendance/scan  { idNumber }
 * Called by the camera scanner once a QR code is decoded. Self check-in —
 * marks present/late based on the admin-configured cutoff time.
 */
async function scanAttendance(req, res) {
  const { idNumber } = req.body;
  if (!idNumber) {
    return res.status(400).json({ success: false, message: 'No QR code data received.' });
  }

  try {
    const [studentRows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name, s.grade_level, st.code AS strandCode
       FROM users u
       LEFT JOIN sections s ON s.id = u.section_id
       LEFT JOIN strands st ON st.id = s.strand_id
       WHERE u.id_number = ? AND u.role = 'student'`,
      [idNumber]
    );
    const student = studentRows[0];
    if (!student) {
      return res.status(404).json({ success: false, message: 'Unknown QR code.' });
    }

    const now = new Date();
    const scanDate = now.toISOString().slice(0, 10);
    const scanTime = now.toTimeString().slice(0, 8);

    const [cutoffRow] = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'attendance_late_cutoff'"
    );
    const lateCutoff = cutoffRow[0]?.setting_value || '07:45:00';
    const status = scanTime > lateCutoff ? 'late' : 'present';

    const [existing] = await pool.query(
      'SELECT id, status FROM attendance_logs WHERE student_id = ? AND scan_date = ?',
      [student.id, scanDate]
    );

    if (existing[0]) {
      return res.status(409).json({
        success: false,
        message: `${student.first_name} already checked in today.`,
      });
    }

    await pool.query(
      'INSERT INTO attendance_logs (student_id, scanned_by, status, scan_date, scan_time) VALUES (?, ?, ?, ?, ?)',
      [student.id, req.user?.id || null, status, scanDate, scanTime]
    );
    await logActivity(student.id, `Checked in via QR scan — marked ${status}.`);

    return res.json({
      success: true,
      message: `Checked in — marked ${status}.`,
      student: {
        name: `${student.first_name} ${student.middle_initial ? student.middle_initial + ' ' : ''}${student.last_name}`,
        idNumber: student.id_number,
        strand: student.grade_level ? `Grade${student.grade_level}-${student.strandCode}` : student.strandCode || '—',
        status,
      },
    });
  } catch (err) {
    console.error('scanAttendance error:', err);
    return res.status(500).json({ success: false, message: 'Could not record attendance right now.' });
  }
}

/** POST /api/attendance/verify-scanner-key  { key } — used by the login page's "Scanner Access" box */
async function verifyScannerKey(req, res) {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ success: false, message: 'Please enter a scanner access code.' });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM scanner_keys WHERE is_active = 1');
    for (const row of rows) {
      if (await bcrypt.compare(key, row.key_hash)) {
        const token = jwt.sign({ role: 'security', label: row.label }, process.env.JWT_SECRET, { expiresIn: '12h' });
        return res.json({ success: true, token });
      }
    }
    return res.status(401).json({ success: false, message: 'Invalid or inactive scanner code.' });
  } catch (err) {
    console.error('verifyScannerKey error:', err);
    return res.status(500).json({ success: false, message: 'Could not verify the code right now.' });
  }
}

/** Core session-lock check, shared by the HTTP endpoint and confirmAttendance.
 * If subjectId is omitted, matches any of the teacher's schedules for that
 * section today (used by the Attendance Confirmation page, which doesn't
 * ask the teacher to pick a subject). */
async function checkSessionLock(teacherId, sectionId, subjectId) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const now = new Date();
  const today = dayNames[now.getDay()];
  const nowStr = now.toTimeString().slice(0, 8);

  const params = subjectId ? [teacherId, sectionId, subjectId, today] : [teacherId, sectionId, today];
  const sql = subjectId
    ? `SELECT * FROM schedules WHERE teacher_id = ? AND section_id = ? AND subject_id = ? AND day_of_week = ?`
    : `SELECT * FROM schedules WHERE teacher_id = ? AND section_id = ? AND day_of_week = ? ORDER BY start_time`;

  const [rows] = await pool.query(sql, params);

  if (!rows.length) {
    return { isAllowed: false, reason: 'You have no scheduled period for this section today.' };
  }

  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const nowMin = toMinutes(nowStr);

  // Find a schedule block that's currently active (with a 5-minute buffer)
  const activeSchedule = rows.find((s) => nowMin >= toMinutes(s.start_time) - 5 && nowMin <= toMinutes(s.end_time) + 5);

  if (activeSchedule) {
    return { isAllowed: true, reason: 'Session Active. You can confirm attendance.' };
  }

  const next = rows.find((s) => toMinutes(s.start_time) - 5 > nowMin);
  if (next) {
    return {
      isAllowed: false,
      reason: `Session not started yet. Your next scheduled time for this section is ${next.start_time} - ${next.end_time}.`,
    };
  }
  return {
    isAllowed: false,
    reason: `All of today's scheduled sessions for this section have ended. Modifications are locked.`,
  };
}

/**
 * GET /api/attendance/session-status?sectionId=&subjectId=
 * Tells the teacher's confirmation page whether they're inside their own
 * scheduled class period right now (the "session lock" banner).
 */
async function getSessionStatus(req, res) {
  const { sectionId, subjectId } = req.query;
  if (!sectionId) {
    return res.status(400).json({ success: false, message: 'sectionId is required.' });
  }
  try {
    const result = await checkSessionLock(req.user.id, sectionId, subjectId || null);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('getSessionStatus error:', err);
    return res.status(500).json({ success: false, message: 'Could not check session status.' });
  }
}

/**
 * GET /api/attendance/confirmation?sectionId=
 * Today's roster + attendance status for a teacher's section, for the
 * attendance confirmation page.
 */
async function getConfirmationRoster(req, res) {
  const { sectionId } = req.query;
  if (!sectionId) {
    return res.status(400).json({ success: false, message: 'sectionId is required.' });
  }

  try {
    if (req.user.role === 'teacher') {
      const teaches = await teacherTeachesSection(req.user.id, sectionId);
      if (!teaches) {
        return res.status(403).json({ success: false, message: 'You do not teach this section.' });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name,
              st.code AS strandCode, sec.grade_level, sec.name AS sectionName,
              a.status, a.scan_time
       FROM users u
       JOIN sections s ON s.id = u.section_id
       JOIN sections sec ON sec.id = u.section_id
       JOIN strands st ON st.id = s.strand_id
       LEFT JOIN attendance_logs a ON a.student_id = u.id AND a.scan_date = ?
       WHERE u.role = 'student' AND u.section_id = ?
       ORDER BY u.last_name`,
      [today, sectionId]
    );

    const roster = rows.map((r) => ({
      id: r.id,
      idNumber: r.id_number,
      name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
      strand: `Grade${r.grade_level}-${r.strandCode}`,
      section: r.sectionName,
      status: r.status || 'absent',
      timeIn: r.scan_time,
    }));

    return res.json({ success: true, roster });
  } catch (err) {
    console.error('getConfirmationRoster error:', err);
    return res.status(500).json({ success: false, message: 'Could not load the attendance roster.' });
  }
}

/**
 * POST /api/attendance/confirm  { studentId, status, sectionId, subjectId }
 * The (now real) Confirm/Unconfirm action — only allowed within the
 * teacher's own active scheduled session for that section/subject.
 */
async function confirmAttendance(req, res) {
  const { studentId, status, sectionId, subjectId } = req.body;
  const validStatuses = ['present', 'late', 'absent', 'excused'];

  if (!studentId || !status || !validStatuses.includes(status) || !sectionId) {
    return res.status(400).json({ success: false, message: 'studentId, status, and sectionId are required.' });
  }

  try {
    // Re-check session lock server-side — never trust the client's banner alone
    const session = await checkSessionLock(req.user.id, sectionId, subjectId || null);
    if (!session.isAllowed) {
      return res.status(403).json({ success: false, message: session.reason });
    }

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toTimeString().slice(0, 8);

    const [existing] = await pool.query('SELECT id FROM attendance_logs WHERE student_id = ? AND scan_date = ?', [
      studentId,
      today,
    ]);

    if (existing[0]) {
      await pool.query(
        'UPDATE attendance_logs SET status = ?, overridden_by = ?, scan_time = COALESCE(scan_time, ?) WHERE id = ?',
        [status, req.user.id, now, existing[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO attendance_logs (student_id, scanned_by, overridden_by, status, scan_date, scan_time) VALUES (?, ?, ?, ?, ?, ?)',
        [studentId, req.user.id, req.user.id, status, today, status === 'absent' ? null : now]
      );
    }

    await logActivity(studentId, `Attendance manually set to "${status}" by a teacher.`);

    return res.json({ success: true, message: `Attendance updated to ${status}.` });
  } catch (err) {
    console.error('confirmAttendance error:', err);
    return res.status(500).json({ success: false, message: 'Could not update attendance.' });
  }
}

/** GET /api/attendance/summary?studentId= */
async function getSummary(req, res) {
  try {
    const studentId = await resolveStudentId(req);
    if (studentId.error) return res.status(studentId.code).json({ success: false, message: studentId.error });

    const [[totals]] = await pool.query(
      `SELECT COUNT(*) AS totalDays, SUM(status IN ('present','late')) AS presentDays
       FROM attendance_logs WHERE student_id = ?`,
      [studentId.id]
    );
    const totalDays = totals.totalDays || 0;
    const presentDays = totals.presentDays || 0;
    const rate = totalDays ? Math.round((presentDays / totalDays) * 100) : 0;

    return res.json({ success: true, totalDays, presentDays, rate });
  } catch (err) {
    console.error('getSummary error:', err);
    return res.status(500).json({ success: false, message: 'Could not load attendance summary.' });
  }
}

/** GET /api/attendance/history?studentId=&page=&limit= */
async function getHistory(req, res) {
  try {
    const studentId = await resolveStudentId(req);
    if (studentId.error) return res.status(studentId.code).json({ success: false, message: studentId.error });

    const { page, limit, offset } = parsePagination(req.query, { limit: 30 });
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM attendance_logs WHERE student_id = ?', [
      studentId.id,
    ]);
    const [rows] = await pool.query(
      'SELECT scan_date, scan_time, status FROM attendance_logs WHERE student_id = ? ORDER BY scan_date DESC LIMIT ? OFFSET ?',
      [studentId.id, limit, offset]
    );

    return res.json({ success: true, history: rows, ...paginatedMeta(total, page, limit) });
  } catch (err) {
    console.error('getHistory error:', err);
    return res.status(500).json({ success: false, message: 'Could not load attendance history.' });
  }
}

/** Shared helper: figure out which student's records the caller may view. */
async function resolveStudentId(req) {
  let studentId = req.user.role === 'student' ? req.user.id : req.query.studentId;
  if (!studentId) return { error: 'studentId is required.', code: 400 };

  if (req.query.studentId && req.query.studentId != req.user.id) {
    const gate = await canViewStudent(req.user, req.query.studentId);
    if (!gate.ok) return { error: gate.message, code: gate.status };
  }
  return { id: studentId };
}

module.exports = {
  getMyQrCode,
  scanAttendance,
  verifyScannerKey,
  getSessionStatus,
  getConfirmationRoster,
  confirmAttendance,
  getSummary,
  getHistory,
};
