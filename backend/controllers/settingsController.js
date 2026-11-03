const pool = require('../config/db');
const cache = require('../utils/cache');

/** GET /api/settings — all key/value settings */
async function getSettings(req, res) {
  try {
    const cached = cache.get('system_settings');
    if (cached) {
      return res.json({ success: true, settings: cached });
    }

    const [rows] = await pool.query('SELECT setting_key, setting_value FROM system_settings');
    const settings = {};
    rows.forEach((r) => (settings[r.setting_key] = r.setting_value));

    // Cache settings for 5 minutes (invalidated instantly on updateSettings)
    cache.set('system_settings', settings, 300);

    return res.json({ success: true, settings });
  } catch (err) {
    console.error('getSettings error:', err);
    return res.status(500).json({ success: false, message: 'Could not load settings.' });
  }
}

/** PUT /api/settings — bulk update { settings: { key: value, ... } } — matches "Save All" */
async function updateSettings(req, res) {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ success: false, message: 'settings object is required.' });
  }

  if (settings.session_timeout_minutes !== undefined && settings.session_timeout_minutes !== null && settings.session_timeout_minutes !== '') {
    const raw = String(settings.session_timeout_minutes).trim();
    const num = Number(raw);
    if (!/^\d+$/.test(raw) || isNaN(num) || num <= 0) {
      return res.status(400).json({ success: false, message: 'Session timeout must be a positive whole number.' });
    }
  }

  try {
    const entries = Object.entries(settings);
    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, String(value)]
      );
    }
    // Instantly invalidate settings cache
    cache.del('system_settings');
    return res.json({ success: true, message: 'Settings saved.' });
  } catch (err) {
    console.error('updateSettings error:', err);
    return res.status(500).json({ success: false, message: 'Could not save settings.' });
  }
}

module.exports = { getSettings, updateSettings };
