const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verify } = require('../middleware/auth');
require('dotenv').config();

// ── Clerk Login ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query(
      `SELECT c.*, f.faculty_name
       FROM clerks c
       JOIN faculties f ON c.faculty_id = f.faculty_id
       WHERE c.email = ? AND c.is_active = 1`, [email]
    );
    if (!rows.length) return res.status(404).json({ error: 'Clerk not found' });
    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });
    const token = jwt.sign(
      { id: rows[0].clerk_id, role: 'clerk', faculty_id: rows[0].faculty_id },
      process.env.JWT_SECRET, { expiresIn: '8h' }
    );
    const { password: _, ...clerkData } = rows[0];
    res.json({ token, clerk: clerkData });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Middleware: extract faculty_id from token ───────────────────────────────
const clerkOnly = verify('clerk', 'admin');

const getFacultyId = (req) => {
  return req.user.faculty_id || null;
};

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
