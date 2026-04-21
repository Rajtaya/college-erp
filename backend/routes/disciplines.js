const express = require('express');
const router = express.Router();
const db = require('../db');
const { verify } = require('../middleware/auth');
const { mapDeleteError } = require('../utils/safeDelete');

router.use(verify());

// Get all disciplines
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.*, f.faculty_name FROM disciplines d
       LEFT JOIN faculties f ON d.faculty_id = f.faculty_id
       ORDER BY f.faculty_name, d.discipline_name`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Get disciplines by faculty
router.get('/faculty/:faculty_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM disciplines WHERE faculty_id = ? ORDER BY discipline_name',
      [req.params.faculty_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Add discipline
router.post('/', verify('admin'), async (req, res) => {
  const { discipline_name, faculty_id, description } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO disciplines (discipline_name, faculty_id, description) VALUES (?, ?, ?)',
      [discipline_name, faculty_id||null, description||'']
    );
    res.json({ message: 'Discipline added', discipline_id: result.insertId });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Delete discipline
router.delete('/:id', verify('admin'), async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM disciplines WHERE discipline_id = ?', [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Discipline not found' });
    res.json({ message: 'Discipline deleted' });
  } catch (err) {
    console.error('DELETE /disciplines/:id error:', err);
    // NOTE: disciplines are referenced by students, teachers, subjects.
    // Cascading would orphan academic records, so we REFUSE the delete and
    // tell the admin to reassign dependents first.
    const mapped = mapDeleteError(err, 'discipline');
    res.status(mapped.status).json(mapped.body);
  }
});
module.exports = router;
