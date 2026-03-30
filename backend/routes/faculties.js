const express = require('express');
const router = express.Router();
const db = require('../db');
const { verify } = require('../middleware/auth');

router.use(verify());

// Get all faculties
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM faculties ORDER BY faculty_name');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Add faculty
router.post('/', verify('admin'), async (req, res) => {
  const { faculty_name, description } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO faculties (faculty_name, description) VALUES (?, ?)',
      [faculty_name, description]
    );
    res.json({ message: 'Faculty added', faculty_id: result.insertId });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Delete faculty
router.delete('/:id', verify('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM faculties WHERE faculty_id = ?', [req.params.id]);
    res.json({ message: 'Faculty deleted' });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

module.exports = router;
