const express = require('express');
const router = express.Router();
const db = require('../db');
const { verify } = require('../middleware/auth');

router.use(verify());

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, l.level_name, p.programme_name, f.faculty_name, d.discipline_name
       FROM subjects s
       LEFT JOIN levels l ON s.level_id = l.level_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id
       LEFT JOIN faculties f ON s.faculty_id = f.faculty_id
       LEFT JOIN disciplines d ON s.discipline_id = d.discipline_id
       ORDER BY l.level_name, f.faculty_name, p.programme_name, s.semester, s.category`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', verify('admin'), async (req, res) => {
  const { subject_code, subject_name, category, semester, credits, internal_marks, level_id, programme_id, faculty_id, discipline_id, discipline_name, is_common } = req.body;
  try {
    let resolved_discipline_id = discipline_id || null;
    if (!resolved_discipline_id && discipline_name) {
      const [existing] = await db.query('SELECT discipline_id FROM disciplines WHERE LOWER(discipline_name) = LOWER(?)', [discipline_name.trim()]);
      if (existing.length) {
        resolved_discipline_id = existing[0].discipline_id;
      } else {
        const [result] = await db.query('INSERT INTO disciplines (discipline_name, faculty_id) VALUES (?, ?)', [discipline_name.trim(), faculty_id||null]);
        resolved_discipline_id = result.insertId;
      }
    }
    const isCommon = ['MDC','MIC','SEC','VAC','AEC'].includes(category);
    const [result] = await db.query(
      `INSERT INTO subjects (subject_code, subject_name, category, semester, credits, internal_marks, level_id, programme_id, faculty_id, discipline_id, is_common)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [subject_code, subject_name, category, semester, credits, internal_marks||0, level_id||null, isCommon?null:(programme_id||null), faculty_id||null, resolved_discipline_id, isCommon?true:false]
    );
    res.json({ message: 'Subject added', subject_id: result.insertId });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// GET /teacher/:teacher_id — all assignments for a teacher (with section + programme info)
router.get('/teacher/:teacher_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.subject_id, s.subject_code, s.subject_name, s.category, s.semester, 
              s.credits, s.internal_marks, s.level_id, s.faculty_id, s.discipline_id, s.is_common,
              l.level_name, f.faculty_name, d.discipline_name,
              st.id as assignment_id, st.section, st.programme_id, st.class_name,
              p.programme_name
       FROM subject_teachers st
       JOIN subjects s ON st.subject_id = s.subject_id
       LEFT JOIN levels l ON s.level_id = l.level_id
       LEFT JOIN programmes p ON st.programme_id = p.programme_id
       LEFT JOIN faculties f ON s.faculty_id = f.faculty_id
       LEFT JOIN disciplines d ON s.discipline_id = d.discipline_id
       WHERE st.teacher_id = ?
       ORDER BY s.semester, s.subject_code, st.section`,
      [req.params.teacher_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// GET /all-teachers — all subject-teacher assignments in one query
router.get('/all-teachers', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT st.subject_id, t.teacher_id, CONCAT(t.first_name, ' ', t.last_name) AS name, t.email,
              st.id as assignment_id, st.section, st.programme_id, st.class_name,
              p.programme_name
       FROM subject_teachers st
       JOIN teachers t ON st.teacher_id = t.teacher_id
       LEFT JOIN programmes p ON st.programme_id = p.programme_id
       ORDER BY st.subject_id, t.first_name, st.section`
    );
    // Group by subject_id
    const grouped = {};
    rows.forEach(r => {
      if (!grouped[r.subject_id]) grouped[r.subject_id] = [];
      grouped[r.subject_id].push(r);
    });
    res.json(grouped);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// GET /:subject_id/teachers — all teachers for a subject with their sections
router.get('/:subject_id/teachers', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT t.teacher_id, CONCAT(t.first_name, ' ', t.last_name) AS name, t.email,
              st.id as assignment_id, st.section, st.programme_id, st.class_name,
              p.programme_name
       FROM subject_teachers st
       JOIN teachers t ON st.teacher_id = t.teacher_id
       LEFT JOIN programmes p ON st.programme_id = p.programme_id
       WHERE st.subject_id = ?
       ORDER BY t.first_name, st.section`,
      [req.params.subject_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// POST /:subject_id/teachers — assign teacher to subject with section + programme
router.post('/:subject_id/teachers', verify('teacher', 'admin'), async (req, res) => {
  const { teacher_id, section = 'A', programme_id = null, class_name = null } = req.body;
  try {
    await db.query(
      `INSERT INTO subject_teachers (subject_id, teacher_id, section, programme_id, class_name) 
       VALUES (?,?,?,?,?) 
       ON DUPLICATE KEY UPDATE class_name=VALUES(class_name)`,
      [req.params.subject_id, teacher_id, section, programme_id, class_name]
    );
    res.json({ message: 'Teacher assigned to section' });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// PUT /assignments/:assignment_id — edit an existing subject-teacher assignment
router.put('/assignments/:assignment_id', verify('teacher', 'admin'), async (req, res) => {
  const { section, programme_id, class_name } = req.body;
  try {
    await db.query(
      'UPDATE subject_teachers SET section = ?, programme_id = ?, class_name = ? WHERE id = ?',
      [section || 'A', programme_id || null, class_name || null, req.params.assignment_id]
    );
    res.json({ message: 'Assignment updated' });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE /:subject_id/teachers/:teacher_id — remove specific assignment
router.delete('/:subject_id/teachers/:teacher_id', verify('teacher', 'admin'), async (req, res) => {
  const { section, programme_id } = req.query;
  try {
    let query = 'DELETE FROM subject_teachers WHERE subject_id = ? AND teacher_id = ?';
    const params = [req.params.subject_id, req.params.teacher_id];
    if (section) { query += ' AND section = ?'; params.push(section); }
    if (programme_id) { query += ' AND programme_id = ?'; params.push(programme_id); }
    await db.query(query, params);
    res.json({ message: 'Assignment removed' });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE by assignment_id — remove specific row
router.delete('/assignments/:assignment_id', verify('teacher', 'admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM subject_teachers WHERE id = ?', [req.params.assignment_id]);
    res.json({ message: 'Assignment removed' });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, l.level_name, p.programme_name, f.faculty_name, d.discipline_name
       FROM subjects s
       LEFT JOIN levels l ON s.level_id = l.level_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id
       LEFT JOIN faculties f ON s.faculty_id = f.faculty_id
       LEFT JOIN disciplines d ON s.discipline_id = d.discipline_id
       WHERE s.subject_id = ?`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Subject not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
