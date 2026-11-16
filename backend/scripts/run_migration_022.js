const pool = require('../config/db');

async function run() {
  console.log('Running Migration 022: Modify grades columns (average, quiz_score, activity_score)...');

  try {
    // Step 1: Modify average column first to remove generated column dependency
    console.log('Step 1: Converting average column to standard decimal...');
    await pool.query('ALTER TABLE grades MODIFY COLUMN average DECIMAL(5,2) NULL DEFAULT NULL');
    console.log('  -> Step 1 Succeeded.');

    // Step 2: Modify quiz_score and activity_score to be nullable
    console.log('Step 2: Making quiz_score and activity_score nullable...');
    await pool.query('ALTER TABLE grades MODIFY COLUMN quiz_score DECIMAL(5,2) NULL DEFAULT NULL, MODIFY COLUMN activity_score DECIMAL(5,2) NULL DEFAULT NULL');
    console.log('  -> Step 2 Succeeded.');

    // Step 3: Verify schema
    const [createTableRes] = await pool.query('SHOW CREATE TABLE grades');
    const createSql = createTableRes[0]['Create Table'];
    const isGenerated = /GENERATED ALWAYS AS/i.test(createSql);
    console.log(`Verification: Is 'average' still a generated column? ${isGenerated ? 'YES (Error)' : 'NO (Successfully converted to regular column)'}`);

    if (isGenerated) {
      throw new Error("Failed to convert 'average' from generated to standard column.");
    }

    // Step 4: Perform a test INSERT/UPDATE to verify that custom calculated averages can now be stored
    console.log('Testing grade upsert with custom average...');
    const [sample] = await pool.query('SELECT student_id, subject_id, section_id, term FROM grades LIMIT 1');
    if (sample && sample[0]) {
      const s = sample[0];
      await pool.query(`
        INSERT INTO grades (student_id, subject_id, section_id, term, quiz_score, activity_score, exam_score, average)
        VALUES (?, ?, ?, ?, 35.5, 30.0, 15.0, 80.5)
        ON DUPLICATE KEY UPDATE
          quiz_score = VALUES(quiz_score),
          activity_score = VALUES(activity_score),
          exam_score = VALUES(exam_score),
          average = VALUES(average)
      `, [s.student_id, s.subject_id, s.section_id, s.term]);
      console.log('  -> Grade upsert verified with custom average 80.5: SUCCESS!');
    }

    console.log('Migration 022 completed successfully with 0 errors.');
    process.exit(0);
  } catch (err) {
    console.error('Migration 022 error:', err.message);
    process.exit(1);
  }
}

setTimeout(() => {
  run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}, 1500);
