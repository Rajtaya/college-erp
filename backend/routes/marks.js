const express = require('express');
const router = require('express').Router();
const db = require('../db');
const { verify } = require('../middleware/auth');

router.use(verify());

// Visibility rules — which exam types are visible to students
const STUDENT_VISIBLE = new Set(['INTERNAL','ASSIGNMENT','PRACTICAL_INTERNAL']);
const VALID_EXAM_TYPES = new Set(['INTERNAL','ASSIGNMENT','PRACTICAL_INTERNAL','EXTERNAL','PRACTICAL_EXTERNAL']);

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

// Validate marks value
function validateMarks(obtained, max) {
  const o = Number(obtained), m = Number(max);
  if (isNaN(o) || isNaN(m)) return 'marks_obtained and max_marks must be numbers';
  if (o < 0 || m <= 0)      return 'marks_obtained must be >= 0 and max_marks must be > 0';
  if (o > m)                return 'marks_obtained cannot exceed max_marks';
  if (m > 1000)             return 'max_marks cannot exceed 1000';
  return null;
}

// POST / — Add/update marks (upsert on student+subject+exam_type)
router.post('/', verify('teacher', 'admin'), async (req, res) => {
  const { student_id, subject_id, exam_type, marks_obtained, max_marks, semester } = req.body;
  if (!VALID_EXAM_TYPES.has(exam_type))
    return res.status(400).json({ error: `Invalid exam_type. Must be one of: ${[...VALID_EXAM_TYPES].join(', ')}` });
  const marksErr = validateMarks(marks_obtained, max_marks);
  if (marksErr) return res.status(400).json({ error: marksErr });
  const is_visible = STUDENT_VISIBLE.has(exam_type) ? 1 : 0;
  try {
    if (!await assertTeacherOwnsSubject(req, res, subject_id)) return;
    const [result] = await db.query(
      `INSERT INTO marks (student_id, subject_id, exam_type, marks_obtained, max_marks, semester, is_visible_to_student)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE marks_obtained=VALUES(marks_obtained), max_marks=VALUES(max_marks)`,
      [student_id, subject_id, exam_type, Number(marks_obtained), Number(max_marks), semester, is_visible]
    );
    res.json({ message: 'Marks saved', mark_id: result.insertId });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /bulk — Bulk save marks for entire class
router.post('/bulk', verify('teacher', 'admin'), async (req, res) => {
  const { entries, subject_id, exam_type, max_marks, semester } = req.body;
  if (!VALID_EXAM_TYPES.has(exam_type))
    return res.status(400).json({ error: `Invalid exam_type. Must be one of: ${[...VALID_EXAM_TYPES].join(', ')}` });
  if (!max_marks || isNaN(Number(max_marks)) || Number(max_marks) <= 0 || Number(max_marks) > 1000)
    return res.status(400).json({ error: 'max_marks must be a number between 1 and 1000' });
  const is_visible = STUDENT_VISIBLE.has(exam_type) ? 1 : 0;
  try {
    if (!await assertTeacherOwnsSubject(req, res, subject_id)) return;
    // Filter out blank entries
    const valid = (entries || []).filter(
      e => e.marks_obtained !== '' && e.marks_obtained != null
    );
    if (valid.length === 0) return res.json({ message: 'No marks to save' });
    // Validate each entry's marks
    for (const e of valid) {
      const err = validateMarks(e.marks_obtained, max_marks);
      if (err) return res.status(400).json({ error: `student_id ${e.student_id}: ${err}` });
    }
    const placeholders = valid.map(() => '(?,?,?,?,?,?,?)').join(',');
    const values = valid.flatMap(e => [
      e.student_id, subject_id, exam_type,
      Number(e.marks_obtained), Number(max_marks), semester, is_visible
    ]);
    await db.query(
      `INSERT INTO marks (student_id, subject_id, exam_type, marks_obtained, max_marks, semester, is_visible_to_student)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE marks_obtained=VALUES(marks_obtained), max_marks=VALUES(max_marks)`,
      values
    );
    res.json({ message: `Marks saved for ${valid.length} student(s)` });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /student/:student_id — Marks visible to student only
router.get('/student/:student_id', async (req, res) => {
  // Students can only view their own marks
  if (req.user.role === 'student' && req.user.id !== parseInt(req.params.student_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const [rows] = await db.query(
      `SELECT m.*, s.subject_name, s.subject_code, s.category, s.credits
       FROM marks m
       JOIN subjects s ON m.subject_id = s.subject_id
       WHERE m.student_id = ? AND m.is_visible_to_student = 1
       ORDER BY s.subject_name, m.exam_type`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /student/:student_id/all — All marks including external (admin/teacher only)
router.get('/student/:student_id/all', verify('teacher', 'admin'), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT m.*, s.subject_name, s.subject_code, s.category, s.credits
       FROM marks m
       JOIN subjects s ON m.subject_id = s.subject_id
       WHERE m.student_id = ?
       ORDER BY s.subject_name, m.exam_type`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /student/:student_id/summary — Marks summary per subject
router.get('/student/:student_id/summary', async (req, res) => {
  // Students can only view their own marks
  if (req.user.role === 'student' && req.user.id !== parseInt(req.params.student_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const [rows] = await db.query(
      `SELECT s.subject_id, s.subject_name, s.subject_code,
              SUM(m.marks_obtained) AS total_obtained,
              SUM(m.max_marks) AS total_max,
              ROUND(SUM(m.marks_obtained) / SUM(m.max_marks) * 100, 1) AS percentage
       FROM marks m
       JOIN subjects s ON m.subject_id = s.subject_id
       WHERE m.student_id = ?
       GROUP BY s.subject_id`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /subject/:subject_id — All marks for a subject (admin/teacher view)
router.get('/subject/:subject_id', verify('teacher', 'admin'), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT m.*, CONCAT(st.first_name, ' ', st.last_name) AS name, st.roll_no
       FROM marks m
       JOIN students st ON m.student_id = st.student_id
       WHERE m.subject_id = ?
       ORDER BY st.roll_no, m.exam_type`,
      [req.params.subject_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /student/:student_id/detailed — Marks with percentage + PASS/FAIL per subject
router.get('/student/:student_id/detailed', async (req, res) => {
  // Students can only view their own marks
  if (req.user.role === 'student' && req.user.id !== parseInt(req.params.student_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const { semester, academic_year_id } = req.query;
    let query = 'SELECT * FROM vw_student_marks_summary WHERE student_id = ? AND is_visible_to_student = 1';
    const params = [req.params.student_id];
    if (semester)         { query += ' AND semester = ?';          params.push(semester); }
    if (academic_year_id) { query += ' AND academic_year_id = ?';  params.push(academic_year_id); }
    query += ' ORDER BY subject_name, exam_type';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// PUT /:mark_id — Update marks
router.put('/:mark_id', verify('teacher', 'admin'), async (req, res) => {
  const { marks_obtained, max_marks, exam_type } = req.body;
  try {
    const [result] = await db.query(
      `UPDATE marks SET
         marks_obtained = COALESCE(?, marks_obtained),
         max_marks = COALESCE(?, max_marks),
         exam_type = COALESCE(?, exam_type)
       WHERE mark_id = ?`,
      [marks_obtained, max_marks, exam_type, req.params.mark_id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Mark record not found' });
    res.json({ message: 'Marks updated' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:mark_id — Delete a mark record
router.delete('/:mark_id', verify('teacher', 'admin'), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM marks WHERE mark_id = ?', [req.params.mark_id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Mark record not found' });
    res.json({ message: 'Mark deleted' });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
