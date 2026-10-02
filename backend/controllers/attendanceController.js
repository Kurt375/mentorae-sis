const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { parsePagination, paginatedMeta } = require('../utils/pagination');
const { teacherTeachesSection, canViewStudent, getParentIdsForStudent, getAdviserIdForStudent } = require('../utils/authz');
const { notify, notifyMany } = require('../utils/notifications');
const {
  getManilaDate,
  getManilaTime,
  getManilaDayOfWeek,
  isTimeWithinWindow,
  timeToMinutes,
} = require('../utils/dateUtils');

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

    const scanDate = getManilaDate();
    const scanTime = getManilaTime();
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
      const status = timeToMinutes(scanTime) > timeToMinutes(lateCutoff) ? 'late' : 'present';
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
    const timeOutStatus = timeToMinutes(scanTime) >= timeToMinutes(timeOutCutoff) ? 'out' : 'excused';
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
    const nowStr = getManilaTime();
    const { scannerWindowStart, scannerWindowEnd } = await getAttendanceSettings();

    const [rows] = await pool.query('SELECT * FROM scanner_keys WHERE is_active = 1');
    for (const row of rows) {
      if (await bcrypt.compare(key, row.key_hash)) {
        const windowStart = row.valid_from || scannerWindowStart;
        const windowEnd = row.valid_until || scannerWindowEnd;
        if (!isTimeWithinWindow(nowStr, windowStart, windowEnd)) {
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
  const today = getManilaDayOfWeek();
  const nowStr = getManilaTime();

  // Check if this teacher is the official section adviser
  const [[sec]] = await pool.query('SELECT adviser_id FROM sections WHERE id = ?', [sectionId]);
  const isAdviser = Boolean(sec && sec.adviser_id === teacherId);

  // Helper to format HH:MM:SS to 12-hour format (e.g. 8:30 AM)
  const formatTime12 = (t) => {
    if (!t) return '';
    const [hStr, mStr] = t.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr ? mStr.padStart(2, '0') : '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  };

  // If this is the teacher's advisory class and no specific subject period was requested:
  // Advisory attendance validation starts at 7:00 AM and ends when the first subject ends.
  if (isAdviser && !subjectId) {
    if (today === 'Saturday' || today === 'Sunday') {
      return { isAllowed: false, reason: 'Advisory attendance validation cannot be performed on weekends.' };
    }

    // Find the first scheduled subject of the day for this section
    const [firstSubRows] = await pool.query(
      'SELECT start_time, end_time FROM schedules WHERE section_id = ? AND day_of_week = ? ORDER BY start_time ASC LIMIT 1',
      [sectionId, today]
    );

    // Use the first subject's end time, or 08:30:00 default if no schedule is registered for today
    const firstSubEndTime = firstSubRows[0]?.end_time || '08:30:00';
    const formattedEnd = formatTime12(firstSubEndTime);

    if (nowStr < '07:00:00') {
      return {
        isAllowed: false,
        reason: `Advisory attendance validation begins at 7:00 AM and closes when the first subject ends (${formattedEnd}).`,
      };
    }

    if (nowStr > firstSubEndTime) {
      // Allow if the teacher has an active subject period right now
      const [schedRows] = await pool.query(
        'SELECT * FROM schedules WHERE teacher_id = ? AND section_id = ? AND day_of_week = ? ORDER BY start_time',
        [teacherId, sectionId, today]
      );
      const toMinutes = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      const nowMin = toMinutes(nowStr);
      const activeSchedule = schedRows.find(
        (s) => nowMin >= toMinutes(s.start_time) - 5 && nowMin <= toMinutes(s.end_time) + 5
      );

      if (activeSchedule) {
        return { isAllowed: true, reason: 'Subject Session Active. You can confirm attendance for this period.' };
      }

      return {
        isAllowed: false,
        reason: `Advisory attendance validation closed when the first subject ended at ${formattedEnd}.`,
      };
    }

    return {
      isAllowed: true,
      reason: `Advisory Session Active (7:00 AM – ${formattedEnd}). You can validate your class daily attendance.`,
    };
  }

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
    const [[sec]] = await pool.query('SELECT adviser_id FROM sections WHERE id = ?', [sectionId]);
    const isAdviser = Boolean(sec && sec.adviser_id === req.user.id);

    if (req.user.role === 'teacher') {
      const teaches = await teacherTeachesSection(req.user.id, sectionId);
      if (!teaches && !isAdviser) {
        return res.status(403).json({ success: false, message: 'You do not teach or advise this section.' });
      }
    }

    const today = getManilaDate();
    const [rows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name,
              st.code AS strandCode, sec.grade_level, sec.name AS sectionName,
              a.status, a.scan_time, a.time_out, a.time_out_status, a.confirmed_at, a.confirmed_by
       FROM users u
       JOIN sections sec ON sec.id = u.section_id
       JOIN strands st ON st.id = sec.strand_id
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
      timeOutConfirmed: Boolean(r.confirmed_at || r.confirmed_by),
      confirmedAt: r.confirmed_at,
    }));

    const hasTimeOuts = rows.some((r) => r.time_out);
    const allTimeOutsConfirmed = hasTimeOuts && rows.filter((r) => r.time_out).every((r) => r.confirmed_at || r.confirmed_by);

    return res.json({ success: true, roster, isAdvisory: isAdviser, allTimeOutsConfirmed });
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

    const today = getManilaDate();
    const now = getManilaTime();

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

    const today = getManilaDate();
    const [rows] = await pool.query(
      'SELECT * FROM attendance_logs WHERE student_id = ? AND scan_date = ?',
      [studentId, today]
    );
    const record = rows[0];
    if (!record || !record.time_out) {
      return res.status(400).json({ success: false, message: 'This student has no time-out scan to confirm yet.' });
    }

    if (record.confirmed_at || record.confirmed_by) {
      return res.json({ success: true, message: 'Time-out already confirmed.' });
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

/**
 * POST /api/attendance/finish-section  { sectionId }
 * Teacher finalizes attendance confirmation for a section for today.
 * Confirms any remaining unconfirmed time-out scans and ensures daily absent records exist.
 */
async function finishSectionConfirmation(req, res) {
  const { sectionId } = req.body;
  if (!sectionId) {
    return res.status(400).json({ success: false, message: 'sectionId is required.' });
  }

  try {
    if (req.user.role === 'teacher') {
      const [[sec]] = await pool.query('SELECT adviser_id FROM sections WHERE id = ?', [sectionId]);
      const isAdviser = Boolean(sec && sec.adviser_id === req.user.id);
      const teaches = await teacherTeachesSection(req.user.id, sectionId);
      if (!teaches && !isAdviser) {
        return res.status(403).json({ success: false, message: 'You do not teach or advise this section.' });
      }
    }

    const today = getManilaDate();

    // 1. Confirm any pending unconfirmed time-out scans for students in this section today
    const [pendingOuts] = await pool.query(
      `SELECT a.id, a.student_id, a.time_out, a.time_out_status
       FROM attendance_logs a
       JOIN users u ON u.id = a.student_id
       WHERE u.section_id = ? AND a.scan_date = ? AND a.time_out IS NOT NULL AND a.confirmed_at IS NULL`,
      [sectionId, today]
    );

    for (const record of pendingOuts) {
      await pool.query('UPDATE attendance_logs SET confirmed_by = ?, confirmed_at = NOW() WHERE id = ?', [
        req.user.id,
        record.id,
      ]);
      await logActivity(record.student_id, `Time-out scan (${record.time_out_status}) confirmed upon finishing attendance.`);

      const parentIds = await getParentIdsForStudent(record.student_id);
      const isEarly = record.time_out_status === 'excused';
      await notifyMany(parentIds, {
        type: isEarly ? 'attendance_excused' : 'attendance_out',
        title: 'Attendance update',
        message: isEarly
          ? 'Your child left campus early today (before dismissal), confirmed by their teacher.'
          : 'Your child has checked out for the day, confirmed by their teacher.',
        relatedStudentId: record.student_id,
      });

      if (isEarly) {
        const adviserId = await getAdviserIdForStudent(record.student_id);
        await notify({
          recipientId: adviserId,
          type: 'adviser_early_leave',
          title: 'Student left early',
          message: `A student from your section left campus early today (${record.time_out}).`,
          relatedStudentId: record.student_id,
        });
      }
    }

    // 2. Ensure all students in this section have a record for today (default absent if not scanned)
    const [students] = await pool.query(
      `SELECT id FROM users WHERE section_id = ? AND role = 'student'`,
      [sectionId]
    );
    for (const s of students) {
      await pool.query(
        `INSERT IGNORE INTO attendance_logs (student_id, scanned_by, overridden_by, status, scan_date)
         VALUES (?, ?, ?, 'absent', ?)`,
        [s.id, req.user.id, req.user.id, today]
      );
    }

    return res.json({
      success: true,
      message: 'Attendance confirmation completed for this section.',
      confirmedOutsCount: pendingOuts.length,
    });
  } catch (err) {
    console.error('finishSectionConfirmation error:', err);
    return res.status(500).json({ success: false, message: 'Could not finalize attendance confirmation.' });
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

/** POST /api/attendance/excuse-note — Parent submits excuse note for child */
async function submitExcuseNote(req, res) {
  const { studentId, absenceDate, reason, remarks } = req.body;
  if (!studentId || !absenceDate || !reason) {
    return res.status(400).json({ success: false, message: 'Student, date, and reason are required.' });
  }

  try {
    const gate = await canViewStudent(req.user, studentId);
    if (!gate.ok) return res.status(gate.status).json({ success: false, message: gate.message });

    const [stRows] = await pool.query('SELECT section_id FROM users WHERE id = ?', [studentId]);
    const sectionId = stRows[0]?.section_id || null;

    const [result] = await pool.query(
      `INSERT INTO excuse_notes (student_id, parent_id, section_id, absence_date, reason, remarks, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [studentId, req.user.id, sectionId, absenceDate, reason, remarks || null]
    );

    const adviserId = await getAdviserIdForStudent(studentId);
    if (adviserId) {
      await notify({
        recipientId: adviserId,
        type: 'attendance_excused',
        title: 'Excuse Note Submitted',
        message: `A parent has submitted an excuse note for ${absenceDate} (${reason}). Please review.`,
        relatedStudentId: studentId,
      });
    }

    return res.json({
      success: true,
      message: 'Excuse note submitted successfully to the adviser for verification.',
      noteId: result.insertId,
    });
  } catch (err) {
    console.error('submitExcuseNote error:', err);
    return res.status(500).json({ success: false, message: 'Could not submit excuse note.' });
  }
}

/** GET /api/attendance/excuse-notes?studentId=&status= */
async function listExcuseNotes(req, res) {
  try {
    let where = [];
    let params = [];

    if (req.user.role === 'parent') {
      where.push('en.parent_id = ?');
      params.push(req.user.id);
    } else if (req.user.role === 'teacher') {
      // Find sections where teacher is adviser or instructor
      const [secRows] = await pool.query(
        'SELECT id FROM sections WHERE adviser_id = ? UNION SELECT DISTINCT section_id FROM schedules WHERE teacher_id = ?',
        [req.user.id, req.user.id]
      );
      const secIds = secRows.map((s) => s.id);
      if (!secIds.length) {
        return res.json({ success: true, notes: [] });
      }
      where.push(`en.section_id IN (${secIds.map(() => '?').join(',')})`);
      params.push(...secIds);
    }

    if (req.query.studentId) {
      where.push('en.student_id = ?');
      params.push(req.query.studentId);
    }
    if (req.query.status) {
      where.push('en.status = ?');
      params.push(req.query.status);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT en.id, en.student_id, en.parent_id, en.section_id, DATE_FORMAT(en.absence_date, '%Y-%m-%d') AS absence_date,
              en.reason, en.remarks, en.status, en.created_at, en.reviewed_at,
              CONCAT(st.first_name, ' ', st.last_name) AS student_name, st.id_number AS student_lrn,
              CONCAT(p.first_name, ' ', p.last_name) AS parent_name,
              sec.name AS section_name
       FROM excuse_notes en
       JOIN users st ON st.id = en.student_id
       JOIN users p ON p.id = en.parent_id
       LEFT JOIN sections sec ON sec.id = en.section_id
       ${whereClause}
       ORDER BY en.created_at DESC`,
      params
    );

    return res.json({ success: true, notes: rows });
  } catch (err) {
    console.error('listExcuseNotes error:', err);
    return res.status(500).json({ success: false, message: 'Could not load excuse notes.' });
  }
}

/** PATCH /api/attendance/excuse-notes/:id — Teacher/Admin review (approve/reject) */
async function reviewExcuseNote(req, res) {
  const { id } = req.params;
  const { status, reviewRemarks } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be 'approved' or 'rejected'." });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM excuse_notes WHERE id = ?', [id]);
    const note = rows[0];
    if (!note) return res.status(404).json({ success: false, message: 'Excuse note not found.' });

    await pool.query(
      `UPDATE excuse_notes SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
      [status, req.user.id, id]
    );

    const absenceDateStr = getManilaDate(new Date(note.absence_date));

    if (status === 'approved') {
      // Mark or update attendance log as excused
      await pool.query(
        `INSERT INTO attendance_logs (student_id, scan_date, status, confirmed_by, confirmed_at)
         VALUES (?, ?, 'excused', ?, NOW())
         ON DUPLICATE KEY UPDATE status = 'excused', confirmed_by = VALUES(confirmed_by), confirmed_at = NOW()`,
        [note.student_id, absenceDateStr, req.user.id]
      );
    }

    // Notify parent
    await notify({
      recipientId: note.parent_id,
      type: status === 'approved' ? 'attendance_excused' : 'attendance_update',
      title: `Excuse Note ${status === 'approved' ? 'Approved' : 'Declined'}`,
      message: `Your excuse note for ${absenceDateStr} has been ${status} by the school.`,
      relatedStudentId: note.student_id,
    });

    return res.json({ success: true, message: `Excuse note has been ${status}.` });
  } catch (err) {
    console.error('reviewExcuseNote error:', err);
    return res.status(500).json({ success: false, message: 'Could not review excuse note.' });
  }
}

module.exports = {
  getMyQrCode,
  scanAttendance,
  verifyScannerKey,
  getSessionStatus,
  getConfirmationRoster,
  confirmAttendance,
  confirmAttendanceOut,
  finishSectionConfirmation,
  getSummary,
  getHistory,
  submitExcuseNote,
  listExcuseNotes,
  reviewExcuseNote,
};
