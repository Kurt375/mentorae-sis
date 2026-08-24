const pool = require('../config/db');

/**
 * Write one in-app notification row.
 * @param {object} opts
 * @param {number} opts.recipientId  - users.id of who should see this
 * @param {string} opts.type         - one of the notifications.type ENUM values
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {number|null} [opts.relatedStudentId]
 */
async function notify({ recipientId, type, title, message, relatedStudentId = null }) {
  if (!recipientId) return;
  try {
    await pool.query(
      `INSERT INTO notifications (recipient_id, type, title, message, related_student_id)
       VALUES (?, ?, ?, ?, ?)`,
      [recipientId, type, title, message, relatedStudentId]
    );
  } catch (err) {
    // Notifications are best-effort — never let a failed notification insert
    // fail the request that triggered it (account creation, attendance scan, etc.)
    console.error('notify() failed:', err.message);
  }
}

/** Write the same notification to several recipients at once. */
async function notifyMany(recipientIds, rest) {
  await Promise.all(recipientIds.filter(Boolean).map((recipientId) => notify({ recipientId, ...rest })));
}

module.exports = { notify, notifyMany };
