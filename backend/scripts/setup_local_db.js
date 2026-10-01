const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  console.log('Connecting to local MySQL (127.0.0.1:3306)...');
  
  const rootConn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    multipleStatements: true,
  });

  console.log('Recreating database mentorae_sis...');
  await rootConn.query('DROP DATABASE IF EXISTS mentorae_sis;');
  await rootConn.query('CREATE DATABASE mentorae_sis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
  await rootConn.end();

  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'mentorae_sis',
    multipleStatements: true,
  });

  console.log('Executing db/schema.sql...');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0;');
  const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  await conn.query(schemaSql);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('Schema applied successfully.');

  // Run migrations
  const migrationsDir = path.join(__dirname, '../db/migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      console.log(`Running migration: ${f}...`);
      let migrationSql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
      migrationSql = migrationSql.replace(/USE\s+railway\s*;/gi, 'USE mentorae_sis;');
      try {
        await conn.query(migrationSql);
      } catch (err) {
        console.log(`Notice on ${f}:`, err.message);
      }
    }
  }

  await conn.end();
  console.log('Local database mentorae_sis is ready!');
}

main().catch(err => {
  console.error('Setup failed:', err.message || err);
  process.exit(1);
});
