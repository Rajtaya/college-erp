const express   = require('express');
const router    = express.Router();
const db        = require('../db');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const { verify }     = require('../middleware/auth');
const blacklist      = require('../middleware/tokenBlacklist');
const { auditLog }   = require('../middleware/audit');
require('dotenv').config();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });
  try {
    // Explicit columns — never load password hash unnecessarily into memory
    const [rows] = await db.query(
      'SELECT admin_id, name, email, password FROM admins WHERE email = ?',
      [email]
    );
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const jti   = crypto.randomUUID();
    const token = jwt.sign(
      { id: rows[0].admin_id, role: 'admin', jti },
      process.env.JWT_SECRET,
      { expiresIn: '1d', algorithm: 'HS256' }
    );
    res.json({ token, admin: { admin_id: rows[0].admin_id, name: rows[0].name, email: rows[0].email } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// Admin logout — blacklist the token
router.post('/logout', verify('admin'), (req, res) => {
  const { jti, exp } = req.user;
  if (jti && exp) blacklist.add(jti, exp);
  res.json({ message: 'Logged out successfully' });
});

router.use(verify('admin'));

// ── STUDENTS ──────────────────────────────────────────────────────────────────

router.get('/students', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.student_id, s.roll_no, CONCAT(s.first_name, ' ', s.last_name) AS name,
              s.first_name, s.last_name, s.email, s.phone, s.semester, s.study_year,
              s.level_id, s.faculty_id, s.programme_id, s.enrollment_submitted,
              l.level_name, p.programme_name, f.faculty_name
       FROM students s
       LEFT JOIN levels l ON s.level_id = l.level_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id
       LEFT JOIN faculties f ON s.faculty_id = f.faculty_id
       ORDER BY s.roll_no`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/students/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const [check] = await db.query('SELECT student_id, roll_no FROM students WHERE student_id = ?', [id]);
    if (!check.length) return res.status(404).json({ error: 'Student not found' });
    await db.query('DELETE FROM student_disciplines WHERE student_id = ?', [id]);
    await db.query('DELETE FROM student_subject_enrollment WHERE student_id = ?', [id]);
    await db.query('DELETE FROM attendance WHERE student_id = ?', [id]);
    await db.query('DELETE FROM marks WHERE student_id = ?', [id]);
    await db.query('DELETE FROM fees WHERE student_id = ?', [id]);
    await db.query('DELETE FROM students WHERE student_id = ?', [id]);
    auditLog(req, 'DELETE_STUDENT', 'students', id, { roll_no: check[0].roll_no });
    res.json({ message: 'Student deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// Assign disciplines to a student
router.post('/students/:id/disciplines', async (req, res) => {
  const { discipline_ids } = req.body;
  try {
    await db.query('DELETE FROM student_disciplines WHERE student_id = ?', [req.params.id]);
    if (discipline_ids && discipline_ids.length > 0) {
      const placeholders = discipline_ids.map(() => '(?,?)').join(',');
      const values = discipline_ids.flatMap(did => [req.params.id, did]);
      await db.query(`INSERT IGNORE INTO student_disciplines (student_id, discipline_id) VALUES ${placeholders}`, values);
    }
    res.json({ message: 'Disciplines assigned successfully' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// Get disciplines for a student
router.get('/students/:id/disciplines', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.discipline_id, d.discipline_name
       FROM student_disciplines sd
       JOIN disciplines d ON sd.discipline_id = d.discipline_id
       WHERE sd.student_id = ?`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── TEACHERS ──────────────────────────────────────────────────────────────────

router.get('/teachers', async (req, res) => {
  try {
    const [teachers] = await db.query(
      `SELECT teacher_id, first_name, last_name,
              CONCAT(first_name, ' ', last_name) AS name,
              title, email, phone, employee_code, designation
       FROM teachers ORDER BY first_name`
    );
    const [tdRows] = await db.query(
      `SELECT td.teacher_id, td.discipline_id, d.discipline_name
       FROM teacher_disciplines td
       JOIN disciplines d ON td.discipline_id = d.discipline_id`
    );
    const [deptRows] = await db.query(
      `SELECT tde.teacher_id, tde.department_id, d.department_name
       FROM teacher_departments tde
       JOIN departments d ON tde.department_id = d.department_id`
    );
    const result = teachers.map(t => ({
      ...t,
      disciplines: tdRows.filter(td => td.teacher_id === t.teacher_id)
        .map(td => ({ discipline_id: td.discipline_id, discipline_name: td.discipline_name })),
      departments: deptRows.filter(d => d.teacher_id === t.teacher_id)
        .map(d => ({ department_id: d.department_id, department_name: d.department_name })),
    }));
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/teachers', async (req, res) => {
  const { title, first_name, last_name, email, phone, designation, employee_code, password, discipline_ids, department_ids } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      `INSERT INTO teachers (title, first_name, last_name, email, phone, designation, employee_code, password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title||null, first_name, last_name||'', email, phone||null, designation||null, employee_code||null, hashed]
    );
    const teacher_id = result.insertId;
    if (discipline_ids && discipline_ids.length > 0) {
      for (const did of discipline_ids) {
        await db.query('INSERT IGNORE INTO teacher_disciplines (teacher_id, discipline_id) VALUES (?, ?)', [teacher_id, did]);
      }
    }
    if (department_ids && department_ids.length > 0) {
      for (const depid of department_ids) {
        await db.query('INSERT IGNORE INTO teacher_departments (teacher_id, department_id) VALUES (?, ?)', [teacher_id, depid]);
      }
    }
    res.json({ message: 'Teacher added', teacher_id });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/teachers/:id', async (req, res) => {
  const { title, first_name, last_name, email, phone, designation, employee_code, discipline_ids, department_ids } = req.body;
  try {
    const [result] = await db.query(
      `UPDATE teachers SET
         title       = COALESCE(?, title),
         first_name  = COALESCE(?, first_name),
         last_name   = COALESCE(?, last_name),
         email       = COALESCE(?, email),
         phone       = COALESCE(?, phone),
         designation = COALESCE(?, designation),
         employee_code = COALESCE(?, employee_code)
       WHERE teacher_id=?`,
      [title??null, first_name??null, last_name??null, email??null, phone??null, designation??null, employee_code??null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Teacher not found' });
    // Only replace disciplines if discipline_ids was explicitly sent — prevents silent wipe
    if ('discipline_ids' in req.body) {
      await db.query('DELETE FROM teacher_disciplines WHERE teacher_id = ?', [req.params.id]);
      if (discipline_ids && discipline_ids.length > 0) {
        for (const did of discipline_ids) {
          await db.query('INSERT IGNORE INTO teacher_disciplines (teacher_id, discipline_id) VALUES (?, ?)', [req.params.id, did]);
        }
      }
    }
    // Only replace departments if department_ids was explicitly sent
    if ('department_ids' in req.body) {
      await db.query('DELETE FROM teacher_departments WHERE teacher_id = ?', [req.params.id]);
      if (department_ids && department_ids.length > 0) {
        for (const depid of department_ids) {
          await db.query('INSERT IGNORE INTO teacher_departments (teacher_id, department_id) VALUES (?, ?)', [req.params.id, depid]);
        }
      }
    }
    res.json({ message: 'Teacher updated' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /admin/teachers/:id/subjects — subjects filtered by teacher's disciplines
router.get('/teachers/:id/subjects', async (req, res) => {
  try {
    const [tdRows] = await db.query(
      'SELECT discipline_id FROM teacher_disciplines WHERE teacher_id = ?',
      [req.params.id]
    );
    const disciplineIds = tdRows.map(r => r.discipline_id);

    let query, params;
    if (disciplineIds.length > 0) {
      query = `SELECT s.*, l.level_name, p.programme_name, f.faculty_name, d.discipline_name
               FROM subjects s
               LEFT JOIN levels l ON s.level_id = l.level_id
               LEFT JOIN programmes p ON s.programme_id = p.programme_id
               LEFT JOIN faculties f ON s.faculty_id = f.faculty_id
               LEFT JOIN disciplines d ON s.discipline_id = d.discipline_id
               WHERE s.discipline_id IN (?)
                  OR s.discipline_id IS NULL
               ORDER BY l.level_name, s.semester, s.category, s.subject_code`;
      params = [disciplineIds];
    } else {
      query = `SELECT s.*, l.level_name, p.programme_name, f.faculty_name, d.discipline_name
               FROM subjects s
               LEFT JOIN levels l ON s.level_id = l.level_id
               LEFT JOIN programmes p ON s.programme_id = p.programme_id
               LEFT JOIN faculties f ON s.faculty_id = f.faculty_id
               LEFT JOIN disciplines d ON s.discipline_id = d.discipline_id
               ORDER BY l.level_name, s.semester, s.category, s.subject_code`;
      params = [];
    }
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/teachers/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const [check] = await db.query('SELECT teacher_id, email FROM teachers WHERE teacher_id = ?', [id]);
    if (!check.length) return res.status(404).json({ error: 'Teacher not found' });
    await db.query('UPDATE attendance SET teacher_id = NULL WHERE teacher_id = ?', [id]);
    await db.query('DELETE FROM teacher_disciplines WHERE teacher_id = ?', [id]);
    await db.query('DELETE FROM teacher_departments WHERE teacher_id = ?', [id]);
    await db.query('DELETE FROM subject_teachers WHERE teacher_id = ?', [id]);
    await db.query('DELETE FROM teachers WHERE teacher_id = ?', [id]);
    auditLog(req, 'DELETE_TEACHER', 'teachers', id, { email: check[0].email });
    res.json({ message: 'Teacher deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── SUBJECTS ──────────────────────────────────────────────────────────────────

router.get('/subjects/all', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, l.level_name, p.programme_name
       FROM subjects s
       LEFT JOIN levels l ON s.level_id = l.level_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id
       ORDER BY l.level_name, p.programme_name, s.semester`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/subjects', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM subjects');
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/subjects', async (req, res) => {
  const { subject_code, subject_name, category, semester, credits, teacher_id } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO subjects (subject_code, subject_name, category, semester, credits, teacher_id) VALUES (?, ?, ?, ?, ?, ?)',
      [subject_code, subject_name, category, semester, credits, teacher_id || null]
    );
    res.json({ message: 'Subject added', subject_id: result.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/subjects/:id', async (req, res) => {
  const id = req.params.id;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM student_subject_enrollment WHERE subject_id = ?', [id]);
    await conn.query('DELETE FROM attendance WHERE subject_id = ?', [id]);
    await conn.query('DELETE FROM marks WHERE subject_id = ?', [id]);
    await conn.query('DELETE FROM notifications WHERE subject_id = ?', [id]);
    await conn.query('DELETE FROM programme_subject_pool WHERE subject_id = ?', [id]);
    // subject_teachers has ON DELETE CASCADE
    await conn.query('DELETE FROM subjects WHERE subject_id = ?', [id]);
    await conn.commit();
    res.json({ message: 'Subject deleted' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

// ── ATTENDANCE ────────────────────────────────────────────────────────────────

router.get('/attendance', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 500, 1000);
    const offset = (Math.max(parseInt(req.query.page) || 1, 1) - 1) * limit;
    const [rows] = await db.query(
      `SELECT a.attendance_id, a.student_id, a.subject_id, a.date, a.status, a.teacher_id,
              CONCAT(s.first_name, ' ', s.last_name) AS student_name,
              s.roll_no, sub.subject_name, sub.subject_code
       FROM attendance a
       JOIN students s  ON a.student_id = s.student_id
       JOIN subjects sub ON a.subject_id = sub.subject_id
       ORDER BY a.date DESC, s.roll_no
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/attendance/export', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT st.roll_no, CONCAT(st.first_name, ' ', st.last_name) AS student_name,
             p.programme_name, l.level_name, st.semester,
             sub.subject_code, sub.subject_name, sub.category,
             a.date, a.status as attendance_status
      FROM attendance a
      JOIN students st ON a.student_id = st.student_id
      JOIN subjects sub ON a.subject_id = sub.subject_id
      LEFT JOIN programmes p ON st.programme_id = p.programme_id
      LEFT JOIN levels l ON st.level_id = l.level_id
      ORDER BY p.programme_name, st.roll_no, sub.subject_code, a.date`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/attendance/summary', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT st.roll_no, CONCAT(st.first_name, ' ', st.last_name) AS student_name,
             p.programme_name, l.level_name, st.semester,
             sub.subject_code, sub.subject_name, sub.category,
             COUNT(a.attendance_id) as total_classes,
             SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as present,
             SUM(CASE WHEN a.status = 'ABSENT'  THEN 1 ELSE 0 END) as absent,
             SUM(CASE WHEN a.status = 'LEAVE'   THEN 1 ELSE 0 END) as on_leave,
             ROUND((SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) / NULLIF(COUNT(a.attendance_id), 0)) * 100, 1) as attendance_pct
      FROM attendance a
      JOIN students st ON a.student_id = st.student_id
      JOIN subjects sub ON a.subject_id = sub.subject_id
      LEFT JOIN programmes p ON st.programme_id = p.programme_id
      LEFT JOIN levels l ON st.level_id = l.level_id
      GROUP BY st.student_id, sub.subject_id
      ORDER BY p.programme_name, st.roll_no, sub.subject_code`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── FEES ──────────────────────────────────────────────────────────────────────

router.get('/fees/export', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT f.fee_id, st.roll_no, CONCAT(st.first_name, ' ', st.last_name) AS student_name,
             p.programme_name, l.level_name, st.semester,
             f.fee_type, f.amount, f.due_date, f.paid_date, f.status, f.transaction_ref
      FROM fees f
      JOIN students st ON f.student_id = st.student_id
      LEFT JOIN programmes p ON st.programme_id = p.programme_id
      LEFT JOIN levels l ON st.level_id = l.level_id
      ORDER BY p.programme_name, st.roll_no, f.due_date`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/fees', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 500, 1000);
    const offset = (Math.max(parseInt(req.query.page) || 1, 1) - 1) * limit;
    const [rows] = await db.query(
      `SELECT f.fee_id, f.student_id, f.amount, f.fee_type, f.due_date,
              f.paid_date, f.status, f.transaction_ref,
              CONCAT(s.first_name, ' ', s.last_name) AS student_name,
              s.roll_no, p.programme_name, l.level_name, s.semester
       FROM fees f
       JOIN students s ON f.student_id = s.student_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id
       LEFT JOIN levels l ON s.level_id = l.level_id
       ORDER BY f.due_date DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/fees/summary', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.programme_name, l.level_name,
              COUNT(f.fee_id) as total_records,
              COUNT(DISTINCT f.student_id) as total_students,
              SUM(f.amount) as total_amount,
              SUM(CASE WHEN f.status='PAID'    THEN f.amount ELSE 0 END) as paid_amount,
              SUM(CASE WHEN f.status='PENDING' THEN f.amount ELSE 0 END) as pending_amount,
              SUM(CASE WHEN f.status='OVERDUE' THEN f.amount ELSE 0 END) as overdue_amount,
              COUNT(CASE WHEN f.status='PAID'    THEN 1 END) as paid_count,
              COUNT(CASE WHEN f.status='PENDING' THEN 1 END) as pending_count,
              COUNT(CASE WHEN f.status='OVERDUE' THEN 1 END) as overdue_count
       FROM fees f
       JOIN students s ON f.student_id = s.student_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id
       LEFT JOIN levels l ON s.level_id = l.level_id
       GROUP BY p.programme_id, l.level_name, p.programme_name
       ORDER BY l.level_name, p.programme_name`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/fees/bulk', async (req, res) => {
  const { amount, fee_type, due_date, programme_id } = req.body;
  // Input validation
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0 || Number(amount) > 1_000_000)
    return res.status(400).json({ error: 'Invalid fee amount' });
  if (!fee_type || !due_date)
    return res.status(400).json({ error: 'fee_type and due_date are required' });
  try {
    let query = 'SELECT student_id FROM students';
    let params = [];
    if (programme_id) { query += ' WHERE programme_id = ?'; params = [programme_id]; }
    const [students] = await db.query(query, params);
    if (!students.length) return res.status(404).json({ error: 'No students found' });

    // Single batch INSERT with INSERT IGNORE (skips existing duplicates if unique key exists)
    // ON DUPLICATE KEY UPDATE amount=amount is a no-op — keeps existing record unchanged
    const placeholders = students.map(() => '(?,?,?,?)').join(',');
    const values = students.flatMap(s => [s.student_id, Number(amount), fee_type, due_date]);
    const [result] = await db.query(
      `INSERT IGNORE INTO fees (student_id, amount, fee_type, due_date) VALUES ${placeholders}`,
      values
    );
    const inserted = result.affectedRows;
    auditLog(req, 'BULK_FEES_GENERATE', 'fees', null,
      { programme_id, fee_type, amount: Number(amount), due_date, inserted });
    res.json({ message: `Fee generated for ${inserted} student(s)`, inserted, skipped: students.length - inserted });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/fees/mark-overdue', async (req, res) => {
  try {
    const [result] = await db.query(
      `UPDATE fees SET status='OVERDUE' WHERE status='PENDING' AND due_date < CURDATE()`
    );
    res.json({ message: `${result.affectedRows} fee(s) marked as overdue` });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── MARKS ─────────────────────────────────────────────────────────────────────

router.get('/marks', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 500, 1000);
    const offset = (Math.max(parseInt(req.query.page) || 1, 1) - 1) * limit;
    const [rows] = await db.query(
      `SELECT m.mark_id, m.student_id, m.subject_id, m.exam_type,
              m.marks_obtained, m.max_marks, m.semester, m.is_visible_to_student,
              CONCAT(s.first_name, ' ', s.last_name) AS student_name,
              s.roll_no, sub.subject_name, sub.subject_code
       FROM marks m
       JOIN students s  ON m.student_id = s.student_id
       JOIN subjects sub ON m.subject_id = sub.subject_id
       ORDER BY s.roll_no, sub.subject_code, m.exam_type
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/marks/export', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT st.roll_no, CONCAT(st.first_name, ' ', st.last_name) AS student_name,
             p.programme_name, l.level_name, st.semester,
             sub.subject_code, sub.subject_name, sub.category, sub.credits,
             m.exam_type, m.marks_obtained, m.max_marks,
             ROUND((m.marks_obtained / NULLIF(m.max_marks, 0)) * 100, 1) as percentage
      FROM marks m
      JOIN students st ON m.student_id = st.student_id
      JOIN subjects sub ON m.subject_id = sub.subject_id
      LEFT JOIN programmes p ON st.programme_id = p.programme_id
      LEFT JOIN levels l ON st.level_id = l.level_id
      ORDER BY l.level_name, p.programme_name, st.roll_no, sub.subject_code, m.exam_type`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/marks/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM marks WHERE mark_id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Mark record not found' });
    res.json({ message: 'Mark deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── ENROLLMENT ────────────────────────────────────────────────────────────────

router.get('/enrollment/summary', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT st.student_id, st.roll_no, CONCAT(st.first_name, ' ', st.last_name) AS student_name,
              st.programme_id, st.level_id, st.faculty_id,
              p.programme_name, l.level_name, st.semester,
              COUNT(e.enrollment_id) as total_enrolled,
              SUM(CASE WHEN e.status='ACCEPTED' THEN 1 ELSE 0 END) as accepted,
              SUM(CASE WHEN e.status='REJECTED' THEN 1 ELSE 0 END) as rejected,
              SUM(CASE WHEN e.status='PENDING'  THEN 1 ELSE 0 END) as pending,
              MAX(e.admin_modified) as admin_modified
       FROM students st
       LEFT JOIN student_subject_enrollment e ON st.student_id = e.student_id
         AND e.subject_id IN (SELECT sub.subject_id FROM subjects sub WHERE sub.semester = st.semester)
       LEFT JOIN programmes p ON st.programme_id = p.programme_id
       LEFT JOIN levels l ON st.level_id = l.level_id
       GROUP BY st.student_id
       ORDER BY st.roll_no`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/enrollment/detail/:student_id', async (req, res) => {
  try {
    const [student] = await db.query(
      `SELECT s.*, l.level_name, p.scheme
       FROM students s
       LEFT JOIN levels l ON s.level_id = l.level_id
       LEFT JOIN programmes p ON s.programme_id = p.programme_id
       WHERE s.student_id = ?`,
      [req.params.student_id]
    );
    if (!student.length) return res.status(404).json({ error: 'Student not found' });
    const s = student[0];
    const isPG = s.level_name === 'PG';

    const [rows] = await db.query(
      isPG
        ? `SELECT sub.subject_id, sub.subject_code, sub.subject_name, sub.category,
                  sub.credits, sub.semester, sub.discipline_id, d.discipline_name,
                  e.enrollment_id, e.status, e.is_major, e.remarks,
                  e.admin_modified, e.admin_note
           FROM subjects sub
           JOIN programme_subject_pool psp
             ON psp.subject_id = sub.subject_id AND psp.programme_id = ?
           LEFT JOIN disciplines d ON sub.discipline_id = d.discipline_id
           LEFT JOIN student_subject_enrollment e
             ON sub.subject_id = e.subject_id AND e.student_id = ?
           WHERE sub.semester = ?
           ORDER BY sub.category, sub.subject_code`
        : `SELECT sub.subject_id, sub.subject_code, sub.subject_name, sub.category,
                  sub.credits, sub.semester, sub.discipline_id, d.discipline_name,
                  e.enrollment_id, e.status, e.is_major, e.remarks,
                  e.admin_modified, e.admin_note
           FROM subjects sub
           LEFT JOIN disciplines d ON sub.discipline_id = d.discipline_id
           LEFT JOIN student_subject_enrollment e
             ON sub.subject_id = e.subject_id AND e.student_id = ?
           LEFT JOIN programme_subject_pool psp
             ON psp.subject_id = sub.subject_id AND psp.programme_id = ?
           WHERE sub.semester = ?
             AND (
               (sub.category = 'MAJOR' AND sub.programme_id = ?)
               OR (sub.category != 'MAJOR' AND sub.is_common = TRUE)
               OR (psp.id IS NOT NULL)
             )
           ORDER BY sub.category, sub.subject_code`,
      isPG
        ? [s.programme_id, req.params.student_id, s.semester]
        : [req.params.student_id, s.programme_id, s.semester, s.programme_id]
    );

    // Add T/P pairing info
    const enriched = rows.map(sub => {
      let pair_code = null, pair_type = null;
      if (['MDC','SEC','MAJOR'].includes(sub.category)) {
        const code = sub.subject_code.trim();
        const last = code.slice(-1).toUpperCase();
        if (last === 'T') {
          const pCode = code.slice(0, -1) + 'P';
          if (rows.find(s2 => s2.subject_code.trim() === pCode && s2.category === sub.category)) {
            pair_code = pCode; pair_type = 'THEORY';
          }
        } else if (last === 'P') {
          const tCode = code.slice(0, -1) + 'T';
          if (rows.find(s2 => s2.subject_code.trim() === tCode && s2.category === sub.category)) {
            pair_code = tCode; pair_type = 'PRACTICAL';
          }
        }
      }
      return { ...sub, pair_code, pair_type };
    });
    res.json(enriched);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/enrollment/export', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT st.roll_no, CONCAT(st.first_name, ' ', st.last_name) AS student_name,
             p.programme_id, p.programme_name,
             p.faculty_id, f.faculty_name,
             p.level_id, l.level_name,
             st.semester,
             sub.subject_code, sub.subject_name, sub.category, sub.credits,
             d.discipline_name,
             e.status,
             CASE WHEN e.is_major = 1 THEN 'Yes' ELSE 'No' END as is_major,
             CASE WHEN e.admin_modified = 1 THEN 'Yes' ELSE 'No' END as admin_modified,
             e.remarks
      FROM students st
      JOIN student_subject_enrollment e ON st.student_id = e.student_id
      JOIN subjects sub ON e.subject_id = sub.subject_id
      LEFT JOIN programmes p ON st.programme_id = p.programme_id
      LEFT JOIN faculties f ON p.faculty_id = f.faculty_id
      LEFT JOIN levels l ON st.level_id = l.level_id
      LEFT JOIN disciplines d ON sub.discipline_id = d.discipline_id
      WHERE e.status = 'ACCEPTED' AND e.is_draft = 0
      ORDER BY l.level_name, p.programme_name, st.roll_no, sub.category, sub.subject_code`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/enrollment/export-subject-wise', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT sub.subject_code, sub.subject_name, sub.category, sub.semester, sub.credits,
             p.programme_name, st.roll_no,
             CONCAT(st.first_name, ' ', st.last_name) AS student_name, e.status
      FROM student_subject_enrollment e
      JOIN subjects sub ON e.subject_id = sub.subject_id
      JOIN students st ON e.student_id = st.student_id
      LEFT JOIN programmes p ON sub.programme_id = p.programme_id
      WHERE e.status = 'ACCEPTED' AND e.is_draft = 0
      ORDER BY sub.subject_code, st.roll_no`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/enrollment/import', async (req, res) => {
  const { rows } = req.body;
  if (!rows || !rows.length) return res.status(400).json({ error: 'No data provided' });

  // ── Pass 1: validate all rows without touching the DB ──────────────────────
  const VALID_STATUSES = new Set(['ACCEPTED', 'REJECTED', 'PENDING']);
  const validated = [], errors = [];
  for (const row of rows) {
    const roll_no      = String(row.roll_no      || row['Roll No']      || '').trim();
    const subject_code = String(row.subject_code || row['Subject Code'] || row['Major Subject'] || '').trim();
    const status       = String(row.status       || row['Status']       || 'ACCEPTED').trim().toUpperCase();
    if (!roll_no || !subject_code) { errors.push('Row missing roll_no or subject_code'); continue; }
    if (!VALID_STATUSES.has(status)) { errors.push(`Invalid status "${status}" for ${roll_no}`); continue; }
    validated.push({ roll_no, subject_code, status });
  }

  // ── Pass 2: bulk-resolve roll_no → student_id, subject_code → subject_id ──
  const rollNos      = [...new Set(validated.map(r => r.roll_no))];
  const subjectCodes = [...new Set(validated.map(r => r.subject_code))];

  const [stuRows] = await db.query(
    `SELECT student_id, roll_no FROM students WHERE roll_no IN (?)`, [rollNos]
  );
  const [subRows] = await db.query(
    `SELECT subject_id, subject_code FROM subjects WHERE subject_code IN (?)`, [subjectCodes]
  );
  const stuMap = Object.fromEntries(stuRows.map(s => [s.roll_no, s.student_id]));
  const subMap = Object.fromEntries(subRows.map(s => [s.subject_code.trim(), s.subject_id]));

  // ── Pass 3: execute all valid rows inside a single transaction ─────────────
  let success = 0, failed = 0;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const { roll_no, subject_code, status } of validated) {
      const student_id = stuMap[roll_no];
      const subject_id = subMap[subject_code];
      if (!student_id) { failed++; errors.push(`Student not found: ${roll_no}`); continue; }
      if (!subject_id) { failed++; errors.push(`Subject not found: ${subject_code}`); continue; }
      const [existing] = await conn.query(
        'SELECT enrollment_id FROM student_subject_enrollment WHERE student_id = ? AND subject_id = ?',
        [student_id, subject_id]
      );
      if (existing.length) {
        await conn.query(
          'UPDATE student_subject_enrollment SET status=?, admin_modified=1, is_draft=0 WHERE student_id=? AND subject_id=?',
          [status, student_id, subject_id]
        );
      } else {
        await conn.query(
          'INSERT INTO student_subject_enrollment (student_id, subject_id, status, admin_modified, is_draft) VALUES (?,?,?,1,0)',
          [student_id, subject_id, status]
        );
      }
      success++;
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }

  auditLog(req, 'ENROLLMENT_IMPORT', 'student_subject_enrollment', null, { success, failed });
  res.json({ message: `Imported ${success} enrollment(s)`, success, failed, errors: errors.slice(0, 10) });
});

router.put('/enrollment/bulkupdate/:student_id', async (req, res) => {
  const { changes, admin_note } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const change of changes) {
      const [existing] = await conn.query(
        'SELECT enrollment_id FROM student_subject_enrollment WHERE student_id = ? AND subject_id = ?',
        [req.params.student_id, change.subject_id]
      );
      if (existing.length) {
        await conn.query(
          'UPDATE student_subject_enrollment SET status = ?, admin_modified = 1, is_draft = 0, admin_note = ? WHERE student_id = ? AND subject_id = ?',
          [change.status, admin_note || '', req.params.student_id, change.subject_id]
        );
      } else {
        await conn.query(
          'INSERT INTO student_subject_enrollment (student_id, subject_id, status, admin_modified, admin_note, is_draft) VALUES (?, ?, ?, 1, ?, 0)',
          [req.params.student_id, change.subject_id, change.status, admin_note || 'Added by admin']
        );
      }
    }
    await conn.commit();
    res.json({ message: `${changes.length} subject(s) updated successfully` });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
});

router.get('/enrollment/reset-check/:student_id', async (req, res) => {
  try {
    const [marks] = await db.query(
      `SELECT COUNT(*) as count FROM marks m
       JOIN student_subject_enrollment e ON m.student_id = e.student_id AND m.subject_id = e.subject_id
       WHERE m.student_id = ?`, [req.params.student_id]
    );
    const [attendance] = await db.query(
      `SELECT COUNT(*) as count FROM attendance a
       JOIN student_subject_enrollment e ON a.student_id = e.student_id AND a.subject_id = e.subject_id
       WHERE a.student_id = ?`, [req.params.student_id]
    );
    res.json({ marks: marks[0].count, attendance: attendance[0].count });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/enrollment/reset/:student_id', async (req, res) => {
  try {
    // Only reset current semester enrollment, not all semesters
    const [[student]] = await db.query('SELECT semester FROM students WHERE student_id = ?', [req.params.student_id]);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    await db.query(
      `DELETE e FROM student_subject_enrollment e
       JOIN subjects s ON e.subject_id = s.subject_id
       WHERE e.student_id = ? AND s.semester = ?`,
      [req.params.student_id, student.semester]
    );
    await db.query('UPDATE students SET enrollment_submitted = 0 WHERE student_id = ?', [req.params.student_id]);
    auditLog(req, 'ENROLLMENT_RESET', 'student_subject_enrollment', req.params.student_id);
    res.json({ message: 'Enrollment reset successfully!' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
