const pool = require('../config/db');
const { getManilaDate, getManilaTime, getManilaDayOfWeek } = require('../utils/dateUtils');
const { sendAttendanceEmail } = require('../utils/mailer');

let lastRunDate = null;
let isJobRunning = false;

/**
 * Checks for unscanned students once 7:00 AM has arrived on school days (Monday–Friday).
 * Uses high-performance bulk operations to insert attendance logs and dispatch notifications
 * in seconds even across large student rosters.
 * 
 * @param {boolean} [force=false] Force execution regardless of current time/day (for testing/admin).
 */
async function runSevenAmAttendanceJob(force = false) {
  if (isJobRunning) {
    return { skipped: true, reason: 'Job is already in progress' };
  }
  isJobRunning = true;

  try {
    const today = getManilaDate();
    const dayOfWeek = getManilaDayOfWeek();
    const nowTime = getManilaTime();

    if (!force) {
      // 1. Skip on weekends (Saturday / Sunday)
      if (dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday') {
        return { skipped: true, reason: `Weekend (${dayOfWeek})` };
      }

      // 2. Only run at or after 7:00 AM
      if (nowTime < '07:00:00') {
        return { skipped: true, reason: `Before 7:00 AM (${nowTime})` };
      }

      // 3. Skip if already executed in memory today
      if (lastRunDate === today) {
        return { skipped: true, reason: 'Already executed today' };
      }

      // 4. Check database persistent record to survive serverless cold starts
      const [rows] = await pool.query(
        "SELECT setting_value FROM system_settings WHERE setting_key = 'attendance_7am_job_last_run'"
      );
      if (rows.length && rows[0].setting_value === today) {
        lastRunDate = today;
        return { skipped: true, reason: 'Already executed today (verified in database)' };
      }
    }

    console.log(`[ATTENDANCE JOB] Executing 7:00 AM cutoff check for ${today} (${dayOfWeek} at ${nowTime})...`);

    // Fetch all active students and their assigned section
    const [students] = await pool.query(
      `SELECT u.id, u.id_number, u.first_name, u.middle_initial, u.last_name, u.section_id,
              s.name AS section_name, s.grade_level
       FROM users u
       LEFT JOIN sections s ON s.id = u.section_id
       WHERE u.role = 'student' AND (u.is_active = 1 OR u.is_active IS NULL)`
    );

    if (!students.length) {
      lastRunDate = today;
      return { success: true, unscannedCount: 0, message: 'No active students found.' };
    }

    // 1. Bulk query of students who already scanned or have logs today
    const [existingLogs] = await pool.query(
      'SELECT student_id FROM attendance_logs WHERE scan_date = ?',
      [today]
    );
    const existingStudentIds = new Set(existingLogs.map((r) => r.student_id));

    // Filter unscanned students
    const unscanned = students.filter((st) => !existingStudentIds.has(st.id));

    if (!unscanned.length) {
      await pool.query(
        `INSERT INTO system_settings (setting_key, setting_value)
         VALUES ('attendance_7am_job_last_run', ?)
         ON DUPLICATE KEY UPDATE setting_value = ?`,
        [today, today]
      );
      lastRunDate = today;
      console.log(`[ATTENDANCE JOB] All ${students.length} students have already checked in or have logs for ${today}.`);
      return { success: true, unscannedCount: 0, date: today };
    }

    const unscannedIds = unscanned.map((st) => st.id);

    // 2. Bulk insert 'absent' logs for all unscanned students in chunks of 100
    const logValues = unscanned.map((st) => [st.id, 'absent', today]);
    for (let i = 0; i < logValues.length; i += 100) {
      const chunk = logValues.slice(i, i + 100);
      await pool.query(
        'INSERT IGNORE INTO attendance_logs (student_id, status, scan_date) VALUES ?',
        [chunk]
      );
    }

    // 3. Bulk fetch parent links for all unscanned students
    const [parentLinks] = await pool.query(
      'SELECT student_id, parent_id FROM parent_student_links WHERE student_id IN (?)',
      [unscannedIds]
    );
    const parentMap = {};
    parentLinks.forEach((r) => {
      if (!parentMap[r.student_id]) parentMap[r.student_id] = [];
      parentMap[r.student_id].push(r.parent_id);
    });

    // 4. Bulk fetch section advisers
    const [adviserRows] = await pool.query(
      `SELECT u.id AS student_id, s.adviser_id, s.co_adviser_id
       FROM users u
       JOIN sections s ON s.id = u.section_id
       WHERE u.id IN (?)`,
      [unscannedIds]
    );
    const adviserMap = {};
    adviserRows.forEach((r) => {
      adviserMap[r.student_id] = [r.adviser_id, r.co_adviser_id].filter(Boolean);
    });

    // 5. Build bulk in-app notifications
    const notifRows = [];
    for (const st of unscanned) {
      const studentFullName = `${st.first_name} ${st.middle_initial ? st.middle_initial + ' ' : ''}${st.last_name}`.trim();
      const sectionLabel = st.section_name ? ` (${st.section_name})` : '';

      // A. Student in-app reminder
      notifRows.push([
        st.id,
        'attendance_late_alert',
        '7:00 AM Attendance Reminder',
        'The 7:00 AM on-time cutoff has passed. Please scan your QR code immediately upon arrival at school.',
        st.id,
      ]);

      // B. Parent in-app alert
      const parents = parentMap[st.id] || [];
      parents.forEach((pId) => {
        notifRows.push([
          pId,
          'attendance_late_alert',
          '7:00 AM Attendance Alert',
          `${studentFullName} has not scanned in as of 7:00 AM (past on-time cutoff). Scans after 7:00 AM will be marked late.`,
          st.id,
        ]);
      });

      // C. Section Adviser in-app alert
      const advisers = adviserMap[st.id] || [];
      advisers.forEach((advId) => {
        notifRows.push([
          advId,
          'attendance_late_alert',
          '7:00 AM Unscanned Alert',
          `${studentFullName}${sectionLabel} has not scanned in as of 7:00 AM.`,
          st.id,
        ]);
      });
    }

    // Insert notifications in chunks of 200
    for (let i = 0; i < notifRows.length; i += 200) {
      const chunk = notifRows.slice(i, i + 200);
      await pool.query(
        'INSERT INTO notifications (recipient_id, type, title, message, related_student_id) VALUES ?',
        [chunk]
      );
    }

    // 6. Asynchronously dispatch background Gmail notifications
    (async () => {
      try {
        for (const st of unscanned) {
          await sendAttendanceEmail({
            studentId: st.id,
            status: 'tardy_warning',
            date: today,
            time: '7:00 AM',
            remarks: '7:00 AM on-time cutoff has passed; subsequent scans will be logged as late-present.',
          });
        }
      } catch (mailErr) {
        console.error('[ATTENDANCE JOB] Background email dispatch error:', mailErr.message);
      }
    })();

    // 7. Persist execution date to system_settings
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('attendance_7am_job_last_run', ?)
       ON DUPLICATE KEY UPDATE setting_value = ?`,
      [today, today]
    );
    lastRunDate = today;

    console.log(`[ATTENDANCE JOB] 7:00 AM cutoff check completed. Flagged ${unscanned.length} unscanned student(s).`);
    return { success: true, unscannedCount: unscanned.length, date: today };
  } catch (err) {
    console.error('[ATTENDANCE JOB] Error in 7:00 AM attendance job:', err);
    return { success: false, error: err.message };
  } finally {
    isJobRunning = false;
  }
}

/**
 * Opportunistic auto-trigger for serverless environments (Vercel).
 * When any authenticated traffic arrives on a weekday at or after 7:00 AM Manila time,
 * checks if today's cutoff job has executed. If not, dispatches it immediately in the background.
 */
function maybeTriggerSevenAmJobOpportunistically() {
  try {
    const dayOfWeek = getManilaDayOfWeek();
    if (dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday') return;
    const nowTime = getManilaTime();
    if (nowTime < '07:00:00') return;
    const today = getManilaDate();
    if (lastRunDate === today) return;

    // Fire non-blocking in background
    runSevenAmAttendanceJob(false).catch((e) => {
      console.error('[ATTENDANCE JOB] Opportunistic run error:', e.message);
    });
  } catch (err) {
    // Non-fatal
  }
}

/**
 * Initializes the background scheduler to run the 7:00 AM attendance check (for long-running servers).
 */
function startAttendanceScheduler() {
  console.log('[ATTENDANCE JOB] Scheduler initialized (checking every 30s for 7:00 AM Manila cutoff)...');
  // Check immediately upon server boot
  runSevenAmAttendanceJob(false).catch((e) => console.error('[ATTENDANCE JOB] Boot check error:', e));

  // Recurring check every 30 seconds
  setInterval(() => {
    runSevenAmAttendanceJob(false).catch((e) => console.error('[ATTENDANCE JOB] Interval check error:', e));
  }, 30000);
}

module.exports = {
  runSevenAmAttendanceJob,
  maybeTriggerSevenAmJobOpportunistically,
  startAttendanceScheduler,
};
