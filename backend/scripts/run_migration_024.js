const pool = require('../config/db');

async function run() {
  console.log('Running Migration 024: Safely Drop preferred_language from users...');

  try {
    // 1. Check if column exists in the current database schema
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'users' 
         AND COLUMN_NAME = 'preferred_language'`
    );

    if (cols && cols.length > 0) {
      console.log('Found column "preferred_language" on table "users". Dropping column...');
      await pool.query('ALTER TABLE users DROP COLUMN preferred_language');
      console.log('  -> Column "preferred_language" successfully dropped.');
    } else {
      console.log('  -> Column "preferred_language" does not exist (already dropped or not present).');
    }

    // 2. Verify users table structure
    const [userCols] = await pool.query('DESCRIBE users');
    const hasCol = userCols.some(c => c.Field === 'preferred_language');
    console.log(`Verification: users.preferred_language present? ${hasCol ? 'YES' : 'NO'}`);
    console.log('Migration 024 completed successfully with 0 errors.');
    process.exit(0);
  } catch (err) {
    console.error('Migration 024 error:', err.message);
    process.exit(1);
  }
}

// Allow time for initial database pool selection (cloud vs local fallback)
setTimeout(() => {
  run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}, 1500);
