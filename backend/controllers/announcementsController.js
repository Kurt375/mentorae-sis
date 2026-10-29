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
    let query = `SELECT id, title, description, event_date, type, audience, created_by, created_at
                 FROM announcements `;
    const params = [];
    if (req.user.role !== 'admin') {
      query += `WHERE audience = 'all' OR audience = ? `;
      params.push(req.user.role);
    }
    query += `ORDER BY created_at DESC LIMIT 100`;

    const [rows] = await pool.query(query, params);
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
    // Prevent rapid duplicate clicks (within 30 seconds)
    const [recent] = await pool.query(
      `SELECT id FROM announcements 
       WHERE title = ? AND event_date = ? AND created_by = ? 
       AND created_at >= NOW() - INTERVAL 30 SECOND 
       LIMIT 1`,
      [title, eventDate, req.user.id]
    );
    if (recent.length > 0) {
      return res.json({ success: true, message: 'Announcement posted (duplicate submission prevented).' });
    }

    const type = classifyType(title);
    await pool.query(
      'INSERT INTO announcements (title, description, event_date, type, audience, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description, eventDate, type, audience || 'all', req.user.id]
    );

    // Asynchronously dispatch offline announcement emails to users with real emails
    (async () => {
      try {
        const [[setting]] = await pool.query(
          "SELECT setting_value FROM system_settings WHERE setting_key = 'notify_email'"
        );
        if (setting && setting.setting_value === '0') return; // Email notifications toggled off

        let userSql = 'SELECT id, email, personal_email, role FROM users WHERE is_active = 1 ';
        const userParams = [];
        if (audience && audience !== 'all') {
          if (audience === 'student' || audience === 'students') {
            userSql += 'AND (role = "student" OR role = "parent") ';
          } else {
            userSql += 'AND role = ? ';
            userParams.push(audience);
          }
        }
        const [users] = await pool.query(userSql, userParams);

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const validEmails = new Set();
        const targetUserIds = [];
        for (const u of users) {
          targetUserIds.push(u.id);
          if (u.personal_email && emailRegex.test(u.personal_email.trim())) {
            validEmails.add(u.personal_email.trim().toLowerCase());
          } else if (u.email && emailRegex.test(u.email.trim()) && !u.email.endsWith('.tshs.edu.ph') && !u.email.endsWith('.talisay.shs')) {
            validEmails.add(u.email.trim().toLowerCase());
          }
        }

        // Send In-App Notification to all target audience users
        const { notifyMany } = require('../utils/notifications');
        await notifyMany(targetUserIds, {
          type: 'announcement',
          title: `Announcement: ${title}`,
          message: description.length > 120 ? description.slice(0, 117) + '...' : description,
          skipEmail: true,
        });

        if (validEmails.size > 0) {
          const { sendAnnouncementEmail } = require('../utils/mailer');
          await sendAnnouncementEmail(Array.from(validEmails), {
            title,
            description,
            eventDate,
            type,
            audience: audience || 'all',
          });
        }
      } catch (emailErr) {
        console.error('Background announcement email error:', emailErr);
      }
    })();

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
