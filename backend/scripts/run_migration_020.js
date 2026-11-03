const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

async function run() {
  console.log('Running Migration 020 (Performance Indexes)...');
  const sql = fs.readFileSync(path.join(__dirname, '../db/migrations/020_performance_indexes.sql'), 'utf8');
  // Strip all comments first, then split by ';'
  const cleanSql = sql.replace(/--.*$/gm, '');
  const statements = cleanSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.toLowerCase().startsWith('use '));

  for (const stmt of statements) {
    if (!stmt) continue;
    try {
      console.log(`Executing: ${stmt.replace(/\s+/g, ' ').substring(0, 70)}...`);
      await pool.query(stmt);
      console.log('  -> Success');
    } catch (err) {
      console.warn(`  -> Note/Warning: ${err.message}`);
    }
  }

  console.log('Verifying indexes on attendance_logs and users...');
  const [attIdx] = await pool.query('SHOW INDEX FROM attendance_logs');
  const attNames = [...new Set(attIdx.map(r => r.Key_name))];
  console.log('attendance_logs indexes:', attNames.join(', '));

  const [userIdx] = await pool.query('SHOW INDEX FROM users');
  const userNames = [...new Set(userIdx.map(r => r.Key_name))];
  console.log('users indexes:', userNames.join(', '));

  process.exit(0);
}

// Give time for initial pool probe
setTimeout(() => {
  run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}, 1500);
