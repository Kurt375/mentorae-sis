const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

// DB_SSL=true (or a MYSQL_URL containing ssl-mode=REQUIRED) enables SSL,
// which Aiven (and most managed MySQL hosts) require. Set DB_SSL=false or
// leave it unset for a local/unencrypted MySQL server.
const wantsSsl =
  process.env.DB_SSL === 'true' ||
  (process.env.MYSQL_URL || '').includes('ssl-mode=REQUIRED');

const sslOption = wantsSsl ? { rejectUnauthorized: false } : undefined;

if (process.env.MYSQL_URL) {
  // Strip any ssl-mode query param since mysql2 doesn't parse it itself;
  // we pass SSL explicitly via the ssl option below instead.
  const cleanUrl = process.env.MYSQL_URL.split('?')[0];
  pool = mysql.createPool({
    uri: cleanUrl,
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: sslOption,
  });
} else {
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
    ssl: sslOption,
  });
}

module.exports = pool;
