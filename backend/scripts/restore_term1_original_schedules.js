const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const pool = require('../config/db');
const schedulesController = require('../controllers/schedulesController');

async function restore() {
  console.log('================================================================');
  console.log('  RESTORING ORIGINAL 1ST TERM TEACHER SCHEDULES');
  console.log('================================================================\n');

  const masterPath = path.resolve(__dirname, '../templates/tshs_master_real_schedule.xlsx');
  if (!fs.existsSync(masterPath)) {
    console.error('Master schedule file not found at:', masterPath);
    process.exit(1);
  }

  const workbook = XLSX.readFile(masterPath);
  console.log(`✓ Loaded official master schedule workbook with ${workbook.SheetNames.length} sheets.`);

  // 1. Check current 1st Term schedules
  const [before] = await pool.query("SELECT COUNT(*) AS total FROM schedules WHERE quarter = '1st Term'");
  console.log(`Current 1st Term schedules in DB before restore: ${before[0].total}`);

  // 2. Clear corrupted/overwritten 1st Term schedules
  console.log('Clearing overwritten 1st Term schedules...');
  const [delRes] = await pool.query("DELETE FROM schedules WHERE quarter = '1st Term'");
  console.log(`✓ Cleared ${delRes.affectedRows} schedule records from 1st Term.`);

  // 3. Mock req and res for bulk import
  const mockReq = {
    file: {
      buffer: fs.readFileSync(masterPath),
      originalname: 'tshs_master_real_schedule.xlsx',
    },
    body: {
      overrideExisting: 'true',
      targetTerm: '1st Term',
    },
    overrideExisting: true,
  };

  let responseData = null;
  const mockRes = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  console.log('Importing official 1st Term schedules across all teacher program sheets...');
  await schedulesController.bulkImportSchedules(mockReq, mockRes);

  if (responseData && responseData.success) {
    console.log('\n================================================================');
    console.log('  ✓ 1ST TERM RESTORE COMPLETED SUCCESSFULLY!');
    console.log('================================================================');
    console.log(`Message: ${responseData.message}`);
    console.log(`Total New Scheduled: ${responseData.totalEntriesCreated}`);
    console.log(`Total Sheets: ${responseData.totalSheets}`);
    console.log(`Total Warnings: ${responseData.totalWarnings}`);
  } else {
    console.error('\n✗ Restore encountered an issue:', responseData);
  }

  // 4. Verify in DB
  const [after] = await pool.query("SELECT quarter, COUNT(*) AS count FROM schedules GROUP BY quarter");
  console.log('\nFinal DB Schedule Counts:');
  console.table(after);

  process.exit(0);
}

restore().catch((err) => {
  console.error('Fatal error during restore:', err);
  process.exit(1);
});
