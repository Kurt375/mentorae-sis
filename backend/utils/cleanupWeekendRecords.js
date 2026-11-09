const pool = require('../config/db');

async function cleanupWeekendRecords() {
  try {
    // 1. Delete weekend attendance logs (1 = Sunday, 7 = Saturday in MySQL DAYOFWEEK)
    const [attResult] = await pool.query(
      'DELETE FROM attendance_logs WHERE DAYOFWEEK(scan_date) IN (1, 7)'
    );

    // 2. Delete weekend excuse notes
    const [excResult] = await pool.query(
      'DELETE FROM excuse_notes WHERE DAYOFWEEK(absence_date) IN (1, 7)'
    );

    // 3. Delete weekend schedules
    const [schedResult] = await pool.query(
      "DELETE FROM schedules WHERE day_of_week IN ('Saturday', 'Sunday')"
    );

    return {
      success: true,
      deletedAttendance: attResult.affectedRows || 0,
      deletedExcuseNotes: excResult.affectedRows || 0,
      deletedSchedules: schedResult.affectedRows || 0,
    };
  } catch (err) {
    console.error('[CLEANUP] Error purging weekend records:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { cleanupWeekendRecords };
