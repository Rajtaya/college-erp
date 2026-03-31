const db = require('../db');

/**
 * Verify that the requesting teacher is assigned to the given subject.
 * Admins bypass the check automatically.
 * Returns true if authorized, false if 403 was sent.
 */
async function assertTeacherOwnsSubject(req, res, subject_id) {
  if (req.user.role === 'admin') return true;
  const [rows] = await db.query(
    'SELECT 1 FROM subject_teachers WHERE subject_id = ? AND teacher_id = ?',
    [subject_id, req.user.id]
  );
  if (!rows.length) {
    res.status(403).json({ error: 'You are not assigned to this subject' });
    return false;
  }
  return true;
}

module.exports = { assertTeacherOwnsSubject };
