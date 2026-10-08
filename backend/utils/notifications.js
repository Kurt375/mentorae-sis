const pool = require('../config/db');

/**
 * Write one in-app notification row with automatic deduplication.
 * Prevents repeating notifications that confuse users and overload the database.
 * 
 * @param {object} opts
 * @param {number} opts.recipientId  - users.id of who should see this
 * @param {string} opts.type         - notification type (e.g. attendance_late, topic_request, etc.)
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {number|null} [opts.relatedStudentId]
 */
async function notify({ recipientId, type, title, message, relatedStudentId = null }) {
  if (!recipientId || !title || !message) return;
  try {
    const studentIdParam = relatedStudentId !== undefined ? relatedStudentId : null;

    // 1. Attendance & Early-Leave Deduplication (Daily scope)
    // Prevents parents/advisers from getting multiple redundant alerts for the same student on the same day
    const isAttendance = (type && type.startsWith('attendance_')) || type === 'adviser_early_leave';
    if (isAttendance) {
      const [existingDaily] = await pool.query(
        `SELECT id, message, is_read FROM notifications
         WHERE recipient_id = ? 
           AND type = ? 
           AND ((related_student_id IS NULL AND ? IS NULL) OR related_student_id = ?)
           AND DATE(created_at) = CURDATE()
         ORDER BY id DESC LIMIT 1`,
        [recipientId, type, studentIdParam, studentIdParam]
      );

      if (existingDaily && existingDaily.length > 0) {
        const existing = existingDaily[0];
        // If message is identical, skip duplicate entirely
        if (existing.message === message) {
          return;
        }
        // If status/time updated on the same day, update existing row instead of flooding the database
        await pool.query(
          `UPDATE notifications 
           SET title = ?, message = ?, is_read = 0, created_at = NOW() 
           WHERE id = ?`,
          [title, message, existing.id]
        );
        return;
      }
    }

    // 2. Rapid-Fire / Double-Click Deduplication (15-minute window for any notification)
    // Prevents duplicate inserts caused by rapid button clicks, retries, or batch polling
    const [recentIdentical] = await pool.query(
      `SELECT id FROM notifications
       WHERE recipient_id = ? 
         AND type = ? 
         AND title = ? 
         AND message = ?
         AND ((related_student_id IS NULL AND ? IS NULL) OR related_student_id = ?)
         AND created_at >= NOW() - INTERVAL 15 MINUTE
       LIMIT 1`,
      [recipientId, type, title, message, studentIdParam, studentIdParam]
    );

    if (recentIdentical && recentIdentical.length > 0) {
      return;
    }

    // 3. Unread Identical Message Guard
    // If user already has an active UNREAD notification with the exact same message, don't spam another
    const [unreadIdentical] = await pool.query(
      `SELECT id FROM notifications
       WHERE recipient_id = ? 
         AND type = ? 
         AND title = ? 
         AND message = ?
         AND ((related_student_id IS NULL AND ? IS NULL) OR related_student_id = ?)
         AND is_read = 0
       LIMIT 1`,
      [recipientId, type, title, message, studentIdParam, studentIdParam]
    );

    if (unreadIdentical && unreadIdentical.length > 0) {
      return;
    }

    // 4. Safe insert
    await pool.query(
      `INSERT INTO notifications (recipient_id, type, title, message, related_student_id)
       VALUES (?, ?, ?, ?, ?)`,
      [recipientId, type, title, message, studentIdParam]
    );
  } catch (err) {
    // Notifications are best-effort — never let a failed notification insert
    // fail the parent transaction
    console.error('notify() failed:', err.message);
  }
}

/** Write the same notification to several recipients at once with recipient deduplication. */
async function notifyMany(recipientIds, rest) {
  if (!Array.isArray(recipientIds)) return;
  // Deduplicate recipient IDs to avoid sending multiple duplicates to the same user
  const uniqueRecipients = [...new Set(recipientIds.filter(Boolean))];
  await Promise.all(uniqueRecipients.map((recipientId) => notify({ recipientId, ...rest })));
}

module.exports = { notify, notifyMany };
