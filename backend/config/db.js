const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();
const mysql = require('mysql2/promise');

// 1. Configure Cloud Pool (TiDB Cloud Serverless)
let cloudPool = null;
const defaultCloudUrl = 'mysql://9M5wW7WSxVGV8jt.root:uDJSCYF9DulP0tvo@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/mentorae_sis';
const cloudUrl = (process.env.MYSQL_URL || defaultCloudUrl).split('?')[0];

if (cloudUrl) {
  cloudPool = mysql.createPool({
    uri: cloudUrl,
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 4000, // Fast 4-second probe for school firewall detection
    ssl: { rejectUnauthorized: false },
  });

  cloudPool.on('connection', (conn) => {
    conn.query("SET time_zone = '+08:00'", () => {});
  });
}

// 2. Configure Local Pool (Local XAMPP MariaDB / MySQL on port 3306)
const localPool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
  database: process.env.DB_NAME || 'mentorae_sis',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 5000,
  dateStrings: true,
});

localPool.on('connection', (conn) => {
  conn.query("SET time_zone = '+08:00'", () => {});
});

let currentMode = cloudPool ? 'cloud' : 'local';
let activePool = cloudPool || localPool;
let isSwitching = false;

// Fast probe to verify if cloud database port 4000 is reachable
async function probeCloud() {
  if (!cloudPool) return false;
  try {
    const conn = await cloudPool.getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch (err) {
    return false;
  }
}

// Initial connection check on startup
(async () => {
  if (cloudPool) {
    const cloudOk = await probeCloud();
    if (cloudOk) {
      activePool = cloudPool;
      currentMode = 'cloud';
      console.log('🌐 [DATABASE] Cloud Database (TiDB Cloud) is reachable! Prioritizing CLOUD database.');
    } else {
      activePool = localPool;
      currentMode = 'local';
      console.warn('🏠 [DATABASE] Cloud Database unreachable (port 4000 blocked by firewall or offline). Automatically falling back to LOCAL MySQL (127.0.0.1:3306).');
    }
  } else {
    activePool = localPool;
    currentMode = 'local';
    console.log('🏠 [DATABASE] Using LOCAL MySQL database.');
  }
})();

// Periodic background health check (every 30 seconds):
// If currently operating in local mode, automatically switch back to cloud once unblocked!
const healthCheckInterval = setInterval(async () => {
  if (currentMode === 'local' && cloudPool && !isSwitching) {
    const cloudOk = await probeCloud();
    if (cloudOk) {
      isSwitching = true;
      activePool = cloudPool;
      currentMode = 'cloud';
      console.log('🔄 [DATABASE] Cloud Database is now unblocked and accessible! Switched back to prioritizing CLOUD database.');
      isSwitching = false;
    }
  }
}, 30000);

// Prevent this background timer from blocking process exit in CLI scripts
if (healthCheckInterval.unref) {
  healthCheckInterval.unref();
}

// Detect connection/network drop errors (e.g. firewall port block or cable disconnect)
function isNetworkError(err) {
  if (!err) return false;
  const code = err.code || '';
  const msg = err.message || '';
  return (
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EHOSTUNREACH' ||
    code === 'ECONNRESET' ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('Connection lost')
  );
}

// Smart Proxy wrapping activePool with auto-fallback on network drops
const poolProxy = new Proxy({}, {
  get(target, prop) {
    if (prop === 'getCurrentMode') {
      return () => currentMode;
    }
    if (prop === 'getPools') {
      return () => ({ cloud: cloudPool, local: localPool, current: currentMode });
    }

    if (prop === 'query' || prop === 'execute') {
      return async (...args) => {
        try {
          return await activePool[prop](...args);
        } catch (err) {
          if (currentMode === 'cloud' && isNetworkError(err) && localPool) {
            console.warn(`⚠️ [DATABASE] Cloud query failed (${err.code || err.message}). Switching to LOCAL database fallback...`);
            activePool = localPool;
            currentMode = 'local';
            return await activePool[prop](...args);
          }
          throw err;
        }
      };
    }

    if (prop === 'getConnection') {
      return async (...args) => {
        try {
          return await activePool.getConnection(...args);
        } catch (err) {
          if (currentMode === 'cloud' && isNetworkError(err) && localPool) {
            console.warn(`⚠️ [DATABASE] Cloud connection failed (${err.code || err.message}). Switching to LOCAL database fallback...`);
            activePool = localPool;
            currentMode = 'local';
            return await activePool.getConnection(...args);
          }
          throw err;
        }
      };
    }

    const value = activePool[prop];
    return typeof value === 'function' ? value.bind(activePool) : value;
  },
});

module.exports = poolProxy;
