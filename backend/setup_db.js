require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function runSetup() {
  try {
    const connection = await mysql.createConnection({
      uri: process.env.MYSQL_URL,
      ssl: { rejectUnauthorized: false },
      multipleStatements: true
    });

    console.log('Connected to Aiven MySQL!');

    // Update 'schema.sql' below if your file has a different name
   const sqlPath = path.join(__dirname, 'db', 'schema.sql');
    if (!fs.existsSync(sqlPath)) {
      console.error('Could not find SQL schema file in backend folder!');
      process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    await connection.query(sql);
    console.log('Database tables successfully created in Aiven!');

    await connection.end();
    process.exit(0);
  } catch (err) {
    console.error('Database setup failed:', err);
    process.exit(1);
  }
}

runSetup();