const jwt = require('jsonwebtoken');
const pool = require('../config/db');

let cachedMaintenance = { value: '0', expiresAt: 0 };
async function isMaintenanceMode() {
  const now = Date.now();
  if (cachedMaintenance.expiresAt > now) return cachedMaintenance.value === '1';
  try {
    const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'maintenance_mode'");
    const val = rows[0]?.setting_value || '0';
    cachedMaintenance = { value: val, expiresAt: now + 5000 };
    return val === '1';
  } catch (err) {
    return false;
  }
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const bearerToken = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearerToken || req.cookies?.token || req.query?.token;

  if (!token) {
    return res.status(401).json({ success: false, message: 'You must be logged in to do that.' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'mentorae-sis-jwt-secret-key-2026';
    const payload = jwt.verify(token, secret);
    req.user = payload;

    // Maintenance mode enforcement (Admins exempt)
    if (req.user.role !== 'admin') {
      const maintenance = await isMaintenanceMode();
      if (maintenance) {
        return res.status(503).json({
          success: false,
          maintenance: true,
          message: 'The Mentorae Portal is currently in maintenance mode. Please try again later.'
        });
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Your session has expired. Please log in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'You do not have permission to do that.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
