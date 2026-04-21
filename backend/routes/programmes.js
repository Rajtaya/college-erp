const express = require('express');
const router = express.Router();
const db = require('../db');
const { verify } = require('../middleware/auth');
const { mapDeleteError } = require('../utils/safeDelete');

router.use(verify());

// Get all programmes with level and faculty names
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, l.level_name, f.faculty_name 
       FROM programmes p 
       JOIN levels l ON p.level_id = l.level_id
       LEFT JOIN faculties f ON p.faculty_id = f.faculty_id
       ORDER BY l.level_name, f.faculty_name, p.programme_name`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Get programmes by level
router.get('/level/:level_id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, f.faculty_name FROM programmes p
       LEFT JOIN faculties f ON p.faculty_id = f.faculty_id
       WHERE p.level_id = ?`,
      [req.params.level_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Get programmes by level and faculty
router.get('/filter', async (req, res) => {
  const { level_id, faculty_id } = req.query;
  try {
    let query = `SELECT p.*, l.level_name, f.faculty_name 
                 FROM programmes p 
                 JOIN levels l ON p.level_id = l.level_id
                 LEFT JOIN faculties f ON p.faculty_id = f.faculty_id
                 WHERE 1=1`;
    const params = [];
    if (level_id) { query += ' AND p.level_id = ?'; params.push(level_id); }
    if (faculty_id) { query += ' AND p.faculty_id = ?'; params.push(faculty_id); }
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Add programme
router.post('/', verify('admin'), async (req, res) => {
  const { level_id, faculty_id, programme_name, duration_years } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO programmes (level_id, faculty_id, programme_name, duration_years) VALUES (?, ?, ?, ?)',
      [level_id, faculty_id||null, programme_name, duration_years||3]
    );
    res.json({ message: 'Programme added', programme_id: result.insertId });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Delete programme
router.delete('/:id', verify('admin'), async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM programmes WHERE programme_id = ?', [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Programme not found' });
    res.json({ message: 'Programme deleted' });
  } catch (err) {
    console.error('DELETE /programmes/:id error:', err);
    // Programmes have students, subjects, and programme_subject_pool rows —
    // cascading is dangerous, so we refuse with a clear message.
    const mapped = mapDeleteError(err, 'programme');
    res.status(mapped.status).json(mapped.body);
  }
});
module.exports = router;
