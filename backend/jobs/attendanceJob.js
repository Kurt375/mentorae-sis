const pool = require('../config/db');
const { getManilaDate, getManilaTime, getManilaDayOfWeek } = require('../utils/dateUtils');
const { getParentIdsForStudent, getAdviserIdsForStudent } = require('../utils/authz');
const { notify, notifyMany } = require('../utils/notifications');

let lastRunDate = null;
let isJobRunning = false;

/**
 * Checks for unscanned students once 7:00 AM has arrived on school days (Monday–Friday).
 * Inserts an initial 'absent' log for any student who has not scanned by 7:00 AM,
 * and notifies their parents, section adviser(s), and the student.
 * 
 * If a student subsequently arrives and scans after 7:00 AM, scanAttendance detects
 * this initial log, treats it as a time-in, and sets their status to 'late'.
 * 
 * @param {boolean} [force=false] Force execution regardless of current time/day (for testing).
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
      // 1. Skip on weekends
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

      // 4. Check database persistent record to survive server restarts
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

    let unscannedCount = 0;

    for (const st of students) {
      // Check if student already has an attendance log for today
      const [existing] = await pool.query(
        'SELECT id, status, scan_time FROM attendance_logs WHERE student_id = ? AND scan_date = ?',
        [st.id, today]
      );

      if (!existing.length) {
        unscannedCount++;
        // Insert auto-marked absent record with NULL scan_time
        await pool.query(
          `INSERT INTO attendance_logs (student_id, status, scan_date)
           VALUES (?, 'absent', ?)`,
          [st.id, today]
        );

        const studentFullName = `${st.first_name} ${st.middle_initial ? st.middle_initial + ' ' : ''}${st.last_name}`.trim();
        const sectionLabel = st.section_name ? ` (${st.section_name})` : '';

        // 1. Notify Parent(s)
        const parentIds = await getParentIdsForStudent(st.id);
        if (parentIds.length > 0) {
          await notifyMany(parentIds, {
            type: 'attendance_late_alert',
            title: '7:00 AM Attendance Alert',
            message: `${studentFullName} has not scanned in as of 7:00 AM (past on-time cutoff). Scans after 7:00 AM will be marked late.`,
            relatedStudentId: st.id,
          });
        }

        // 2. Notify Student
        await notify({
          recipientId: st.id,
          type: 'attendance_late_alert',
          title: '7:00 AM Attendance Reminder',
          message: 'The 7:00 AM on-time cutoff has passed. Please scan your QR code immediately upon arrival at school.',
          relatedStudentId: st.id,
        });

        // 3. Notify Section Adviser(s)
        const adviserIds = await getAdviserIdsForStudent(st.id);
        if (adviserIds.length > 0) {
          await notifyMany(adviserIds, {
            type: 'attendance_late_alert',
            title: '7:00 AM Unscanned Alert',
            message: `${studentFullName}${sectionLabel} has not scanned in as of 7:00 AM.`,
            relatedStudentId: st.id,
          });
        }
      }
    }

    // Persist today's execution date to system_settings
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ('attendance_7am_job_last_run', ?)
       ON DUPLICATE KEY UPDATE setting_value = ?`,
      [today, today]
    );
    lastRunDate = today;

    console.log(`[ATTENDANCE JOB] 7:00 AM cutoff check completed. Flagged ${unscannedCount} unscanned student(s).`);
    return { success: true, unscannedCount, date: today };
  } catch (err) {
    console.error('[ATTENDANCE JOB] Error in 7:00 AM attendance job:', err);
    return { success: false, error: err.message };
  } finally {
    isJobRunning = false;
  }
}

/**
 * Initializes the background scheduler to run the 7:00 AM attendance check.
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
  startAttendanceScheduler,
};
