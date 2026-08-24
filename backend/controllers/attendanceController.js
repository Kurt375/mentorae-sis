const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { parsePagination, paginatedMeta } = require('../utils/pagination');
const { teacherTeachesSection, canViewStudent, getParentIdsForStudent, getAdviserIdForStudent } = require('../utils/authz');
const { notify, notifyMany } = require('../utils/notifications');

async function logActivity(studentId, description) {
  try {
    await pool.query('INSERT INTO activity_log (student_id, description) VALUES (?, ?)', [studentId, description]);
  } catch (err) {
    console.error('logActivity error:', err);
  }
}

/** Reads the handful of timing settings used by scanning/notifications, with hardcoded fallbacks. */
async function getAttendanceSettings() {
  const [rows] = await pool.query(
    `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN
     ('attendance_late_cutoff','attendance_time_out_cutoff','scanner_key_window_start','scanner_key_window_end')`
  );
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  return {
    lateCutoff: map.attendance_late_cutoff || '07:45:00',
    timeOutCutoff: map.attendance_time_out_cutoff || '15:30:00',
    scannerWindowStart: map.scanner_key_window_start || '06:00:00',
    scannerWindowEnd: map.scanner_key_window_end || '16:00:00',
  };
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
 * Called by the camera scanner once a QR code is decoded.
 * First scan of the day = time-in (present/late). Second scan of the same
 * day = time-out: on/after the time-out cutoff (default 3:30 PM) is marked
 * "out"; before the cutoff is flagged "excused" (left early).
 * These raw scans are unconfirmed — parents/advisers are only notified once
 * a teacher verifies the record (see confirmAttendance / confirmAttendanceOut).
 */
async function scanAttendance(req, res) {
  const { idNumber } = req.body;
  if (!idNumber) {
    return res.status(400).json({ success: false, message: 'No QR code data received.' });
  }

  try {
    const [studentRows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name, u.section_id,
              u.profile_picture_url, s.grade_level, st.code AS strandCode
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

    // Only show/allow students under this teacher's current subject & time slot —
    // a teacher can only scan a student whose section they have an active
    // scheduled period for right now. Security/admin scans (front-gate) skip this.
    if (req.user?.role === 'teacher') {
      if (!student.section_id) {
        return res.status(403).json({ success: false, message: 'This student has no assigned section.' });
      }
      const session = await checkSessionLock(req.user.id, student.section_id, null);
      if (!session.isAllowed) {
        return res.status(403).json({ success: false, message: `Cannot scan — ${session.reason}` });
      }
    }

    const now = new Date();
    const scanDate = now.toISOString().slice(0, 10);
    const scanTime = now.toTimeString().slice(0, 8);
    const { lateCutoff, timeOutCutoff } = await getAttendanceSettings();

    const [existing] = await pool.query(
      'SELECT * FROM attendance_logs WHERE student_id = ? AND scan_date = ?',
      [student.id, scanDate]
    );

    const studentOut = {
      name: `${student.first_name} ${student.middle_initial ? student.middle_initial + ' ' : ''}${student.last_name}`,
      idNumber: student.id_number,
      strand: student.grade_level ? `Grade${student.grade_level}-${student.strandCode}` : student.strandCode || '—',
      profilePictureUrl: student.profile_picture_url || null,
    };

    if (!existing[0]) {
      // First scan today = time in
      const status = scanTime > lateCutoff ? 'late' : 'present';
      await pool.query(
        'INSERT INTO attendance_logs (student_id, scanned_by, status, scan_date, scan_time) VALUES (?, ?, ?, ?, ?)',
        [student.id, req.user?.id || null, status, scanDate, scanTime]
      );
      await logActivity(student.id, `Checked in via QR scan — marked ${status}.`);

      return res.json({
        success: true,
        message: `Checked in — marked ${status}.`,
        scanType: 'in',
        student: { ...studentOut, status },
      });
    }

    if (existing[0].time_out) {
      return res.status(409).json({
        success: false,
        message: `${student.first_name} has already been marked out today.`,
      });
    }

    // Second scan today = time out
    const timeOutStatus = scanTime >= timeOutCutoff ? 'out' : 'excused';
    await pool.query('UPDATE attendance_logs SET time_out = ?, time_out_status = ? WHERE id = ?', [
      scanTime,
      timeOutStatus,
      existing[0].id,
    ]);
    await logActivity(
      student.id,
      timeOutStatus === 'out' ? 'Checked out via QR scan.' : 'Checked out early via QR scan — flagged excused.'
    );

    return res.json({
      success: true,
      message: timeOutStatus === 'out' ? 'Checked out.' : 'Checked out early — flagged as excused.',
      scanType: 'out',
      student: { ...studentOut, status: timeOutStatus },
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
    const nowStr = new Date().toTimeString().slice(0, 8);
    const { scannerWindowStart, scannerWindowEnd } = await getAttendanceSettings();

    const [rows] = await pool.query('SELECT * FROM scanner_keys WHERE is_active = 1');
    for (const row of rows) {
      if (await bcrypt.compare(key, row.key_hash)) {
        const windowStart = row.valid_from || scannerWindowStart;
        const windowEnd = row.valid_until || scannerWindowEnd;
        if (nowStr < windowStart || nowStr > windowEnd) {
          return res.status(403).json({
            success: false,
            message: `This scanner code is only valid between ${windowStart.slice(0, 5)} and ${windowEnd.slice(0, 5)}.`,
          });
        }
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
              a.status, a.scan_time, a.time_out, a.time_out_status
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
      timeOut: r.time_out,
      timeOutStatus: r.time_out_status,
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

    // Parent notification — only fires once a teacher has verified the scan.
    if (['present', 'late', 'excused'].includes(status)) {
      const parentIds = await getParentIdsForStudent(studentId);
      const notifType = status === 'present' ? 'attendance_arrived' : status === 'late' ? 'attendance_late' : 'attendance_excused';
      const label = status === 'present' ? 'arrived at school' : status === 'late' ? 'arrived late' : 'been marked excused';
      await notifyMany(parentIds, {
        type: notifType,
        title: 'Attendance update',
        message: `Your child has ${label}, confirmed by their teacher.`,
        relatedStudentId: studentId,
      });
    }

    return res.json({ success: true, message: `Attendance updated to ${status}.` });
  } catch (err) {
    console.error('confirmAttendance error:', err);
    return res.status(500).json({ success: false, message: 'Could not update attendance.' });
  }
}

/**
 * POST /api/attendance/confirm-out  { studentId, sectionId }
 * Teacher verifies a student's time-out scan for today. Notifies the
 * parent(s) (out / excused), and if the student left early (excused),
 * also notifies the section adviser.
 */
async function confirmAttendanceOut(req, res) {
  const { studentId, sectionId } = req.body;
  if (!studentId || !sectionId) {
    return res.status(400).json({ success: false, message: 'studentId and sectionId are required.' });
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
      'SELECT * FROM attendance_logs WHERE student_id = ? AND scan_date = ?',
      [studentId, today]
    );
    const record = rows[0];
    if (!record || !record.time_out) {
      return res.status(400).json({ success: false, message: 'This student has no time-out scan to confirm yet.' });
    }

    await pool.query('UPDATE attendance_logs SET confirmed_by = ?, confirmed_at = NOW() WHERE id = ?', [
      req.user.id,
      record.id,
    ]);
    await logActivity(studentId, `Time-out scan (${record.time_out_status}) confirmed by a teacher.`);

    const parentIds = await getParentIdsForStudent(studentId);
    const isEarly = record.time_out_status === 'excused';
    await notifyMany(parentIds, {
      type: isEarly ? 'attendance_excused' : 'attendance_out',
      title: 'Attendance update',
      message: isEarly
        ? 'Your child left campus early today (before dismissal), confirmed by their teacher.'
        : 'Your child has checked out for the day, confirmed by their teacher.',
      relatedStudentId: studentId,
    });

    if (isEarly) {
      const adviserId = await getAdviserIdForStudent(studentId);
      await notify({
        recipientId: adviserId,
        type: 'adviser_early_leave',
        title: 'Student left early',
        message: `A student from your section left campus early today (${record.time_out}).`,
        relatedStudentId: studentId,
      });
    }

    return res.json({ success: true, message: 'Time-out confirmed.' });
  } catch (err) {
    console.error('confirmAttendanceOut error:', err);
    return res.status(500).json({ success: false, message: 'Could not confirm the time-out scan.' });
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
  confirmAttendanceOut,
  getSummary,
  getHistory,
};
