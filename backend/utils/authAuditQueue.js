const pool = require('../config/db');

// In-memory batch buffer for asynchronous login audit log persistence
let auditBuffer = [];
let isFlushing = false;
let flushTimer = null;

const BATCH_SIZE = 25;
const FLUSH_INTERVAL_MS = 2000;

/**
 * Enqueue a login attempt record to be written in a background batch.
 * @param {Object} entry
 * @param {number|null} entry.userId
 * @param {string} entry.idNumber
 * @param {boolean} entry.success
 * @param {string} entry.ipAddress
 */
function enqueueLoginAudit({ userId = null, idNumber = '', success = false, ipAddress = '' }) {
  auditBuffer.push({
    userId: userId || null,
    idNumber: (idNumber || '').toString().slice(0, 50),
    success: success ? 1 : 0,
    ipAddress: (ipAddress || '').toString().slice(0, 45),
  });

  if (auditBuffer.length >= BATCH_SIZE) {
    flushBatch();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushBatch, FLUSH_INTERVAL_MS);
  }
}

/**
 * Flush all currently buffered audit logs in a single batch query.
 */
async function flushBatch() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (auditBuffer.length === 0 || isFlushing) return;

  isFlushing = true;
  const currentBatch = auditBuffer.splice(0, auditBuffer.length);

  try {
    const values = [];
    const placeholders = currentBatch
      .map((item) => {
        values.push(item.userId, item.idNumber, item.success, item.ipAddress);
        return '(?, ?, ?, ?)';
      })
      .join(', ');

    const sql = `INSERT INTO login_audit (user_id, id_number, success, ip_address) VALUES ${placeholders}`;
    await pool.query(sql, values);
  } catch (err) {
    console.warn('⚠️ [authAuditQueue] Batch insert failed, retrying items in smaller chunks:', err.message);
    // On unexpected database error, re-prepend remaining items or drop if over capacity
    if (auditBuffer.length < 500) {
      auditBuffer.unshift(...currentBatch);
    }
  } finally {
    isFlushing = false;
    if (auditBuffer.length > 0 && !flushTimer) {
      flushTimer = setTimeout(flushBatch, FLUSH_INTERVAL_MS);
    }
  }
}

// Ensure flush timer does not block Node process termination in CLI tools
if (flushTimer && flushTimer.unref) {
  flushTimer.unref();
}

module.exports = {
  enqueueLoginAudit,
  flushBatch,
};
