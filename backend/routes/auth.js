const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { verify }     = require('../middleware/auth');
const blacklist      = require('../middleware/tokenBlacklist');

// Dummy hash used to equalise timing when user is not found.
// Pre-computed once at startup. Value is a hash of a random string — never matches.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

// ── Student login ─────────────────────────────────────────────────────────────
router.post('/student/login', async (req, res) => {
  const { roll_no, password } = req.body;
  if (!roll_no || !password)
    return res.status(400).json({ error: 'Roll number and password are required' });
  try {
    const [rows] = await db.query(
      `SELECT s.student_id, s.roll_no, s.first_name, s.last_name,
              s.email, s.phone, s.abc_id, s.password,
              s.semester, s.study_year, s.enrollment_submitted,
              s.level_id, s.programme_id, s.faculty_id, s.academic_year_id,
              l.level_name, p.programme_name, f.faculty_name
       FROM students s
       LEFT JOIN levels     l ON s.level_id     = l.level_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id
       LEFT JOIN faculties  f ON s.faculty_id   = f.faculty_id
       WHERE s.roll_no = ?`,
      [roll_no]
    );

    // Timing-attack mitigation: always run bcrypt.compare, even when user not found.
    const hashToCheck = rows.length ? rows[0].password : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCheck);
    if (!rows.length || !valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Upgrade cost factor on successful login if still at old cost 10
    if (rows[0].password.startsWith('$2b$10$') || rows[0].password.startsWith('$2a$10$')) {
      const upgraded = await bcrypt.hash(password, 12);
      await db.query('UPDATE students SET password = ? WHERE student_id = ?',
        [upgraded, rows[0].student_id]);
    }

    const jti   = crypto.randomUUID();
    const token = jwt.sign(
      { id: rows[0].student_id, role: 'student', jti },
      process.env.JWT_SECRET,
      { expiresIn: '1d', algorithm: 'HS256' }
    );
    const { password: _, ...studentData } = rows[0];
    studentData.name   = `${studentData.first_name} ${studentData.last_name}`;
    studentData.course = studentData.programme_name;
    studentData.year   = studentData.study_year;
    res.json({ token, student: studentData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Teacher login ─────────────────────────────────────────────────────────────
router.post('/teacher/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });
  try {
    const [rows] = await db.query(
      `SELECT t.teacher_id, t.first_name, t.last_name, t.email, t.phone,
              t.title, t.designation, t.employee_code, t.password,
              CONCAT(t.first_name, ' ', t.last_name) AS name
       FROM teachers t
       WHERE t.email = ?`,
      [email]
    );

    // Timing-attack mitigation
    const hashToCheck = rows.length ? rows[0].password : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCheck);
    if (!rows.length || !valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Upgrade cost factor on successful login if still at old cost 10
    if (rows[0].password.startsWith('$2b$10$') || rows[0].password.startsWith('$2a$10$')) {
      const upgraded = await bcrypt.hash(password, 12);
      await db.query('UPDATE teachers SET password = ? WHERE teacher_id = ?',
        [upgraded, rows[0].teacher_id]);
    }

    const jti   = crypto.randomUUID();
    const token = jwt.sign(
      { id: rows[0].teacher_id, role: 'teacher', jti },
      process.env.JWT_SECRET,
      { expiresIn: '1d', algorithm: 'HS256' }
    );
    const { password: _, ...teacherData } = rows[0];
    res.json({ token, teacher: teacherData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Logout (student / teacher / clerk / fee_clerk) — blacklists the token ────
router.post('/logout', verify(), (req, res) => {
  const { jti, exp } = req.user;
  if (jti && exp) blacklist.add(jti, exp);
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
