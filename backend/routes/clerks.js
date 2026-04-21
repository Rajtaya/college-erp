const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { verify } = require('../middleware/auth');

// Dummy hash for timing-attack mitigation
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

// ── Clerk Login ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });
  try {
    const [rows] = await db.query(
      `SELECT c.*, f.faculty_name
       FROM clerks c
       JOIN faculties f ON c.faculty_id = f.faculty_id
       WHERE c.email = ? AND c.is_active = 1`, [email]
    );

    // Timing-attack mitigation — always compare
    const hashToCheck = rows.length ? rows[0].password : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCheck);
    if (!rows.length || !valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Upgrade cost factor on successful login if still at old cost 10
    if (rows[0].password.startsWith('$2b$10$') || rows[0].password.startsWith('$2a$10$')) {
      const upgraded = await bcrypt.hash(password, 12);
      await db.query('UPDATE clerks SET password = ? WHERE clerk_id = ?',
        [upgraded, rows[0].clerk_id]);
    }

    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { id: rows[0].clerk_id, role: 'clerk', faculty_id: rows[0].faculty_id, jti },
      process.env.JWT_SECRET,
      { expiresIn: '8h', algorithm: 'HS256' }
    );
    const { password: _, ...clerkData } = rows[0];
    res.json({ token, clerk: clerkData });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Middleware: clerk-only routes (admins use /admin/* instead) ─────────────
const clerkOnly = verify('clerk');

// Helper: extract faculty scope from JWT
const getFacultyId = (req) => req.user.faculty_id || null;

// ── Dashboard Stats ─────────────────────────────────────────────────────────
router.get('/stats', clerkOnly, async (req, res) => {
  const fid = getFacultyId(req);
  try {
    const [[{ totalStudents }]] = await db.query(
      `SELECT COUNT(*) AS totalStudents FROM students s
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE p.faculty_id = ?`, [fid]
    );
    const [[{ totalTeachers }]] = await db.query(
      `SELECT COUNT(DISTINCT td.teacher_id) AS totalTeachers
       FROM teacher_departments td
       JOIN departments d ON td.department_id = d.department_id
       WHERE d.faculty_id = ?`, [fid]
    );
    const [[{ totalProgrammes }]] = await db.query(
      `SELECT COUNT(*) AS totalProgrammes FROM programmes WHERE faculty_id = ?`, [fid]
    );
    res.json({ totalStudents, totalTeachers, totalProgrammes });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Students (read-only, faculty-filtered) ──────────────────────────────────
router.get('/students', clerkOnly, async (req, res) => {
  const fid = getFacultyId(req);
  try {
    const [rows] = await db.query(
      `SELECT s.student_id, s.roll_no, CONCAT(s.first_name,' ',s.last_name) AS name,
              s.email, s.phone, s.semester, p.programme_name, f.faculty_name
       FROM students s
       JOIN programmes p ON s.programme_id = p.programme_id
       JOIN faculties f ON p.faculty_id = f.faculty_id
       WHERE p.faculty_id = ?
       ORDER BY p.programme_name, s.roll_no`, [fid]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Attendance (read-only, faculty-filtered) ────────────────────────────────
router.get('/attendance', clerkOnly, async (req, res) => {
  const fid = getFacultyId(req);
  try {
    const [rows] = await db.query(
      `SELECT a.attendance_id, s.roll_no, CONCAT(s.first_name,' ',s.last_name) AS student_name,
              sub.subject_code, sub.subject_name, a.date, a.status,
              p.programme_name
       FROM attendance a
       JOIN students s ON a.student_id = s.student_id
       JOIN subjects sub ON a.subject_id = sub.subject_id
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE p.faculty_id = ?
       ORDER BY a.date DESC, s.roll_no
       LIMIT 1000`, [fid]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Attendance Summary (faculty-filtered) ───────────────────────────────────
router.get('/attendance/summary', clerkOnly, async (req, res) => {
  const fid = getFacultyId(req);
  try {
    const [rows] = await db.query(
      `SELECT s.roll_no, CONCAT(s.first_name,' ',s.last_name) AS student_name,
              p.programme_name, s.semester,
              COUNT(a.attendance_id) AS total_classes,
              SUM(CASE WHEN a.status='PRESENT' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN a.status='ABSENT' THEN 1 ELSE 0 END) AS absent,
              SUM(CASE WHEN a.status='LEAVE' THEN 1 ELSE 0 END) AS on_leave,
              ROUND(SUM(CASE WHEN a.status='PRESENT' THEN 1 ELSE 0 END)*100/COUNT(a.attendance_id),1) AS percentage
       FROM students s
       JOIN programmes p ON s.programme_id = p.programme_id
       LEFT JOIN attendance a ON s.student_id = a.student_id
       WHERE p.faculty_id = ?
       GROUP BY s.student_id
       HAVING total_classes > 0
       ORDER BY p.programme_name, s.roll_no`, [fid]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Marks (read-only, faculty-filtered) ─────────────────────────────────────
router.get('/marks', clerkOnly, async (req, res) => {
  const fid = getFacultyId(req);
  try {
    const [rows] = await db.query(
      `SELECT s.roll_no, CONCAT(s.first_name,' ',s.last_name) AS student_name,
              p.programme_name, s.semester,
              sub.subject_code, sub.subject_name,
              m.exam_type, m.marks_obtained, m.max_marks
       FROM marks m
       JOIN students s ON m.student_id = s.student_id
       JOIN subjects sub ON m.subject_id = sub.subject_id
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE p.faculty_id = ?
       ORDER BY p.programme_name, s.roll_no, sub.subject_code`, [fid]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Fees (read-only, faculty-filtered) ──────────────────────────────────────
router.get('/fees', clerkOnly, async (req, res) => {
  const fid = getFacultyId(req);
  try {
    const [rows] = await db.query(
      `SELECT f.fee_id, s.roll_no, CONCAT(s.first_name,' ',s.last_name) AS student_name,
              p.programme_name, s.semester,
              f.fee_type, f.amount, f.amount_paid, f.due_date, f.status,
              (f.amount - f.amount_paid) AS balance
       FROM fees f
       JOIN students s ON f.student_id = s.student_id
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE p.faculty_id = ?
       ORDER BY p.programme_name, s.roll_no, f.due_date`, [fid]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Enrollment (read-only, faculty-filtered, ONE ROW PER STUDENT) ───────────
router.get('/enrollment', clerkOnly, async (req, res) => {
  const fid = getFacultyId(req);
  try {
    const [rows] = await db.query(
      `SELECT s.roll_no, CONCAT(s.first_name,' ',s.last_name) AS student_name,
              p.programme_name, s.semester,
              sub.subject_code
       FROM student_subject_enrollment e
       JOIN students s ON e.student_id = s.student_id
       JOIN subjects sub ON e.subject_id = sub.subject_id
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE p.faculty_id = ? AND e.status = 'ACCEPTED'
       ORDER BY p.programme_name, s.roll_no, sub.subject_code`, [fid]
    );

    // Pivot: one row per student, subjects as columns
    const studentMap = {};
    rows.forEach(r => {
      if (!studentMap[r.roll_no]) {
        studentMap[r.roll_no] = {
          roll_no: r.roll_no,
          student_name: r.student_name,
          programme_name: r.programme_name,
          semester: r.semester,
          subjects: []
        };
      }
      studentMap[r.roll_no].subjects.push(r.subject_code);
    });

    const maxSubjects = Math.max(...Object.values(studentMap).map(s => s.subjects.length), 0);
    const result = Object.values(studentMap).map(s => {
      const row = {
        roll_no: s.roll_no,
        student_name: s.student_name,
        programme_name: s.programme_name,
        semester: s.semester,
        total_subjects: s.subjects.length
      };
      for (let i = 0; i < maxSubjects; i++) {
        row['Subject_' + (i + 1)] = s.subjects[i] || '';
      }
      return row;
    });

    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
