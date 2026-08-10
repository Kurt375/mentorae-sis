const pool = require('../config/db');

function classifyType(title) {
  const lower = title.toLowerCase();
  if (lower.includes('exam') || lower.includes('science') || lower.includes('academic')) return 'academic';
  if (lower.includes('seminar') || lower.includes('workshop')) return 'seminar';
  return 'event';
}

/** GET /api/announcements — feed visible to the caller's role, most recent first */
async function listAnnouncements(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, description, event_date, type, audience, created_by, created_at
       FROM announcements
       WHERE audience = 'all' OR audience = ?
       ORDER BY created_at DESC LIMIT 100`,
      [req.user.role]
    );
    return res.json({ success: true, announcements: rows });
  } catch (err) {
    console.error('listAnnouncements error:', err);
    return res.status(500).json({ success: false, message: 'Could not load announcements.' });
  }
}

/** POST /api/announcements  { title, description, eventDate, audience? } — admin only */
async function createAnnouncement(req, res) {
  const { title, description, eventDate, audience } = req.body;
  if (!title || !description || !eventDate) {
    return res.status(400).json({ success: false, message: 'Title, description, and date are required.' });
  }

  try {
    const type = classifyType(title);
    await pool.query(
      'INSERT INTO announcements (title, description, event_date, type, audience, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description, eventDate, type, audience || 'all', req.user.id]
    );
    return res.json({ success: true, message: 'Announcement posted.' });
  } catch (err) {
    console.error('createAnnouncement error:', err);
    return res.status(500).json({ success: false, message: 'Could not post announcement.' });
  }
}

/** POST /api/announcements/delete-batch  { ids: [] } — admin only */
async function deleteBatch(req, res) {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ success: false, message: 'No announcements selected.' });
  }
  try {
    await pool.query('DELETE FROM announcements WHERE id IN (?)', [ids]);
    return res.json({ success: true, message: `Deleted ${ids.length} announcement(s).` });
  } catch (err) {
    console.error('deleteBatch error:', err);
    return res.status(500).json({ success: false, message: 'Could not delete announcements.' });
  }
}

module.exports = { listAnnouncements, createAnnouncement, deleteBatch };
