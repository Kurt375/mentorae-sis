const pool = require('../config/db');

/** GET /api/settings — all key/value settings */
async function getSettings(req, res) {
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM system_settings');
    const settings = {};
    rows.forEach((r) => (settings[r.setting_key] = r.setting_value));
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

  try {
    const entries = Object.entries(settings);
    for (const [key, value] of entries) {
      await pool.query(
        `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, String(value)]
      );
    }
    return res.json({ success: true, message: 'Settings saved.' });
  } catch (err) {
    console.error('updateSettings error:', err);
    return res.status(500).json({ success: false, message: 'Could not save settings.' });
  }
}

module.exports = { getSettings, updateSettings };
