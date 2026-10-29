const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { parsePagination, paginatedMeta } = require('../utils/pagination');
const { teacherTeachesSection, canViewStudent, getParentIdsForStudent, getAdviserIdForStudent, getAdviserIdsForStudent } = require('../utils/authz');
const { notify, notifyMany } = require('../utils/notifications');
const { sendAttendanceEmail, sendGeneralNotificationEmail } = require('../utils/mailer');

function formatUserFullName(user) {
  if (!user) return 'Teacher';
  const mi = user.middle_initial ? ` ${user.middle_initial}` : '';
  return `${user.first_name || ''}${mi} ${user.last_name || ''}`.trim() || user.username || 'Teacher';
}
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
    lateCutoff: map.attendance_late_cutoff || '07:00:00',
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

    const isFirstTimeIn = !existing[0] || (existing[0].status === 'absent' && !existing[0].scan_time);

    if (isFirstTimeIn) {
      // First scan today = time in
      const status = timeToMinutes(scanTime) > timeToMinutes(lateCutoff) ? 'late' : 'present';
      if (existing[0]) {
        await pool.query(
          'UPDATE attendance_logs SET scanned_by = ?, status = ?, scan_time = ? WHERE id = ?',
          [req.user?.id || null, status, scanTime, existing[0].id]
        );
      } else {
        await pool.query(
          'INSERT INTO attendance_logs (student_id, scanned_by, status, scan_date, scan_time) VALUES (?, ?, ?, ?, ?)',
          [student.id, req.user?.id || null, status, scanDate, scanTime]
        );
      }
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

  // Check if this teacher is the official section adviser or co-adviser
  const [[sec]] = await pool.query('SELECT adviser_id, co_adviser_id FROM sections WHERE id = ?', [sectionId]);
  const isAdviser = Boolean(sec && (sec.adviser_id === teacherId || sec.co_adviser_id === teacherId));

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
    const [[sec]] = await pool.query('SELECT adviser_id, co_adviser_id FROM sections WHERE id = ?', [sectionId]);
    const isAdviser = Boolean(sec && (sec.adviser_id === req.user.id || sec.co_adviser_id === req.user.id));

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
  const { studentId, studentIds, status, sectionId, subjectId } = req.body;
  const validStatuses = ['present', 'late', 'absent', 'excused'];

  const ids = Array.isArray(studentIds) && studentIds.length > 0
    ? studentIds.map(Number).filter(Boolean)
    : (studentId ? [Number(studentId)].filter(Boolean) : []);

  if (ids.length === 0 || !status || !validStatuses.includes(status) || !sectionId) {
    return res.status(400).json({ success: false, message: 'Valid studentId(s), status, and sectionId are required.' });
  }

  try {
    // Re-check session lock server-side — never trust the client's banner alone
    const session = await checkSessionLock(req.user.id, sectionId, subjectId || null);
    if (!session.isAllowed) {
      return res.status(403).json({ success: false, message: session.reason });
    }

    const today = getManilaDate();
    const now = getManilaTime();

    for (const sId of ids) {
      const [existing] = await pool.query('SELECT id, status FROM attendance_logs WHERE student_id = ? AND scan_date = ?', [
        sId,
        today,
      ]);

      const isStatusChanged = !existing[0] || existing[0].status !== status;

      if (existing[0]) {
        await pool.query(
          'UPDATE attendance_logs SET status = ?, overridden_by = ?, scan_time = COALESCE(scan_time, ?) WHERE id = ?',
          [status, req.user.id, now, existing[0].id]
        );
      } else {
        await pool.query(
          'INSERT INTO attendance_logs (student_id, scanned_by, overridden_by, status, scan_date, scan_time) VALUES (?, ?, ?, ?, ?, ?)',
          [sId, req.user.id, req.user.id, status, today, status === 'absent' ? null : now]
        );
      }

      await logActivity(sId, `Attendance manually set to "${status}" by a teacher.`);

      // Notification dispatch — fires if status actually changed or is newly set
      if (isStatusChanged && ['present', 'late', 'excused', 'absent'].includes(status)) {
        const [[studentRow]] = await pool.query(
          'SELECT first_name, last_name FROM users WHERE id = ?',
          [sId]
        );
        const studentName = studentRow ? `${studentRow.first_name} ${studentRow.last_name}`.trim() : 'Student';
        const notifType = status === 'present' ? 'attendance_arrived' : status === 'late' ? 'attendance_late' : status === 'excused' ? 'attendance_excused' : 'attendance_absent';
        
        const parentLabel = status === 'present' 
          ? 'arrived at school on time (Present)' 
          : status === 'late' 
          ? 'arrived late (Late-Present)' 
          : status === 'excused' 
          ? 'been marked excused' 
          : 'been marked absent';

        const studentLabel = status === 'present'
          ? 'Present (on time)'
          : status === 'late'
          ? 'Late'
          : status === 'excused'
          ? 'Excused'
          : 'Absent';

        // 1. Notify Parent(s)
        const parentIds = await getParentIdsForStudent(sId);
        if (parentIds.length > 0) {
          await notifyMany(parentIds, {
            type: notifType,
            title: 'Attendance update',
            message: `Your child has ${parentLabel}, confirmed by their teacher.`,
            relatedStudentId: sId,
          });
        }

        // 2. Notify Student
        await notify({
          recipientId: sId,
          type: notifType,
          title: 'Attendance update',
          message: `Your attendance for today has been confirmed as ${studentLabel} by your teacher.`,
          relatedStudentId: sId,
        });

        // 3. Notify Section Adviser(s) (exclude confirming teacher)
        const adviserIds = await getAdviserIdsForStudent(sId);
        const otherAdviserIds = adviserIds.filter((advId) => advId !== req.user.id);
        if (otherAdviserIds.length > 0) {
          await notifyMany(otherAdviserIds, {
            type: notifType,
            title: 'Class attendance update',
            message: `${studentName} has been confirmed as ${status.toUpperCase()} for today.`,
            relatedStudentId: sId,
          });
        }

        // 4. Dispatch Email Notification to Student & Linked Parents in background
        (async () => {
          try {
            await sendAttendanceEmail({
              studentId: sId,
              status,
              date: date || new Date().toISOString().slice(0, 10),
              time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              remarks: `Confirmed by Teacher ${formatUserFullName(req.user)}`,
            });
          } catch (e) {
            console.error('Background confirmAttendance email error:', e.message);
          }
        })();
      }
    }

    return res.json({ success: true, count: ids.length, message: `Attendance updated to ${status} for ${ids.length} student(s).` });
  } catch (err) {
    console.error('confirmAttendance error:', err);
    return res.status(500).json({ success: false, message: 'Could not update attendance.' });
  }
}

