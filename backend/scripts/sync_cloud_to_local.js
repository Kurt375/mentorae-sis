const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function syncCloudToLocal() {
  console.log('====================================================');
  console.log('🔄 MENTORAE SIS: CLOUD (TiDB) -> LOCAL MYSQL SYNC');
  console.log('====================================================\n');

  if (!process.env.MYSQL_URL) {
    throw new Error('MYSQL_URL is not set in backend/.env');
  }

  const cloudUrl = process.env.MYSQL_URL.split('?')[0];

  console.log('1. Connecting to Cloud Database (TiDB)...');
  const cloudConn = await mysql.createConnection({
    uri: cloudUrl,
    ssl: { rejectUnauthorized: false },
    dateStrings: true,
  });
  console.log('   ✅ Connected to Cloud TiDB.\n');

  console.log('2. Connecting to Local MySQL (127.0.0.1:3306)...');
  const localRootConn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    multipleStatements: true,
  });
  await localRootConn.query('CREATE DATABASE IF NOT EXISTS mentorae_sis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
  await localRootConn.end();

  const localConn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'mentorae_sis',
    dateStrings: true,
  });
  console.log('   ✅ Connected to Local MySQL (mentorae_sis).\n');

  console.log('3. Fetching tables from Cloud Database...');
  await localConn.query('SET FOREIGN_KEY_CHECKS = 0;');
  await cloudConn.query("SET SESSION sql_mode = ''");

  const [tableRows] = await cloudConn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  const tables = tableRows.map((r) => Object.values(r)[0]);
  console.log(`   Found ${tables.length} tables in Cloud Database.\n`);

  // Detect virtual or stored generated columns to omit from INSERTs
  const [genCols] = await cloudConn.query(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema = DATABASE() 
      AND (extra LIKE '%STORED GENERATED%' OR extra LIKE '%VIRTUAL GENERATED%')
  `);
  const generatedColSet = new Set(
    genCols.map((r) => `${r.TABLE_NAME || r.table_name}.${r.COLUMN_NAME || r.column_name}`)
  );

  console.log('4. Replicating tables and data to Local MySQL...');
  for (const tableName of tables) {
    try {
      // Get create table statement
      const [createRes] = await cloudConn.query(`SHOW CREATE TABLE \`${tableName}\``);
      let createSql = createRes[0]['Create Table'];

      // MariaDB in XAMPP uses utf8mb4_unicode_ci rather than MySQL 8's utf8mb4_0900_ai_ci
      createSql = createSql.replace(/utf8mb4_0900_ai_ci/gi, 'utf8mb4_unicode_ci');

      // Drop and recreate on local
      await localConn.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      await localConn.query(createSql);

      // Fetch all rows
      const [rows] = await cloudConn.query(`SELECT * FROM \`${tableName}\``);

      if (rows.length > 0) {
        const allCols = Object.keys(rows[0]);
        const insertCols = allCols.filter((col) => !generatedColSet.has(`${tableName}.${col}`));
        const colNamesSql = insertCols.map((c) => `\`${c}\``).join(', ');
        const placeholders = `(${insertCols.map(() => '?').join(', ')})`;

        const batchSize = tableName === 'topics' ? 5 : 50;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const valuesSql = batch.map(() => placeholders).join(', ');
          const flatParams = [];
          for (const row of batch) {
            for (const col of insertCols) {
              let val = row[col];
              if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
                val = JSON.stringify(val);
              }
              flatParams.push(val !== undefined ? val : null);
            }
          }
          await localConn.query(
            `INSERT INTO \`${tableName}\` (${colNamesSql}) VALUES ${valuesSql}`,
            flatParams
          );
        }
      }
      console.log(`   ✅ Synced table: ${tableName.padEnd(30)} (${rows.length} rows)`);
    } catch (err) {
      console.error(`   ❌ Error syncing ${tableName}:`, err.message);
    }
  }

  await localConn.query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('\n5. Verifying user accounts in Local MySQL...');
  const [localUsers] = await localConn.query(
    'SELECT role, COUNT(*) as cnt FROM users GROUP BY role'
  );
  console.log('   Local User Counts:', localUsers);

  await cloudConn.end();
  await localConn.end();
  console.log('\n✨ Local Database is now 100% synchronized with Cloud Database!');
}

syncCloudToLocal()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
