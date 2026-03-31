const express = require('express');
const router  = express.Router();
const db      = require('../db');
const bcrypt  = require('bcryptjs');
const { verify } = require('../middleware/auth');

router.use((req, res, next) => {
  // Profile routes need a valid token, but allow any role (students access own profile)
  if (req.path.includes('/profile')) return verify()(req, res, next);
  verify('admin', 'teacher')(req, res, next);
});

// ── GET / — All students ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.student_id, s.roll_no,
              CONCAT(s.first_name, ' ', s.last_name) AS name,
              s.first_name, s.last_name,
              s.email, s.phone, s.abc_id,
              s.semester, s.study_year,
              s.level_id, s.programme_id, s.faculty_id,
              s.enrollment_submitted, s.academic_year_id,
              l.level_name, p.programme_name, f.faculty_name,
              a.year_label AS academic_year
       FROM students s
       LEFT JOIN levels        l ON s.level_id        = l.level_id
       LEFT JOIN programmes    p ON s.programme_id    = p.programme_id
       LEFT JOIN faculties     f ON s.faculty_id      = f.faculty_id
       LEFT JOIN academic_years a ON s.academic_year_id = a.academic_year_id
       ORDER BY s.roll_no`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── GET /:id — Single student by ID ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.student_id, s.roll_no,
              CONCAT(s.first_name, ' ', s.last_name) AS name,
              s.first_name, s.last_name,
              s.email, s.phone, s.abc_id,
              s.semester, s.study_year,
              s.level_id, s.programme_id, s.faculty_id,
              s.enrollment_submitted, s.academic_year_id,
              l.level_name, p.programme_name, f.faculty_name,
              a.year_label AS academic_year
       FROM students s
       LEFT JOIN levels        l ON s.level_id        = l.level_id
       LEFT JOIN programmes    p ON s.programme_id    = p.programme_id
       LEFT JOIN faculties     f ON s.faculty_id      = f.faculty_id
       LEFT JOIN academic_years a ON s.academic_year_id = a.academic_year_id
       WHERE s.student_id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    const { password, ...student } = rows[0];
    res.json(student);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── GET /:id/profile — Full profile using view ──────────────────────────────
router.get('/:id/profile', async (req, res) => {
  // Students can only view their own profile
  if (req.user.role === 'student' && req.user.id !== parseInt(req.params.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const [rows] = await db.query(
      'SELECT * FROM vw_student_profile WHERE student_id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── POST / — Add a student (admin only) ────────────────────────────────────
router.post('/', verify('admin'), async (req, res) => {
  const {
    roll_no, first_name, last_name, email, phone,
    semester, study_year, password,
    level_id, programme_id, faculty_id, academic_year_id, abc_id
  } = req.body;
  try {
    const hashed   = await bcrypt.hash(password, 12);
    const emailVal = email && email.trim() ? email.trim() : null;
    const [result] = await db.query(
      `INSERT INTO students
         (roll_no, first_name, last_name, email, phone,
          semester, study_year, password,
          level_id, programme_id, faculty_id, academic_year_id, abc_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [roll_no, first_name, last_name, emailVal, phone || null,
       semester, study_year || 1, hashed,
       level_id || null, programme_id || null, faculty_id || null,
       academic_year_id || null, abc_id || null]
    );
    res.json({ message: 'Student added', student_id: result.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── PUT /:id/profile — Student updates their own profile / password ─────────
router.put('/:id/profile', async (req, res) => {
  // Students can only update their own profile
  if (req.user.role === 'student' && req.user.id !== parseInt(req.params.id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name, first_name, last_name, email, phone, current_password, new_password } = req.body;
  try {
    const [rows] = await db.query(
      'SELECT * FROM students WHERE student_id = ?', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Student not found' });
    const student = rows[0];

    // Resolve first/last name — support both split fields and legacy single name
    let fName = first_name || (name ? name.split(' ')[0] : student.first_name);
    let lName = last_name  || (name ? name.split(' ').slice(1).join(' ') : student.last_name);

    if (new_password) {
      // Password change — verify current password first
      const valid = await bcrypt.compare(current_password || '', student.password);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
      const hashed = await bcrypt.hash(new_password, 12);
      await db.query(
        `UPDATE students
         SET first_name=?, last_name=?, email=?, phone=?, password=?
         WHERE student_id=?`,
        [fName, lName, email || student.email, phone || student.phone, hashed, req.params.id]
      );
    } else {
      await db.query(
        `UPDATE students
         SET first_name=?, last_name=?, email=?, phone=?
         WHERE student_id=?`,
        [fName, lName, email || student.email, phone || student.phone, req.params.id]
      );
    }

    // Return fresh student data so the frontend can update state
    const [updated] = await db.query(
      `SELECT s.student_id, s.roll_no, s.first_name, s.last_name,
              CONCAT(s.first_name, ' ', s.last_name) AS name,
              s.email, s.phone, s.abc_id,
              s.semester, s.study_year,
              s.level_id, s.programme_id, s.faculty_id,
              l.level_name, p.programme_name, f.faculty_name
       FROM students s
       LEFT JOIN levels     l ON s.level_id     = l.level_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id
       LEFT JOIN faculties  f ON s.faculty_id   = f.faculty_id
       WHERE s.student_id = ?`,
      [req.params.id]
    );
    res.json({ message: 'Profile updated successfully', student: updated[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
