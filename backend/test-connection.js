// Quick standalone test: confirms Node.js can actually reach your Aiven
// database using the credentials in your .env file.
//
// Run with:  node test-connection.js

require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  console.log('Connecting to:', process.env.MYSQL_URL ? process.env.MYSQL_URL.replace(/:[^:@]+@/, ':****@') : '(no MYSQL_URL set)');

  try {
    const cleanUrl = process.env.MYSQL_URL.split('?')[0];
    const conn = await mysql.createConnection({
      uri: cleanUrl,
      ssl: { rejectUnauthorized: false },
    });

    const [rows] = await conn.query('SELECT COUNT(*) AS user_count FROM users');
    console.log('✅ Connected successfully!');
    console.log('   users table row count:', rows[0].user_count);

    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }
}

main();