/**
 * POST /api/attendance/confirm-out  { studentId, studentIds, sectionId }
 * Teacher verifies a student's time-out scan for today. Notifies the
 * parent(s) (out / excused), and if the student left early (excused),
 * also notifies the section adviser.
 */
async function confirmAttendanceOut(req, res) {
  const { studentId, studentIds, sectionId } = req.body;
  const ids = Array.isArray(studentIds) && studentIds.length > 0
    ? studentIds.map(Number).filter(Boolean)
    : (studentId ? [Number(studentId)].filter(Boolean) : []);

  if (ids.length === 0 || !sectionId) {
    return res.status(400).json({ success: false, message: 'Valid studentId(s) and sectionId are required.' });
  }

  try {
    if (req.user.role === 'teacher') {
      const teaches = await teacherTeachesSection(req.user.id, sectionId);
      if (!teaches) {
        return res.status(403).json({ success: false, message: 'You do not teach this section.' });
      }
    }

    const today = getManilaDate();
    let confirmedCount = 0;

    for (const sId of ids) {
      const [rows] = await pool.query(
        'SELECT * FROM attendance_logs WHERE student_id = ? AND scan_date = ?',
        [sId, today]
      );
      const record = rows[0];
      if (!record || !record.time_out || record.confirmed_at || record.confirmed_by) {
        continue;
      }

      await pool.query('UPDATE attendance_logs SET confirmed_by = ?, confirmed_at = NOW() WHERE id = ?', [
        req.user.id,
        record.id,
      ]);
      await logActivity(sId, `Time-out scan (${record.time_out_status}) confirmed by a teacher.`);

      confirmedCount++;
      const isEarly = record.time_out_status === 'excused';
      const [[studentRow]] = await pool.query(
        'SELECT first_name, last_name FROM users WHERE id = ?',
        [sId]
      );
      const studentName = studentRow ? `${studentRow.first_name} ${studentRow.last_name}`.trim() : 'Student';

      // 1. Notify Parent(s)
      const parentIds = await getParentIdsForStudent(sId);
      if (parentIds.length > 0) {
        await notifyMany(parentIds, {
          type: isEarly ? 'attendance_excused' : 'attendance_out',
          title: 'Check-out confirmed',
          message: isEarly
            ? 'Your child left campus early today (before dismissal), confirmed by their teacher.'
            : 'Your child has checked out for the day, confirmed by their teacher.',
          relatedStudentId: sId,
        });
      }

      // 2. Notify Student
      await notify({
        recipientId: sId,
        type: isEarly ? 'attendance_excused' : 'attendance_out',
        title: 'Check-out confirmed',
        message: isEarly
          ? `Your early check-out (${record.time_out}) has been confirmed by your teacher.`
          : `Your check-out (${record.time_out}) has been confirmed by your teacher.`,
        relatedStudentId: sId,
      });

      // 3. Notify Section Adviser(s)
      const adviserIds = await getAdviserIdsForStudent(sId);
      const otherAdviserIds = adviserIds.filter((advId) => advId !== req.user.id);
      if (otherAdviserIds.length > 0) {
        await notifyMany(otherAdviserIds, {
          type: isEarly ? 'adviser_early_leave' : 'attendance_out',
          title: isEarly ? 'Student left early' : 'Student checked out',
          message: isEarly
            ? `${studentName} left campus early today (${record.time_out}), confirmed by teacher.`
            : `${studentName} checked out for the day (${record.time_out}), confirmed by teacher.`,
          relatedStudentId: sId,
        });
      }

      // 4. Dispatch Email Notification to Student & Linked Parents in background
      (async () => {
        try {
          await sendAttendanceEmail({
            studentId: sId,
            status: isEarly ? 'early_leave' : 'checked_out',
            date: new Date().toISOString().slice(0, 10),
            time: record.time_out,
            isEarlyOut: isEarly,
            remarks: `Confirmed by Teacher ${formatUserFullName(req.user)}`,
          });
        } catch (e) {
          console.error('Background confirmAttendanceOut email error:', e.message);
        }
      })();
    }

    return res.json({ success: true, count: confirmedCount, message: `Time-out confirmed for ${confirmedCount} student(s).` });
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
      const [[sec]] = await pool.query('SELECT adviser_id, co_adviser_id FROM sections WHERE id = ?', [sectionId]);
      const isAdviser = Boolean(sec && (sec.adviser_id === req.user.id || sec.co_adviser_id === req.user.id));
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

      const isEarly = record.time_out_status === 'excused';
      const [[studentRow]] = await pool.query(
        'SELECT first_name, last_name FROM users WHERE id = ?',
        [record.student_id]
      );
      const studentName = studentRow ? `${studentRow.first_name} ${studentRow.last_name}`.trim() : 'Student';

      // 1. Notify Parent(s)
      const parentIds = await getParentIdsForStudent(record.student_id);
      if (parentIds.length > 0) {
        await notifyMany(parentIds, {
          type: isEarly ? 'attendance_excused' : 'attendance_out',
          title: 'Check-out confirmed',
          message: isEarly
            ? 'Your child left campus early today (before dismissal), confirmed by their teacher.'
            : 'Your child has checked out for the day, confirmed by their teacher.',
          relatedStudentId: record.student_id,
        });
      }

      // 2. Notify Student
      await notify({
        recipientId: record.student_id,
        type: isEarly ? 'attendance_excused' : 'attendance_out',
        title: 'Check-out confirmed',
        message: isEarly
          ? `Your early check-out (${record.time_out}) has been confirmed by your teacher.`
          : `Your check-out (${record.time_out}) has been confirmed by your teacher.`,
        relatedStudentId: record.student_id,
      });

      // 3. Notify Section Adviser(s)
      const adviserIds = await getAdviserIdsForStudent(record.student_id);
      const otherAdviserIds = adviserIds.filter((advId) => advId !== req.user.id);
      if (otherAdviserIds.length > 0) {
        await notifyMany(otherAdviserIds, {
          type: isEarly ? 'adviser_early_leave' : 'attendance_out',
          title: isEarly ? 'Student left early' : 'Student checked out',
          message: isEarly
            ? `${studentName} left campus early today (${record.time_out}), confirmed by teacher.`
            : `${studentName} checked out for the day (${record.time_out}), confirmed by teacher.`,
          relatedStudentId: record.student_id,
        });
      }

      // 4. Dispatch Email Notification to Student & Linked Parents in background
      (async () => {
        try {
          await sendAttendanceEmail({
            studentId: record.student_id,
            status: isEarly ? 'early_leave' : 'checked_out',
            date: new Date().toISOString().slice(0, 10),
            time: record.time_out,
            isEarlyOut: isEarly,
            remarks: `Confirmed by Teacher ${formatUserFullName(req.user)}`,
          });
        } catch (e) {
          console.error('Background batchOut email error:', e.message);
        }
      })();
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

/**
 * GET /api/attendance/section-daily-history?sectionId=&date=
 * Returns the attendance log records for a section on a given date (defaults to today in Manila),
 * with aggregated summary statistics (present, late, excused, absent, attendance rate).
 */
async function getSectionDailyHistory(req, res) {
  const { sectionId, date } = req.query;
  if (!sectionId) {
    return res.status(400).json({ success: false, message: 'sectionId is required.' });
  }

  try {
    if (req.user.role === 'teacher') {
      const [[sec]] = await pool.query('SELECT adviser_id, co_adviser_id FROM sections WHERE id = ?', [sectionId]);
      const isAdviser = Boolean(sec && (sec.adviser_id === req.user.id || sec.co_adviser_id === req.user.id));
      const teaches = await teacherTeachesSection(req.user.id, sectionId);
      if (!teaches && !isAdviser) {
        return res.status(403).json({ success: false, message: 'You do not teach or advise this section.' });
      }
    }

    const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getManilaDate();

    const [rows] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name,
              st.code AS strandCode, sec.grade_level, sec.name AS sectionName,
              a.status, a.scan_time, a.time_out, a.time_out_status, a.confirmed_at,
              COALESCE(u_conf.first_name, u_over.first_name) AS verifier_first_name,
              COALESCE(u_conf.last_name, u_over.last_name) AS verifier_last_name
       FROM users u
       JOIN sections sec ON sec.id = u.section_id
       JOIN strands st ON st.id = sec.strand_id
       LEFT JOIN attendance_logs a ON a.student_id = u.id AND a.scan_date = ?
       LEFT JOIN users u_conf ON u_conf.id = a.confirmed_by
       LEFT JOIN users u_over ON u_over.id = a.overridden_by
       WHERE u.role = 'student' AND u.section_id = ?
       ORDER BY u.last_name`,
      [targetDate, sectionId]
    );

    let presentCount = 0;
    let lateCount = 0;
    let excusedCount = 0;
    let absentCount = 0;

    const records = rows.map((r) => {
      const status = r.status || 'absent';
      if (status === 'present') presentCount++;
      else if (status === 'late') lateCount++;
      else if (status === 'excused') excusedCount++;
      else absentCount++;

      const verifier = r.verifier_first_name
        ? `${r.verifier_first_name} ${r.verifier_last_name}`
        : null;

      return {
        id: r.id,
        idNumber: r.id_number,
        name: `${r.first_name} ${r.middle_initial ? r.middle_initial + ' ' : ''}${r.last_name}`,
        strand: `Grade${r.grade_level}-${r.strandCode}`,
        section: r.sectionName,
        scanDate: targetDate,
        timeIn: r.scan_time,
        timeOut: r.time_out,
        timeOutStatus: r.time_out_status,
        status,
        timeOutConfirmed: Boolean(r.confirmed_at),
        verifier,
      };
    });

    const totalStudents = records.length;
    const attended = presentCount + lateCount;
    const rate = totalStudents ? Math.round((attended / totalStudents) * 100) : 0;

    return res.json({
      success: true,
      date: targetDate,
      records,
      stats: {
        totalStudents,
        presentCount,
        lateCount,
        excusedCount,
        absentCount,
        rate,
      },
    });
  } catch (err) {
    console.error('getSectionDailyHistory error:', err);
    return res.status(500).json({ success: false, message: 'Could not load section daily history.' });
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
    const totalDays = Number(totals.totalDays) || 0;
    const presentDays = Number(totals.presentDays) || 0;
    const rate = totalDays ? Math.round((presentDays / totalDays) * 100) : 0;

    // Monthly Trends: aggregate attendance by month (up to last 3 months)
    const [monthlyRows] = await pool.query(
      `SELECT 
         DATE_FORMAT(scan_date, '%Y-%m') AS monthKey,
         DATE_FORMAT(scan_date, '%M %Y') AS monthLabel,
         COUNT(*) AS totalDays,
         SUM(status IN ('present','late')) AS presentDays
       FROM attendance_logs
       WHERE student_id = ?
       GROUP BY monthKey, monthLabel
       ORDER BY monthKey DESC
       LIMIT 3`,
      [studentId.id]
    );

    const monthlyTrends = monthlyRows.map((r) => {
      const mTotal = Number(r.totalDays) || 0;
      const mPresent = Number(r.presentDays) || 0;
      const mRate = mTotal ? Math.round((mPresent / mTotal) * 100) : 0;
      return {
        monthKey: r.monthKey,
        monthLabel: r.monthLabel,
        totalDays: mTotal,
        presentDays: mPresent,
        rate: mRate,
      };
    });

    // Consecutive Present Days Streak (ordered by most recent scan_date DESC)
    const [recentLogs] = await pool.query(
      `SELECT scan_date, status
       FROM attendance_logs
       WHERE student_id = ?
       ORDER BY scan_date DESC, scan_time DESC
       LIMIT 60`,
      [studentId.id]
    );

    let streak = 0;
    for (const log of recentLogs) {
      if (log.status === 'present' || log.status === 'late') {
        streak++;
      } else {
        break;
      }
    }

    return res.json({
      success: true,
      totalDays,
      presentDays,
      rate,
      monthlyTrends,
      streak,
    });
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

  // Extract uploaded proof document/image if present
  let proofFileName = null;
  let proofFileType = null;
  let proofFileSize = null;
  let proofFileData = null;

  if (req.file) {
    proofFileName = req.file.originalname;
    proofFileType = req.file.mimetype;
    proofFileSize = req.file.size;
    proofFileData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  } else if (req.body.proofFileData && req.body.proofFileName) {
    proofFileName = req.body.proofFileName;
    proofFileType = req.body.proofFileType || 'application/octet-stream';
    proofFileSize = req.body.proofFileSize || 0;
    proofFileData = req.body.proofFileData;
  }

  // File format and size validation (Allow PDF, DOC/DOCX, Images; Block PPT and heavy storage files)
  if (proofFileName) {
    const ext = (proofFileName || '').toLowerCase().slice((proofFileName || '').lastIndexOf('.'));
    const disallowedExts = new Set(['.ppt', '.pptx', '.xls', '.xlsx', '.zip', '.rar', '.7z', '.tar', '.mp4', '.avi', '.mov', '.mp3', '.exe', '.bat']);
    const allowedExts = new Set(['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp']);
    const allowedMimes = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]);

    if (disallowedExts.has(ext) || (!allowedExts.has(ext) && !allowedMimes.has(proofFileType))) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported file format. Only PDF, Word documents (.doc/.docx), and images (.jpg/.png/.webp) are accepted. Presentations (PPT) and heavy files are not permitted.'
      });
    }

    if (proofFileSize && proofFileSize > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds maximum limit of 5MB.'
      });
    }
  }

  try {
    const gate = await canViewStudent(req.user, studentId);
    if (!gate.ok) return res.status(gate.status).json({ success: false, message: gate.message });

    const [stRows] = await pool.query('SELECT section_id FROM users WHERE id = ?', [studentId]);
    const sectionId = stRows[0]?.section_id || null;

    // Deduplication check: if a pending excuse note already exists for this student & absence date, update it
    const [existing] = await pool.query(
      'SELECT id FROM excuse_notes WHERE student_id = ? AND absence_date = ? AND status = \'pending\' LIMIT 1',
      [studentId, absenceDate]
    );

    if (existing.length > 0) {
      const updateFields = ['reason = ?', 'remarks = ?', 'section_id = ?'];
      const updateParams = [reason, remarks || null, sectionId];
      if (proofFileData) {
        updateFields.push('proof_file_name = ?', 'proof_file_type = ?', 'proof_file_size = ?', 'proof_file_data = ?');
        updateParams.push(proofFileName, proofFileType, proofFileSize, proofFileData);
      }
      updateParams.push(existing[0].id);
      await pool.query(
        `UPDATE excuse_notes SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      );
      return res.json({
        success: true,
        message: 'Excuse note updated (duplicate submission prevented).',
        noteId: existing[0].id,
      });
    }

    const [result] = await pool.query(
      `INSERT INTO excuse_notes (student_id, parent_id, section_id, absence_date, reason, remarks, status, proof_file_name, proof_file_type, proof_file_size, proof_file_data)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [studentId, req.user.id, sectionId, absenceDate, reason, remarks || null, proofFileName, proofFileType, proofFileSize, proofFileData]
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

/** GET /api/attendance/excuse-notes?studentId=&status=&sectionId= */
async function listExcuseNotes(req, res) {
  try {
    let where = [];
    let params = [];

    if (req.user.role === 'parent') {
      where.push('(en.parent_id = ? OR en.student_id IN (SELECT student_id FROM parent_student_links WHERE parent_id = ?))');
      params.push(req.user.id, req.user.id);
    } else if (req.user.role === 'student') {
      where.push('en.student_id = ?');
      params.push(req.user.id);
    } else if (req.user.role === 'teacher') {
      // Find sections where teacher is adviser, co-adviser, or instructor
      const [secRows] = await pool.query(
        'SELECT id FROM sections WHERE adviser_id = ? OR co_adviser_id = ? UNION SELECT DISTINCT section_id FROM schedules WHERE teacher_id = ?',
        [req.user.id, req.user.id, req.user.id]
      );
      const secIds = secRows.map((s) => s.id);
      if (!secIds.length) {
        return res.json({ success: true, notes: [], summary: { total: 0, pending: 0, approved: 0, rejected: 0 } });
      }
      where.push(`(en.section_id IN (${secIds.map(() => '?').join(',')}) OR st.section_id IN (${secIds.map(() => '?').join(',')}))`);
      params.push(...secIds, ...secIds);
    }

    if (req.query.studentId) {
      where.push('en.student_id = ?');
      params.push(req.query.studentId);
    }
    if (req.query.sectionId) {
      where.push('(en.section_id = ? OR st.section_id = ?)');
      params.push(req.query.sectionId, req.query.sectionId);
    }
    if (req.query.status && req.query.status !== 'all') {
      where.push('en.status = ?');
      params.push(req.query.status);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT en.id, en.student_id, en.parent_id, 
              COALESCE(en.section_id, st.section_id) AS section_id,
              DATE_FORMAT(en.absence_date, '%Y-%m-%d') AS absence_date,
              en.reason, en.remarks, en.status, en.created_at, en.reviewed_at,
              COALESCE(en.review_remarks, '') AS review_remarks,
              en.proof_file_name, en.proof_file_type, en.proof_file_size,
              CASE WHEN en.proof_file_data IS NOT NULL AND en.proof_file_data != '' THEN 1 ELSE 0 END AS has_proof,
              CONCAT(st.first_name, ' ', st.last_name) AS student_name, 
              st.id_number AS student_lrn,
              sec.grade_level,
              CONCAT(p.first_name, ' ', p.last_name) AS parent_name,
              p.contact_number AS parent_contact,
              p.email AS parent_email,
              sec.name AS section_name,
              sec.grade_level AS section_grade,
              CONCAT(rev.first_name, ' ', rev.last_name) AS reviewer_name,
              sec.adviser_id
       FROM excuse_notes en
       JOIN users st ON st.id = en.student_id
       LEFT JOIN users p ON p.id = en.parent_id
       LEFT JOIN sections sec ON sec.id = COALESCE(en.section_id, st.section_id)
       LEFT JOIN users rev ON rev.id = en.reviewed_by
       ${whereClause}
       ORDER BY CASE WHEN en.status = 'pending' THEN 0 ELSE 1 END, en.created_at DESC`,
      params
    );

    const pendingCount = rows.filter((r) => r.status === 'pending').length;
    const approvedCount = rows.filter((r) => r.status === 'approved').length;
    const rejectedCount = rows.filter((r) => r.status === 'rejected').length;

    return res.json({
      success: true,
      notes: rows,
      summary: {
        total: rows.length,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
    });
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
      `UPDATE excuse_notes 
       SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_remarks = ?
       WHERE id = ?`,
      [status, req.user.id, reviewRemarks || null, id]
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

    // Get reviewer name
    const [revUser] = await pool.query('SELECT first_name, last_name FROM users WHERE id = ?', [req.user.id]);
    const reviewerName = revUser[0] ? `${revUser[0].first_name} ${revUser[0].last_name}` : 'The class adviser';

    // Notify parent
    const remarksNote = reviewRemarks ? ` Remarks: "${reviewRemarks}"` : '';
    await notify({
      recipientId: note.parent_id,
      type: status === 'approved' ? 'attendance_excused' : 'attendance_update',
      title: `Excuse Note ${status === 'approved' ? 'Approved & Certified' : 'Declined'}`,
      message: `Your excuse note for ${absenceDateStr} has been ${status === 'approved' ? 'approved & certified' : 'declined'} by ${reviewerName}.${remarksNote}`,
      relatedStudentId: note.student_id,
    });

    (async () => {
      try {
        await sendGeneralNotificationEmail({
          recipientId: note.parent_id,
          title: `Excuse Note ${status === 'approved' ? 'Approved & Certified' : 'Declined'}`,
          message: `Your excuse note for ${absenceDateStr} has been ${status === 'approved' ? 'approved & certified' : 'declined'} by ${reviewerName}.${remarksNote}`,
          type: 'attendance_excused',
        });
      } catch (e) {
        console.error('Background excuse review email error:', e.message);
      }
    })();

    return res.json({ 
      success: true, 
      message: `Excuse note has been ${status === 'approved' ? 'approved & certified' : 'declined'}.` 
    });
  } catch (err) {
    console.error('reviewExcuseNote error:', err);
    return res.status(500).json({ success: false, message: 'Could not review excuse note.' });
  }
}

/** GET /api/attendance/excuse-notes/:id/proof — View/download proof file attached to excuse note */
async function getExcuseNoteProof(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT en.id, en.student_id, en.parent_id, en.proof_file_name, en.proof_file_type, en.proof_file_size, en.proof_file_data,
              COALESCE(en.section_id, st.section_id) AS section_id
       FROM excuse_notes en
       JOIN users st ON st.id = en.student_id
       WHERE en.id = ?`,
      [id]
    );
    const note = rows[0];
    if (!note) {
      return res.status(404).json({ success: false, message: 'Excuse note not found.' });
    }

    // Access authorization check
    if (req.user.role === 'student' && note.student_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You do not have access to view this proof.' });
    }
    if (req.user.role === 'parent') {
      if (note.parent_id !== req.user.id) {
        const [links] = await pool.query('SELECT 1 FROM parent_student_links WHERE parent_id = ? AND student_id = ?', [req.user.id, note.student_id]);
        if (!links.length) {
          return res.status(403).json({ success: false, message: 'You do not have access to view this proof.' });
        }
      }
    }
    if (req.user.role === 'teacher') {
      const [secRows] = await pool.query(
        'SELECT id FROM sections WHERE adviser_id = ? OR co_adviser_id = ? UNION SELECT DISTINCT section_id FROM schedules WHERE teacher_id = ?',
        [req.user.id, req.user.id, req.user.id]
      );
      const allowedSecIds = secRows.map(s => s.id);
      if (!allowedSecIds.includes(note.section_id)) {
        return res.status(403).json({ success: false, message: 'You do not have access to view this proof.' });
      }
    }

    if (!note.proof_file_data) {
      return res.status(404).json({ success: false, message: 'No proof document or image was attached to this excuse note.' });
    }

    const matches = note.proof_file_data.match(/^data:([A-Za-z0-9\-+\/.]+);base64,(.+)$/);
    if (!matches) {
      return res.status(500).json({ success: false, message: 'Invalid proof file format in database.' });
    }

    const mimeType = matches[1] || note.proof_file_type || 'application/octet-stream';
    const buffer = Buffer.from(matches[2], 'base64');
    const isDownload = req.query.download === '1' || mimeType.includes('word') || mimeType.includes('document');
    const disposition = isDownload ? 'attachment' : 'inline';
    const filename = note.proof_file_name || 'proof-file';

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : buffer.length - 1;

      if (start >= buffer.length || end >= buffer.length || start > end) {
        res.setHeader('Content-Range', `bytes */${buffer.length}`);
        return res.status(416).send('Requested range not satisfiable');
      }

      const chunksize = (end - start) + 1;
      const chunk = buffer.subarray(start, end + 1);

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(filename)}"`
      });
      return res.end(chunk);
    } else {
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(filename)}"`);
      return res.send(buffer);
    }
  } catch (err) {
    console.error('getExcuseNoteProof error:', err);
    return res.status(500).json({ success: false, message: 'Could not load proof file.' });
  }
}


