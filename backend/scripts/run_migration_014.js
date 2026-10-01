const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, '../db/migrations/014_topic_quiz_attempts.sql'), 'utf8');
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.toLowerCase().startsWith('use '));

  for (const stmt of statements) {
    console.log('Executing statement...');
    await pool.query(stmt);
  }

  const [cols] = await pool.query('DESCRIBE topic_quiz_attempts');
  console.log('topic_quiz_attempts columns:', cols.map(c => `${c.Field} (${c.Type})`).join(', '));
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
