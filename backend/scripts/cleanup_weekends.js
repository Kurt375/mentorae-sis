const { cleanupWeekendRecords } = require('../utils/cleanupWeekendRecords');

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
