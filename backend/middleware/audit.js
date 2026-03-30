/**
 * Async audit logger — fire-and-forget so it never delays the HTTP response.
 * Logs to the audit_logs table.
 */
const db = require('../db');

/**
 * @param {object} req       - Express request (for actor + IP)
 * @param {string} action    - e.g. 'DELETE_STUDENT', 'RESET_ENROLLMENT'
 * @param {string} table     - target table name
 * @param {number} targetId  - ID of the affected row
 * @param {object} [details] - any extra JSON context
 */
function auditLog(req, action, table, targetId, details = null) {
  const actorId   = req.user?.id   ?? null;
  const actorRole = req.user?.role ?? null;
  const ip        = req.ip ?? req.connection?.remoteAddress ?? null;

  // Fire and forget — never await this
  db.query(
    `INSERT INTO audit_logs (actor_id, actor_role, action, target_table, target_id, details, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [actorId, actorRole, action, table, targetId, details ? JSON.stringify(details) : null, ip]
  ).catch(err => console.error('[audit] write failed:', err.message));
}

module.exports = { auditLog };
