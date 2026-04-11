const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { verify } = require('../middleware/auth');

// ── LOGIN ───────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query(
      `SELECT fc.*, f.faculty_name
       FROM fee_clerks fc
       LEFT JOIN faculties f ON fc.faculty_id = f.faculty_id
       WHERE fc.email = ? AND fc.is_active = 1`, [email]
    );
    if (!rows.length) return res.status(404).json({ error: 'Fee Clerk not found' });
    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });
    const token = jwt.sign(
      { id: rows[0].fee_clerk_id, role: 'fee_clerk', scope: rows[0].scope, faculty_id: rows[0].faculty_id },
      process.env.JWT_SECRET, { expiresIn: '8h' }
    );
    const { password: _, ...data } = rows[0];
    res.json({ token, feeClerk: data });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── Middleware ───────────────────────────────────────────────────────────────
const feeClerkOnly = verify('fee_clerk', 'admin');

// Helper: build faculty filter if scope=FACULTY
const scopeFilter = (req) => {
  if (req.user.scope === 'FACULTY' && req.user.faculty_id) {
    return { clause: 'AND p.faculty_id = ?', params: [req.user.faculty_id] };
  }
  return { clause: '', params: [] };
};

// ── DASHBOARD STATS ─────────────────────────────────────────────────────────
router.get('/stats', feeClerkOnly, async (req, res) => {
  const sf = scopeFilter(req);
  try {
    const [[stats]] = await db.query(
      `SELECT
         COUNT(DISTINCT f.student_id) AS totalStudentsWithFees,
         COALESCE(SUM(f.amount), 0) AS totalAmount,
         COALESCE(SUM(CASE WHEN f.status='PAID' THEN f.amount ELSE 0 END), 0) AS paidAmount,
         COALESCE(SUM(CASE WHEN f.status='PENDING' THEN f.amount ELSE 0 END), 0) AS pendingAmount,
         COALESCE(SUM(CASE WHEN f.status='OVERDUE' THEN f.amount ELSE 0 END), 0) AS overdueAmount,
         COUNT(CASE WHEN f.status='PAID' THEN 1 END) AS paidCount,
         COUNT(CASE WHEN f.status='PENDING' THEN 1 END) AS pendingCount,
         COUNT(CASE WHEN f.status='OVERDUE' THEN 1 END) AS overdueCount
       FROM fees f
       JOIN students s ON f.student_id = s.student_id
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE 1=1 ${sf.clause}`, [...sf.params]
    );
    const [[{ totalStudents }]] = await db.query(
      `SELECT COUNT(*) AS totalStudents FROM students s
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE 1=1 ${sf.clause}`, [...sf.params]
    );
    res.json({ ...stats, totalStudents });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── FEE STRUCTURE — LIST ────────────────────────────────────────────────────
router.get('/structure', feeClerkOnly, async (req, res) => {
  const sf = scopeFilter(req);
  try {
    const [rows] = await db.query(
      `SELECT fs.*, p.programme_name, l.level_name, ay.year_label
       FROM fee_structure fs
       JOIN programmes p ON fs.programme_id = p.programme_id
       JOIN levels l ON fs.level_id = l.level_id
       JOIN academic_years ay ON fs.academic_year_id = ay.academic_year_id
       WHERE 1=1 ${sf.clause ? sf.clause.replace('p.faculty_id', 'p.faculty_id') : ''}
       ORDER BY ay.year_label DESC, p.programme_name, fs.fee_type`,
      [...sf.params]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── FEE STRUCTURE — ADD ─────────────────────────────────────────────────────
router.post('/structure', feeClerkOnly, async (req, res) => {
  const { academic_year_id, programme_id, level_id, fee_type, amount, due_date } = req.body;
  if (!academic_year_id || !programme_id || !level_id || !fee_type || !amount)
    return res.status(400).json({ error: 'All fields are required' });
  try {
    const [result] = await db.query(
      `INSERT INTO fee_structure (academic_year_id, programme_id, level_id, fee_type, amount, due_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [academic_year_id, programme_id, level_id, fee_type, Number(amount), due_date || null]
    );
    res.json({ message: 'Fee structure added', fee_structure_id: result.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── FEE STRUCTURE — UPDATE ──────────────────────────────────────────────────
router.put('/structure/:id', feeClerkOnly, async (req, res) => {
  const { fee_type, amount, due_date } = req.body;
  try {
    const [result] = await db.query(
      `UPDATE fee_structure SET fee_type=COALESCE(?,fee_type), amount=COALESCE(?,amount), due_date=COALESCE(?,due_date)
       WHERE fee_structure_id = ?`,
      [fee_type || null, amount ? Number(amount) : null, due_date || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Updated' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── FEE STRUCTURE — DELETE ──────────────────────────────────────────────────
router.delete('/structure/:id', feeClerkOnly, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM fee_structure WHERE fee_structure_id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── GENERATE FEES — Bulk create fee records from structure ──────────────────
router.post('/generate', feeClerkOnly, async (req, res) => {
  const { fee_structure_id } = req.body;
  if (!fee_structure_id) return res.status(400).json({ error: 'fee_structure_id required' });
  try {
    const [[fs]] = await db.query('SELECT * FROM fee_structure WHERE fee_structure_id = ?', [fee_structure_id]);
    if (!fs) return res.status(404).json({ error: 'Fee structure not found' });

    // Get all students in that programme + level
    const [students] = await db.query(
      `SELECT s.student_id FROM students s
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE s.programme_id = ? AND p.level_id = ?`, [fs.programme_id, fs.level_id]
    );

    if (!students.length) return res.status(400).json({ error: 'No students found for this programme/level' });

    // Check for duplicates
    const [existing] = await db.query(
      `SELECT student_id FROM fees WHERE fee_structure_id = ? AND academic_year_id = ?`,
      [fee_structure_id, fs.academic_year_id]
    );
    const existingSet = new Set(existing.map(e => e.student_id));

    const newStudents = students.filter(s => !existingSet.has(s.student_id));
    if (!newStudents.length) return res.json({ message: 'All students already have this fee', generated: 0 });

    const values = newStudents.map(s =>
      [s.student_id, fs.amount, fs.fee_type, fs.due_date, fee_structure_id, fs.academic_year_id]
    );
    await db.query(
      `INSERT INTO fees (student_id, amount, fee_type, due_date, fee_structure_id, academic_year_id)
       VALUES ?`, [values]
    );

    res.json({ message: `Fees generated for ${newStudents.length} students`, generated: newStudents.length, skipped: existingSet.size });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── ALL FEES (with student info) ────────────────────────────────────────────
router.get('/fees', feeClerkOnly, async (req, res) => {
  const sf = scopeFilter(req);
  const { status, programme_id, fee_type } = req.query;
  let extraClause = '';
  const extraParams = [];
  if (status) { extraClause += ' AND f.status = ?'; extraParams.push(status); }
  if (programme_id) { extraClause += ' AND s.programme_id = ?'; extraParams.push(programme_id); }
  if (fee_type) { extraClause += ' AND f.fee_type = ?'; extraParams.push(fee_type); }

  try {
    const [rows] = await db.query(
      `SELECT f.fee_id, f.student_id, s.roll_no,
              CONCAT(s.first_name,' ',COALESCE(s.last_name,'')) AS student_name,
              p.programme_name, s.semester,
              f.fee_type, f.amount, f.status, f.due_date, f.paid_date,
              f.transaction_ref, f.academic_year_id, ay.year_label
       FROM fees f
       JOIN students s ON f.student_id = s.student_id
       JOIN programmes p ON s.programme_id = p.programme_id
       LEFT JOIN academic_years ay ON f.academic_year_id = ay.academic_year_id
       WHERE 1=1 ${sf.clause} ${extraClause}
       ORDER BY f.status DESC, s.roll_no, f.fee_type`,
      [...sf.params, ...extraParams]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── COLLECT PAYMENT ─────────────────────────────────────────────────────────
router.put('/collect/:fee_id', feeClerkOnly, async (req, res) => {
  const { transaction_ref } = req.body;
  const txn = transaction_ref || ('RCP' + Date.now());
  try {
    const [result] = await db.query(
      `UPDATE fees SET status='PAID', paid_date=CURDATE(), transaction_ref=?
       WHERE fee_id = ? AND status != 'PAID'`,
      [txn, req.params.fee_id]
    );
    if (result.affectedRows === 0) return res.status(400).json({ error: 'Fee not found or already paid' });
    res.json({ message: 'Payment collected', transaction_ref: txn });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── WAIVE FEE ───────────────────────────────────────────────────────────────
router.put('/waive/:fee_id', feeClerkOnly, async (req, res) => {
  try {
    const [result] = await db.query(
      `UPDATE fees SET status='PAID', paid_date=CURDATE(), transaction_ref='WAIVED'
       WHERE fee_id = ? AND status != 'PAID'`,
      [req.params.fee_id]
    );
    if (result.affectedRows === 0) return res.status(400).json({ error: 'Fee not found or already paid' });
    res.json({ message: 'Fee waived' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── DEFAULTERS LIST ─────────────────────────────────────────────────────────
router.get('/defaulters', feeClerkOnly, async (req, res) => {
  const sf = scopeFilter(req);
  try {
    const [rows] = await db.query(
      `SELECT s.roll_no, CONCAT(s.first_name,' ',COALESCE(s.last_name,'')) AS student_name,
              p.programme_name, s.semester, s.phone, s.email,
              COUNT(f.fee_id) AS unpaid_count,
              SUM(f.amount) AS total_due
       FROM fees f
       JOIN students s ON f.student_id = s.student_id
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE f.status IN ('PENDING','OVERDUE') ${sf.clause}
       GROUP BY s.student_id
       ORDER BY total_due DESC`,
      [...sf.params]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── REPORTS — Programme-wise summary ────────────────────────────────────────
router.get('/reports/programme', feeClerkOnly, async (req, res) => {
  const sf = scopeFilter(req);
  try {
    const [rows] = await db.query(
      `SELECT p.programme_name,
              COUNT(DISTINCT f.student_id) AS students,
              SUM(f.amount) AS total,
              SUM(CASE WHEN f.status='PAID' THEN f.amount ELSE 0 END) AS collected,
              SUM(CASE WHEN f.status IN ('PENDING','OVERDUE') THEN f.amount ELSE 0 END) AS pending
       FROM fees f
       JOIN students s ON f.student_id = s.student_id
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE 1=1 ${sf.clause}
       GROUP BY p.programme_id
       ORDER BY p.programme_name`,
      [...sf.params]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── REPORTS — Fee-type summary ──────────────────────────────────────────────
router.get('/reports/fee-type', feeClerkOnly, async (req, res) => {
  const sf = scopeFilter(req);
  try {
    const [rows] = await db.query(
      `SELECT f.fee_type,
              COUNT(*) AS total_records,
              SUM(f.amount) AS total,
              SUM(CASE WHEN f.status='PAID' THEN f.amount ELSE 0 END) AS collected,
              SUM(CASE WHEN f.status IN ('PENDING','OVERDUE') THEN f.amount ELSE 0 END) AS pending
       FROM fees f
       JOIN students s ON f.student_id = s.student_id
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE 1=1 ${sf.clause}
       GROUP BY f.fee_type
       ORDER BY f.fee_type`,
      [...sf.params]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── SEARCH STUDENT ──────────────────────────────────────────────────────────
router.get('/search', feeClerkOnly, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Search query required' });
  const sf = scopeFilter(req);
  try {
    const [rows] = await db.query(
      `SELECT s.student_id, s.roll_no, CONCAT(s.first_name,' ',COALESCE(s.last_name,'')) AS student_name,
              p.programme_name, s.semester, s.phone, s.email
       FROM students s
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE (s.roll_no LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ? OR s.email LIKE ?)
       ${sf.clause}
       LIMIT 20`,
      [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, ...sf.params]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── STUDENT FEE HISTORY ─────────────────────────────────────────────────────
router.get('/student/:student_id', feeClerkOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT f.*, ay.year_label
       FROM fees f
       LEFT JOIN academic_years ay ON f.academic_year_id = ay.academic_year_id
       WHERE f.student_id = ?
       ORDER BY f.due_date DESC`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── ADD INDIVIDUAL FEE ──────────────────────────────────────────────────────
router.post('/fees', feeClerkOnly, async (req, res) => {
  const { student_id, amount, fee_type, due_date, academic_year_id } = req.body;
  if (!student_id || !amount || !fee_type || !due_date)
    return res.status(400).json({ error: 'student_id, amount, fee_type and due_date required' });
  try {
    const [result] = await db.query(
      `INSERT INTO fees (student_id, amount, fee_type, due_date, academic_year_id)
       VALUES (?, ?, ?, ?, ?)`,
      [student_id, Number(amount), fee_type, due_date, academic_year_id || null]
    );
    res.json({ message: 'Fee added', fee_id: result.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── PROGRAMMES LIST (for dropdowns) ─────────────────────────────────────────
router.get('/programmes', feeClerkOnly, async (req, res) => {
  const sf = scopeFilter(req);
  try {
    const [rows] = await db.query(
      `SELECT p.programme_id, p.programme_name, l.level_id, l.level_name
       FROM programmes p
       JOIN levels l ON p.level_id = l.level_id
       WHERE 1=1 ${sf.clause}
       ORDER BY p.programme_name`,
      [...sf.params]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── ACADEMIC YEARS (for dropdowns) ──────────────────────────────────────────
router.get('/academic-years', feeClerkOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM academic_years ORDER BY academic_year_id DESC');
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
