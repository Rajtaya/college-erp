const express = require('express');
const router = express.Router();
const db = require('../db');
const { verify } = require('../middleware/auth');

router.use(verify());

const VALID_STATUSES = new Set(['PRESENT', 'ABSENT', 'LATE', 'LEAVE']);

// Helper: verify teacher is assigned to the subject (admin bypasses)
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

// POST / — Mark single attendance (upsert)
router.post('/', verify('teacher', 'admin'), async (req, res) => {
  const { student_id, subject_id, date, status } = req.body;
  if (!VALID_STATUSES.has((status || '').toUpperCase()))
    return res.status(400).json({ error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}` });
  try {
    if (!await assertTeacherOwnsSubject(req, res, subject_id)) return;
    const [result] = await db.query(
      'INSERT INTO attendance (student_id, subject_id, date, status) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)',
      [student_id, subject_id, date, status.toUpperCase()]
    );
    res.json({ message: 'Attendance marked', attendance_id: result.insertId });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /bulk — Mark attendance for a whole class on a date
router.post('/bulk', verify('teacher', 'admin'), async (req, res) => {
  const { subject_id, date, records } = req.body;
  if (!Array.isArray(records) || records.length === 0)
    return res.status(400).json({ error: 'records must be a non-empty array' });
  if (!subject_id || !date)
    return res.status(400).json({ error: 'subject_id and date are required' });
  // Validate all statuses upfront
  const invalid = records.find(r => !VALID_STATUSES.has((r.status || '').toUpperCase()));
  if (invalid)
    return res.status(400).json({ error: `Invalid status "${invalid.status}". Must be one of: ${[...VALID_STATUSES].join(', ')}` });
  try {
    if (!await assertTeacherOwnsSubject(req, res, subject_id)) return;
    const placeholders = records.map(() => '(?,?,?,?)').join(',');
    const values = records.flatMap(({ student_id, status }) =>
      [student_id, subject_id, date, status.toUpperCase()]
    );
    await db.query(
      `INSERT INTO attendance (student_id, subject_id, date, status) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      values
    );
    res.json({ message: `Attendance marked for ${records.length} student(s)` });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /student/:student_id — All attendance for a student
router.get('/student/:student_id', async (req, res) => {
  // Students can only view their own attendance
  if (req.user.role === 'student' && req.user.id !== parseInt(req.params.student_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const [rows] = await db.query(
      `SELECT a.*, s.subject_name, s.subject_code
       FROM attendance a
       JOIN subjects s ON a.subject_id = s.subject_id
       WHERE a.student_id = ?
       ORDER BY a.date DESC`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /student/:student_id/summary — Attendance % per subject
router.get('/student/:student_id/summary', async (req, res) => {
  // Students can only view their own attendance
  if (req.user.role === 'student' && req.user.id !== parseInt(req.params.student_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const [rows] = await db.query(
      `SELECT s.subject_id, s.subject_name, s.subject_code,
              COUNT(*) AS total,
              SUM(a.status = 'PRESENT') AS present,
              SUM(a.status = 'LATE') AS late,
              ROUND(SUM(a.status = 'PRESENT') / COUNT(*) * 100, 1) AS percentage
       FROM attendance a
       JOIN subjects s ON a.subject_id = s.subject_id
       WHERE a.student_id = ?
       GROUP BY s.subject_id`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /subject/:subject_id/date/:date — Class roll for a date
router.get('/subject/:subject_id/date/:date', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.attendance_id, a.student_id, a.status,
              CONCAT(st.first_name, ' ', st.last_name) AS name, st.roll_no
       FROM attendance a
       JOIN students st ON a.student_id = st.student_id
       WHERE a.subject_id = ? AND a.date = ?
       ORDER BY st.roll_no`,
      [req.params.subject_id, req.params.date]
    );
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /student/:student_id/detailed — Attendance summary using view (includes LEAVE + defaulter status)
router.get('/student/:student_id/detailed', async (req, res) => {
  // Students can only view their own attendance
  if (req.user.role === 'student' && req.user.id !== parseInt(req.params.student_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const { semester, academic_year_id } = req.query;
    let query = 'SELECT * FROM vw_student_attendance_summary WHERE student_id = ?';
    const params = [req.params.student_id];
    if (semester)         { query += ' AND semester = ?';          params.push(semester); }
    if (academic_year_id) { query += ' AND academic_year_id = ?';  params.push(academic_year_id); }
    query += ' ORDER BY subject_name';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /defaulters — Students with attendance < 75% (admin/teacher only)
router.get('/defaulters', verify('teacher', 'admin'), async (req, res) => {
  try {
    const { semester, academic_year_id } = req.query;
    let query = 'SELECT * FROM vw_defaulter_list WHERE 1=1';
    const params = [];
    if (semester)         { query += ' AND semester = ?';          params.push(semester); }
    if (academic_year_id) { query += ' AND academic_year_id = ?';  params.push(academic_year_id); }
    query += ' ORDER BY attendance_percentage ASC';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /:attendance_id — Update attendance status
router.put('/:attendance_id', verify('teacher', 'admin'), async (req, res) => {
  const { status } = req.body;
  try {
    const [result] = await db.query(
      'UPDATE attendance SET status = ? WHERE attendance_id = ?',
      [status, req.params.attendance_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    res.json({ message: 'Attendance updated' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:attendance_id — Delete an attendance record
router.delete('/:attendance_id', verify('teacher', 'admin'), async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM attendance WHERE attendance_id = ?',
      [req.params.attendance_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    res.json({ message: 'Attendance deleted' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
