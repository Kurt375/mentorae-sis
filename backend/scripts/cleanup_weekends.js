const pool = require('../config/db');

async function cleanupWeekendRecords() {
  console.log('[CLEANUP] Starting weekend attendance and schedule purge...');
  try {
    // 1. Delete weekend attendance logs (1 = Sunday, 7 = Saturday in MySQL DAYOFWEEK)
    const [attResult] = await pool.query(
      'DELETE FROM attendance_logs WHERE DAYOFWEEK(scan_date) IN (1, 7)'
    );
    console.log(`[CLEANUP] Deleted ${attResult.affectedRows || 0} weekend attendance_logs record(s).`);

    // 2. Delete weekend excuse notes
    const [excResult] = await pool.query(
      'DELETE FROM excuse_notes WHERE DAYOFWEEK(absence_date) IN (1, 7)'
    );
    console.log(`[CLEANUP] Deleted ${excResult.affectedRows || 0} weekend excuse_notes record(s).`);

    // 3. Delete weekend schedules
    const [schedResult] = await pool.query(
      "DELETE FROM schedules WHERE day_of_week IN ('Saturday', 'Sunday')"
    );
    console.log(`[CLEANUP] Deleted ${schedResult.affectedRows || 0} weekend schedules record(s).`);

    return {
      success: true,
      deletedAttendance: attResult.affectedRows || 0,
      deletedExcuseNotes: excResult.affectedRows || 0,
      deletedSchedules: schedResult.affectedRows || 0,
    };
  } catch (err) {
    console.error('[CLEANUP] Error purging weekend records:', err);
    throw err;
  }
}

if (require.main === module) {
  cleanupWeekendRecords()
    .then((res) => {
      console.log('[CLEANUP] Successfully completed:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[CLEANUP] Failed:', err);
      process.exit(1);
    });
}

module.exports = { cleanupWeekendRecords };

