const pool = require('../config/db');

/** GET /api/notifications — the logged-in user's notifications, newest first */
async function listMine(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, type, title, message, related_student_id, is_read, created_at
       FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    const [[{ unread }]] = await pool.query(
      'SELECT COUNT(*) AS unread FROM notifications WHERE recipient_id = ? AND is_read = 0',
      [req.user.id]
    );
    return res.json({ success: true, notifications: rows, unread });
  } catch (err) {
    console.error('listMine (notifications) error:', err);
    return res.status(500).json({ success: false, message: 'Could not load notifications.' });
  }
}

/** PATCH /api/notifications/:id/read */
async function markRead(req, res) {
  try {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    return res.json({ success: true });
  } catch (err) {
    console.error('markRead error:', err);
    return res.status(500).json({ success: false, message: 'Could not update notification.' });
  }
}

/** PATCH /api/notifications/read-all */
async function markAllRead(req, res) {
  try {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE recipient_id = ? AND is_read = 0', [req.user.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('markAllRead error:', err);
    return res.status(500).json({ success: false, message: 'Could not update notifications.' });
  }
}

module.exports = { listMine, markRead, markAllRead };