/**
 * GET /api/attendance/teacher-pending-summary
 * Returns counts of unconfirmed attendance items and pending excuse notes for the logged-in teacher.
 */
async function getTeacherPendingSummary(req, res) {
  try {
    const teacherId = req.user.id;
    const today = getManilaDate();

    // 1. Find all section IDs that this teacher advises or teaches
    let sectionIds = [];
    if (req.user.role === 'admin') {
      const [allSecs] = await pool.query('SELECT id FROM sections');
      sectionIds = allSecs.map((s) => s.id);
    } else {
      const [secs] = await pool.query(
        `SELECT DISTINCT sec.id
         FROM sections sec
         LEFT JOIN schedules sch ON sch.section_id = sec.id AND sch.teacher_id = ?
         WHERE (sec.adviser_id = ? OR sec.co_adviser_id = ?) OR sch.teacher_id = ?`,
        [teacherId, teacherId, teacherId, teacherId]
      );
      sectionIds = secs.map((s) => s.id);
    }

    if (!sectionIds.length) {
      return res.json({
        success: true,
        pendingCount: 0,
        pendingInsCount: 0,
        pendingOutsCount: 0,
        pendingExcuseCount: 0,
        latestActivityTimestamp: 0,
        serverTime: Date.now(),
        scanDate: today,
      });
    }

    // 2. Query today's attendance logs for students in these sections
    const [rows] = await pool.query(
      `SELECT a.id, a.student_id, a.scan_time, a.time_out, a.status, a.time_out_status,
              a.confirmed_by, a.confirmed_at, a.overridden_by,
              UNIX_TIMESTAMP(COALESCE(a.updated_at, a.created_at)) * 1000 AS activity_time
       FROM users u
       JOIN attendance_logs a ON a.student_id = u.id AND a.scan_date = ?
       WHERE u.role = 'student' AND u.section_id IN (?)`,
      [today, sectionIds]
    );

    let pendingInsCount = 0;
    let pendingOutsCount = 0;
    let latestActivityTimestamp = 0;

    for (const r of rows) {
      const needsIn = Boolean(r.scan_time && !r.confirmed_by && !r.overridden_by);
      const needsOut = Boolean(r.time_out && !r.confirmed_at && !r.confirmed_by);

      if (needsIn) pendingInsCount++;
      if (needsOut) pendingOutsCount++;

      if (needsIn || needsOut) {
        const actTime = Number(r.activity_time) || 0;
        if (actTime > latestActivityTimestamp) {
          latestActivityTimestamp = actTime;
        }
      }
    }

    // 3. Query pending excuse notes for students in these sections
    const [pendingExcuseRows] = await pool.query(
      `SELECT en.id, UNIX_TIMESTAMP(en.created_at) * 1000 AS created_time
       FROM excuse_notes en
       JOIN users st ON st.id = en.student_id
       WHERE en.status = 'pending' AND (en.section_id IN (?) OR st.section_id IN (?))`,
      [sectionIds, sectionIds]
    );

    const pendingExcuseCount = pendingExcuseRows.length;
    for (const er of pendingExcuseRows) {
      const cTime = Number(er.created_time) || 0;
      if (cTime > latestActivityTimestamp) {
        latestActivityTimestamp = cTime;
      }
    }

    const pendingCount = pendingInsCount + pendingOutsCount + pendingExcuseCount;

    return res.json({
      success: true,
      pendingCount,
      pendingInsCount,
      pendingOutsCount,
      pendingExcuseCount,
      latestActivityTimestamp,
      serverTime: Date.now(),
      scanDate: today,
    });
  } catch (err) {
    console.error('getTeacherPendingSummary error:', err);
    return res.status(500).json({ success: false, message: 'Could not load pending attendance summary.' });
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
  getSectionDailyHistory,
  getTeacherPendingSummary,
  getSummary,
  getHistory,
  submitExcuseNote,
  listExcuseNotes,
  reviewExcuseNote,
  getExcuseNoteProof,
};
