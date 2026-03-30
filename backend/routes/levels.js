const express = require('express');
const router = express.Router();
const db = require('../db');
const { verify } = require('../middleware/auth');

router.use(verify());

// Get all levels
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM levels');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Add level
router.post('/', verify('admin'), async (req, res) => {
  const { level_name, description } = req.body;
  try {
    const [result] = await db.query('INSERT INTO levels (level_name, description) VALUES (?, ?)', [level_name, description]);
    res.json({ message: 'Level added', level_id: result.insertId });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Delete level
router.delete('/:id', verify('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM levels WHERE level_id = ?', [req.params.id]);
    res.json({ message: 'Level deleted' });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

module.exports = router;
