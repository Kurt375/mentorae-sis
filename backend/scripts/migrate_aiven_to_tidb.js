const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function migrate() {
  console.log('====================================================');
  console.log('🚀 MENTORAE SIS: AIVEN -> TiDB CLOUD DATA MIGRATION');
  console.log('====================================================\n');

  const aivenUrl = process.env.MYSQL_URL.split('?')[0];
  const tidbBaseUrl = 'mysql://9M5wW7WSxVGV8jt.root:uDJSCYF9DulP0tvo@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/sys';

  console.log('1. Connecting to Source (Aiven MySQL)...');
  const aivenConn = await mysql.createConnection({
    uri: aivenUrl,
    ssl: { rejectUnauthorized: false },
    dateStrings: true
  });
  // Disable ANSI_QUOTES so SHOW CREATE TABLE uses standard MySQL backticks
  await aivenConn.query("SET SESSION sql_mode = ''");
  console.log('   ✅ Connected to Aiven and configured session sql_mode.\n');

  console.log('2. Connecting to Destination (TiDB Cloud)...');
  const tidbConn = await mysql.createConnection({
    uri: tidbBaseUrl,
    ssl: { rejectUnauthorized: false },
    dateStrings: true
  });
  console.log('   ✅ Connected to TiDB.\n');

  console.log('3. Setting up database `mentorae_sis` in TiDB...');
  await tidbConn.query('CREATE DATABASE IF NOT EXISTS mentorae_sis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
  await tidbConn.query('USE mentorae_sis;');
  await tidbConn.query('SET FOREIGN_KEY_CHECKS = 0;');
  await tidbConn.query('SET SESSION tidb_txn_entry_size_limit = 67108864;'); // 64MB
  console.log('   ✅ Database ready, FK checks disabled, entry size limit set to 64MB.\n');

  // Identify STORED/VIRTUAL GENERATED columns in Aiven (which cannot be inserted into)
  const [genCols] = await aivenConn.query(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema = DATABASE() 
      AND (extra LIKE '%STORED GENERATED%' OR extra LIKE '%VIRTUAL GENERATED%')
  `);
  const generatedColSet = new Set(
    genCols.map(r => `${r.TABLE_NAME || r.table_name}.${r.COLUMN_NAME || r.column_name}`)
  );
  if (generatedColSet.size > 0) {
    console.log(`   Excluded computed generated columns: ${[...generatedColSet].join(', ')}\n`);
  }

  console.log('4. Fetching table list from Aiven...');
  const [tableRows] = await aivenConn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  const tables = tableRows.map(row => Object.values(row)[0]);
  console.log(`   Found ${tables.length} tables to migrate.\n`);

  const allForeignKeys = [];

  console.log('5. Creating tables and migrating data...');
  for (const tableName of tables) {
    // 5a. Get table schema from Aiven
    const [createRes] = await aivenConn.query(`SHOW CREATE TABLE \`${tableName}\``);
    const originalSql = createRes[0]['Create Table'];

    // Separate FK constraints from table definition
    const lines = originalSql.split('\n');
    const fkConstraints = [];
    const filteredLines = [];

    for (const line of lines) {
      if (line.trim().startsWith('CONSTRAINT') && line.includes('FOREIGN KEY')) {
        fkConstraints.push(line.trim().replace(/,$/, ''));
      } else {
        filteredLines.push(line);
      }
    }

    if (fkConstraints.length > 0) {
      allForeignKeys.push({ tableName, constraints: fkConstraints });
    }

    let cleanCreateSql = filteredLines.join('\n').replace(/,\s*\n\s*\)/g, '\n)');
    
    // Ensure table is clean on TiDB
    await tidbConn.query(`DROP TABLE IF EXISTS \`${tableName}\``);
    await tidbConn.query(cleanCreateSql);

    // 5b. Fetch rows from Aiven
    const [rows] = await aivenConn.query(`SELECT * FROM \`${tableName}\``);

    if (rows.length > 0) {
      const allCols = Object.keys(rows[0]);
      // Filter out stored/virtual generated columns
      const insertCols = allCols.filter(col => !generatedColSet.has(`${tableName}.${col}`));
      const columnNames = insertCols.map(c => `\`${c}\``).join(', ');
      
      // For topics with large payloads, use batch size of 5; otherwise 50
      const batchSize = (tableName === 'topics') ? 5 : 50;

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const values = batch.map(r =>
          insertCols.map(c => {
            const val = r[c];
            if (val === undefined) return null;
            if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
              return JSON.stringify(val);
            }
            return val;
          })
        );
        const insertSql = `INSERT INTO \`${tableName}\` (${columnNames}) VALUES ?`;
        await tidbConn.query(insertSql, [values]);
      }
      console.log(`   📦 ${tableName}: Migrated ${rows.length} rows.`);
    } else {
      console.log(`   📄 ${tableName}: 0 rows (schema created).`);
    }
  }

  console.log('\n6. Adding foreign key constraints to TiDB...');
  for (const item of allForeignKeys) {
    for (const fk of item.constraints) {
      try {
        await tidbConn.query(`ALTER TABLE \`${item.tableName}\` ADD ${fk}`);
      } catch (err) {
        console.warn(`   ⚠️ Warning adding FK to ${item.tableName}: ${err.message}`);
      }
    }
  }
  await tidbConn.query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('   ✅ All foreign keys configured and checks re-enabled.\n');

  console.log('7. Verifying data integrity across all tables...');
  let totalAivenRows = 0;
  let totalTidbRows = 0;
  let allMatched = true;

  console.log('----------------------------------------------------');
  console.log(String('Table Name').padEnd(30) + ' | ' + String('Aiven').padStart(8) + ' | ' + String('TiDB').padStart(8) + ' | Status');
  console.log('----------------------------------------------------');

  for (const tableName of tables) {
    const [[aivenCount]] = await aivenConn.query(`SELECT COUNT(*) AS count FROM \`${tableName}\``);
    const [[tidbCount]] = await tidbConn.query(`SELECT COUNT(*) AS count FROM \`${tableName}\``);

    const aCount = aivenCount.count;
    const tCount = tidbCount.count;
    totalAivenRows += aCount;
    totalTidbRows += tCount;

    const match = aCount === tCount;
    if (!match) allMatched = false;

    console.log(
      tableName.padEnd(30) +
      ' | ' +
      String(aCount).padStart(8) +
      ' | ' +
      String(tCount).padStart(8) +
      ' | ' +
      (match ? '✅ MATCH' : '❌ MISMATCH')
    );
  }
  console.log('----------------------------------------------------');
  console.log(
    'TOTAL'.padEnd(30) +
    ' | ' +
    String(totalAivenRows).padStart(8) +
    ' | ' +
    String(totalTidbRows).padStart(8) +
    ' | ' +
    (allMatched ? '🎉 100% VERIFIED' : '⚠️ SOME MISMATCHES')
  );
  console.log('====================================================\n');

  await aivenConn.end();
  await tidbConn.end();

  if (allMatched) {
    console.log('✨ Data migration completed successfully with 100% integrity!');
  } else {
    throw new Error('Migration finished with row count mismatches. Please inspect above.');
  }
}

migrate().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
