const pool = require('../config/db');

async function run() {
  console.log('Running Migration 025: Add is_finalized, finalized_at, finalized_by to grades...');

  try {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'grades' 
         AND COLUMN_NAME = 'is_finalized'`
    );

    if (!cols || cols.length === 0) {
      console.log('Adding column "is_finalized" on table "grades"...');
      await pool.query('ALTER TABLE grades ADD COLUMN is_finalized TINYINT(1) NOT NULL DEFAULT 0');
      console.log('  -> Column "is_finalized" successfully added.');
    } else {
      console.log('  -> Column "is_finalized" already exists.');
    }

    const [colsAt] = await pool.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'grades' 
         AND COLUMN_NAME = 'finalized_at'`
    );
    if (!colsAt || colsAt.length === 0) {
      console.log('Adding column "finalized_at" on table "grades"...');
      await pool.query('ALTER TABLE grades ADD COLUMN finalized_at TIMESTAMP NULL DEFAULT NULL');
      console.log('  -> Column "finalized_at" successfully added.');
    } else {
      console.log('  -> Column "finalized_at" already exists.');
    }

    const [colsBy] = await pool.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'grades' 
         AND COLUMN_NAME = 'finalized_by'`
    );
    if (!colsBy || colsBy.length === 0) {
      console.log('Adding column "finalized_by" on table "grades"...');
      await pool.query('ALTER TABLE grades ADD COLUMN finalized_by INT NULL DEFAULT NULL');
      console.log('  -> Column "finalized_by" successfully added.');
    } else {
      console.log('  -> Column "finalized_by" already exists.');
    }

    const [gradeCols] = await pool.query('DESCRIBE grades');
    const hasFinalized = gradeCols.some(c => c.Field === 'is_finalized');
    console.log(`Verification: grades.is_finalized present? ${hasFinalized ? 'YES' : 'NO'}`);
    console.log('Migration 025 completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration 025 error:', err.message);
    process.exit(1);
  }
}

setTimeout(() => {
  run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}, 1500);
