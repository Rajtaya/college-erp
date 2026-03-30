const express = require('express');
const router = express.Router();
const db = require('../db');
const { verify } = require('../middleware/auth');

router.use(verify());

// Get all departments
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.*, f.faculty_name FROM departments d
       LEFT JOIN faculties f ON d.faculty_id = f.faculty_id
       ORDER BY f.faculty_name, d.department_name`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
