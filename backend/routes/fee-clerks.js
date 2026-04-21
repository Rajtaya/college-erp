const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { verify } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════════════════
// AUTH (from Patch A)
// ═══════════════════════════════════════════════════════════════════════════
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });
  try {
    const [rows] = await db.query(
      `SELECT fc.*, f.faculty_name
       FROM fee_clerks fc
       LEFT JOIN faculties f ON fc.faculty_id = f.faculty_id
       WHERE fc.email = ? AND fc.is_active = 1`, [email]
    );
    const hashToCheck = rows.length ? rows[0].password : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCheck);
    if (!rows.length || !valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (rows[0].password.startsWith('$2b$10$') || rows[0].password.startsWith('$2a$10$')) {
      const upgraded = await bcrypt.hash(password, 12);
      await db.query('UPDATE fee_clerks SET password = ? WHERE fee_clerk_id = ?',
        [upgraded, rows[0].fee_clerk_id]);
    }
    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { id: rows[0].fee_clerk_id, role: 'fee_clerk', scope: rows[0].scope, faculty_id: rows[0].faculty_id, jti },
      process.env.JWT_SECRET,
      { expiresIn: '8h', algorithm: 'HS256' }
    );
    const { password: _, ...data } = rows[0];
    res.json({ token, feeClerk: data });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE & HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const feeClerkOnly = verify('fee_clerk', 'admin');

const scopeFilter = (req) => {
  if (req.user.role === 'fee_clerk' && req.user.scope === 'FACULTY' && req.user.faculty_id) {
    return { clause: 'AND p.faculty_id = ?', params: [req.user.faculty_id] };
  }
  return { clause: '', params: [] };
};

const validateAmount = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, error: 'Amount must be a number' };
  if (n < 0) return { ok: false, error: 'Amount cannot be negative' };
  if (n > 10_000_000) return { ok: false, error: 'Amount exceeds maximum allowed (1 crore)' };
  return { ok: true, value: Math.round(n * 100) / 100 };
};

async function getFeeInScope(conn, fee_id, req) {
  const [rows] = await conn.query(
    `SELECT f.*, p.faculty_id AS _faculty_id
     FROM fees f
     JOIN students s ON f.student_id = s.student_id
     JOIN programmes p ON s.programme_id = p.programme_id
     WHERE f.fee_id = ? FOR UPDATE`, [fee_id]
  );
  if (!rows.length) return null;
  if (req.user.role === 'fee_clerk' && req.user.scope === 'FACULTY' &&
      rows[0]._faculty_id !== req.user.faculty_id) return null;
  return rows[0];
}

async function getStructureInScope(conn, fee_structure_id, req) {
  const [rows] = await conn.query(
    `SELECT fs.*, p.faculty_id AS _faculty_id
     FROM fee_structure fs
     JOIN programmes p ON fs.programme_id = p.programme_id
     WHERE fs.fee_structure_id = ?`, [fee_structure_id]
  );
  if (!rows.length) return null;
  if (req.user.role === 'fee_clerk' && req.user.scope === 'FACULTY' &&
      rows[0]._faculty_id !== req.user.faculty_id) return null;
  return rows[0];
}

async function studentInScope(conn, student_id, req) {
  const [rows] = await conn.query(
    `SELECT p.faculty_id FROM students s
     JOIN programmes p ON s.programme_id = p.programme_id
     WHERE s.student_id = ?`, [student_id]
  );
  if (!rows.length) return false;
  if (req.user.role === 'fee_clerk' && req.user.scope === 'FACULTY' &&
      rows[0].faculty_id !== req.user.faculty_id) return false;
  return true;
}

async function getOpenSession(conn, req) {
  if (req.user.role !== 'fee_clerk') return null;
  const [rows] = await conn.query(
    `SELECT session_id FROM cashier_sessions
     WHERE fee_clerk_id = ? AND status = 'OPEN' LIMIT 1`, [req.user.id]
  );
  return rows.length ? rows[0].session_id : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CASHIER SESSIONS
// ═══════════════════════════════════════════════════════════════════════════
router.post('/session/open', feeClerkOnly, async (req, res) => {
  if (req.user.role !== 'fee_clerk')
    return res.status(400).json({ error: 'Only fee clerks use sessions' });
  const { opening_notes } = req.body;
  try {
    const [existing] = await db.query(
      `SELECT session_id FROM cashier_sessions WHERE fee_clerk_id = ? AND status = 'OPEN'`,
      [req.user.id]
    );
    if (existing.length)
      return res.status(400).json({ error: 'You already have an open session', session_id: existing[0].session_id });

    const [result] = await db.query(
      `INSERT INTO cashier_sessions (fee_clerk_id, opening_notes) VALUES (?, ?)`,
      [req.user.id, opening_notes || null]
    );
    res.json({ message: 'Session opened', session_id: result.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/session/current', feeClerkOnly, async (req, res) => {
  if (req.user.role !== 'fee_clerk') return res.json({ session: null });
  try {
    const [rows] = await db.query(
      `SELECT * FROM cashier_sessions WHERE fee_clerk_id = ? AND status = 'OPEN' LIMIT 1`,
      [req.user.id]
    );
    if (!rows.length) return res.json({ session: null });
    const s = rows[0];
    const [[totals]] = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type='COLLECT' AND payment_method='CASH'      THEN amount ELSE 0 END),0) AS total_cash,
         COALESCE(SUM(CASE WHEN type='COLLECT' AND payment_method='UPI'       THEN amount ELSE 0 END),0) AS total_upi,
         COALESCE(SUM(CASE WHEN type='COLLECT' AND payment_method='NEFT_RTGS' THEN amount ELSE 0 END),0) AS total_neft_rtgs,
         COALESCE(SUM(CASE WHEN type='COLLECT' AND payment_method='CARD'      THEN amount ELSE 0 END),0) AS total_card,
         COALESCE(SUM(CASE WHEN type='COLLECT' THEN amount ELSE 0 END),0) AS total_collected,
         COALESCE(SUM(CASE WHEN type='WAIVE'   THEN amount ELSE 0 END),0) AS total_waived,
         COUNT(*) AS receipt_count
       FROM fee_payments WHERE session_id = ?`, [s.session_id]
    );
    res.json({ session: { ...s, ...totals } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/session/close', feeClerkOnly, async (req, res) => {
  if (req.user.role !== 'fee_clerk')
    return res.status(400).json({ error: 'Only fee clerks use sessions' });
  const { closing_notes } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [sessions] = await conn.query(
      `SELECT session_id FROM cashier_sessions WHERE fee_clerk_id = ? AND status = 'OPEN' FOR UPDATE`,
      [req.user.id]
    );
    if (!sessions.length) { await conn.rollback(); return res.status(400).json({ error: 'No open session' }); }
    const session_id = sessions[0].session_id;

    const [[totals]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type='COLLECT' AND payment_method='CASH'      THEN amount ELSE 0 END),0) AS total_cash,
         COALESCE(SUM(CASE WHEN type='COLLECT' AND payment_method='UPI'       THEN amount ELSE 0 END),0) AS total_upi,
         COALESCE(SUM(CASE WHEN type='COLLECT' AND payment_method='NEFT_RTGS' THEN amount ELSE 0 END),0) AS total_neft_rtgs,
         COALESCE(SUM(CASE WHEN type='COLLECT' AND payment_method='CARD'      THEN amount ELSE 0 END),0) AS total_card,
         COALESCE(SUM(CASE WHEN type='COLLECT' THEN amount ELSE 0 END),0) AS total_collected,
         COALESCE(SUM(CASE WHEN type='WAIVE'   THEN amount ELSE 0 END),0) AS total_waived,
         COUNT(*) AS receipt_count
       FROM fee_payments WHERE session_id = ?`, [session_id]
    );

    await conn.query(
      `UPDATE cashier_sessions
       SET status='CLOSED', closed_at=NOW(), closing_notes=?,
           total_cash=?, total_upi=?, total_neft_rtgs=?, total_card=?,
           total_collected=?, total_waived=?, receipt_count=?
       WHERE session_id = ?`,
      [closing_notes || null, totals.total_cash, totals.total_upi, totals.total_neft_rtgs,
       totals.total_card, totals.total_collected, totals.total_waived, totals.receipt_count, session_id]
    );
    await conn.commit();
    res.json({ message: 'Session closed', session_id, summary: totals });
  } catch (err) { await conn.rollback(); console.error(err); res.status(500).json({ error: 'Internal server error' }); }
    finally { conn.release(); }
});

router.get('/session/history', feeClerkOnly, async (req, res) => {
  try {
    const clause = req.user.role === 'fee_clerk' ? 'WHERE cs.fee_clerk_id = ?' : '';
    const params = req.user.role === 'fee_clerk' ? [req.user.id] : [];
    const [rows] = await db.query(
      `SELECT cs.*, fc.email AS fee_clerk_email
       FROM cashier_sessions cs
       JOIN fee_clerks fc ON cs.fee_clerk_id = fc.fee_clerk_id
       ${clause}
       ORDER BY cs.opened_at DESC LIMIT 100`, params
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
router.get('/stats', feeClerkOnly, async (req, res) => {
  const sf = scopeFilter(req);
  try {
    const [[stats]] = await db.query(
      `SELECT
         COUNT(DISTINCT f.student_id) AS totalStudentsWithFees,
         COALESCE(SUM(f.amount),0) AS totalAmount,
         COALESCE(SUM(CASE WHEN f.status='PAID'    THEN f.amount ELSE 0 END),0) AS paidAmount,
         COALESCE(SUM(CASE WHEN f.status='PENDING' THEN f.amount ELSE 0 END),0) AS pendingAmount,
         COALESCE(SUM(CASE WHEN f.status='OVERDUE' THEN f.amount ELSE 0 END),0) AS overdueAmount,
         COALESCE(SUM(CASE WHEN f.status='WAIVED'  THEN f.amount ELSE 0 END),0) AS waivedAmount,
         COUNT(CASE WHEN f.status='PAID'    THEN 1 END) AS paidCount,
         COUNT(CASE WHEN f.status='PENDING' THEN 1 END) AS pendingCount,
         COUNT(CASE WHEN f.status='OVERDUE' THEN 1 END) AS overdueCount,
         COUNT(CASE WHEN f.status='WAIVED'  THEN 1 END) AS waivedCount
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

// ═══════════════════════════════════════════════════════════════════════════
// FEE STRUCTURE (scope-enforced)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/structure', feeClerkOnly, async (req, res) => {
  const sf = scopeFilter(req);
  try {
    const [rows] = await db.query(
      `SELECT fs.*, p.programme_name, l.level_name, ay.year_label
       FROM fee_structure fs
       JOIN programmes p ON fs.programme_id = p.programme_id
       JOIN levels l ON fs.level_id = l.level_id
       JOIN academic_years ay ON fs.academic_year_id = ay.academic_year_id
       WHERE 1=1 ${sf.clause}
       ORDER BY ay.year_label DESC, p.programme_name, fs.fee_type`,
      [...sf.params]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/structure', feeClerkOnly, async (req, res) => {
  const { academic_year_id, programme_id, level_id, fee_type, amount, due_date } = req.body;
  if (!academic_year_id || !programme_id || !level_id || !fee_type || amount == null)
    return res.status(400).json({ error: 'All fields are required' });
  const amt = validateAmount(amount);
  if (!amt.ok) return res.status(400).json({ error: amt.error });

  try {
    if (req.user.role === 'fee_clerk' && req.user.scope === 'FACULTY') {
      const [prog] = await db.query(`SELECT faculty_id FROM programmes WHERE programme_id = ?`, [programme_id]);
      if (!prog.length || prog[0].faculty_id !== req.user.faculty_id)
        return res.status(403).json({ error: 'Programme is outside your faculty scope' });
    }
    const [result] = await db.query(
      `INSERT INTO fee_structure (academic_year_id, programme_id, level_id, fee_type, amount, due_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [academic_year_id, programme_id, level_id, fee_type, amt.value, due_date || null]
    );
    res.json({ message: 'Fee structure added', fee_structure_id: result.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.put('/structure/:id', feeClerkOnly, async (req, res) => {
  const { fee_type, amount, due_date } = req.body;
  let amt = null;
  if (amount != null) {
    const v = validateAmount(amount);
    if (!v.ok) return res.status(400).json({ error: v.error });
    amt = v.value;
  }
  const conn = await db.getConnection();
  try {
    const fs = await getStructureInScope(conn, req.params.id, req);
    if (!fs) return res.status(404).json({ error: 'Not found or out of scope' });
    const [result] = await conn.query(
      `UPDATE fee_structure SET
         fee_type = COALESCE(?, fee_type),
         amount   = COALESCE(?, amount),
         due_date = COALESCE(?, due_date)
       WHERE fee_structure_id = ?`,
      [fee_type || null, amt, due_date || null, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Updated' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
    finally { conn.release(); }
});

router.delete('/structure/:id', feeClerkOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const fs = await getStructureInScope(conn, req.params.id, req);
    if (!fs) return res.status(404).json({ error: 'Not found or out of scope' });
    const [result] = await conn.query('DELETE FROM fee_structure WHERE fee_structure_id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
    finally { conn.release(); }
});

// ═══════════════════════════════════════════════════════════════════════════
// BULK FEE GENERATION
// ═══════════════════════════════════════════════════════════════════════════
router.post('/generate', feeClerkOnly, async (req, res) => {
  const { fee_structure_id } = req.body;
  if (!fee_structure_id) return res.status(400).json({ error: 'fee_structure_id required' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const fs = await getStructureInScope(conn, fee_structure_id, req);
    if (!fs) { await conn.rollback(); return res.status(404).json({ error: 'Fee structure not found or out of scope' }); }

    const [students] = await conn.query(
      `SELECT s.student_id FROM students s
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE s.programme_id = ? AND p.level_id = ?`, [fs.programme_id, fs.level_id]
    );
    if (!students.length) { await conn.rollback(); return res.status(400).json({ error: 'No students found' }); }

    const [existing] = await conn.query(
      `SELECT student_id FROM fees WHERE fee_structure_id = ? AND academic_year_id = ?`,
      [fee_structure_id, fs.academic_year_id]
    );
    const existingSet = new Set(existing.map(e => e.student_id));
    const newStudents = students.filter(s => !existingSet.has(s.student_id));

    if (!newStudents.length) { await conn.commit(); return res.json({ message: 'All students already have this fee', generated: 0 }); }

    const values = newStudents.map(s =>
      [s.student_id, fs.amount, fs.fee_type, fs.due_date, fee_structure_id, fs.academic_year_id]
    );
    await conn.query(
      `INSERT INTO fees (student_id, amount, fee_type, due_date, fee_structure_id, academic_year_id)
       VALUES ?`, [values]
    );
    await conn.commit();
    res.json({ message: `Fees generated for ${newStudents.length} students`,
               generated: newStudents.length, skipped: existingSet.size });
  } catch (err) { await conn.rollback(); console.error(err); res.status(500).json({ error: 'Internal server error' }); }
    finally { conn.release(); }
});

// ═══════════════════════════════════════════════════════════════════════════
// FEES LIST
// ═══════════════════════════════════════════════════════════════════════════
router.get('/fees', feeClerkOnly, async (req, res) => {
  const sf = scopeFilter(req);
  const { status, programme_id, fee_type } = req.query;
  let extraClause = '';
  const extraParams = [];
  if (status)       { extraClause += ' AND f.status = ?';       extraParams.push(status); }
  if (programme_id) { extraClause += ' AND s.programme_id = ?'; extraParams.push(programme_id); }
  if (fee_type)     { extraClause += ' AND f.fee_type = ?';     extraParams.push(fee_type); }

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
       ORDER BY f.status DESC, s.roll_no, f.fee_type
       LIMIT 2000`,
      [...sf.params, ...extraParams]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// COLLECT — requires payment_method, inserts into fee_payments
// ═══════════════════════════════════════════════════════════════════════════
router.put('/collect/:fee_id', feeClerkOnly, async (req, res) => {
  const { payment_method, reference_details } = req.body;
  const validMethods = ['CASH', 'UPI', 'NEFT_RTGS', 'CARD'];
  if (!payment_method || !validMethods.includes(payment_method))
    return res.status(400).json({ error: `payment_method must be one of: ${validMethods.join(', ')}` });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const fee = await getFeeInScope(conn, req.params.fee_id, req);
    if (!fee) { await conn.rollback(); return res.status(404).json({ error: 'Fee not found or out of scope' }); }
    if (fee.status === 'PAID' || fee.status === 'WAIVED') {
      await conn.rollback();
      return res.status(400).json({ error: `Fee already ${fee.status}` });
    }

    let session_id = null;
    if (req.user.role === 'fee_clerk') {
      session_id = await getOpenSession(conn, req);
      if (!session_id) { await conn.rollback(); return res.status(400).json({ error: 'No open cashier session — open a session first' }); }
    }

    const txn = 'RCP-' + crypto.randomUUID();
    await conn.query(
      `INSERT INTO fee_payments
         (fee_id, session_id, type, amount, payment_method, transaction_ref,
          reference_details, collected_by, collected_by_role)
       VALUES (?, ?, 'COLLECT', ?, ?, ?, ?, ?, ?)`,
      [fee.fee_id, session_id, fee.amount, payment_method, txn,
       reference_details || null, req.user.id, req.user.role]
    );
    await conn.query(
      `UPDATE fees SET status='PAID', paid_date=CURDATE(), transaction_ref=?
       WHERE fee_id = ?`, [txn, fee.fee_id]
    );
    await conn.commit();
    res.json({ message: 'Payment collected', transaction_ref: txn, amount: fee.amount });
  } catch (err) { await conn.rollback(); console.error(err); res.status(500).json({ error: 'Internal server error' }); }
    finally { conn.release(); }
});

// ═══════════════════════════════════════════════════════════════════════════
// WAIVE — requires reason (≥10 chars)
// ═══════════════════════════════════════════════════════════════════════════
router.put('/waive/:fee_id', feeClerkOnly, async (req, res) => {
  const { reason } = req.body;
  if (!reason || reason.trim().length < 10)
    return res.status(400).json({ error: 'Reason is required (minimum 10 characters)' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const fee = await getFeeInScope(conn, req.params.fee_id, req);
    if (!fee) { await conn.rollback(); return res.status(404).json({ error: 'Fee not found or out of scope' }); }
    if (fee.status === 'PAID' || fee.status === 'WAIVED') {
      await conn.rollback();
      return res.status(400).json({ error: `Fee already ${fee.status}` });
    }

    let session_id = null;
    if (req.user.role === 'fee_clerk') {
      session_id = await getOpenSession(conn, req);
      if (!session_id) { await conn.rollback(); return res.status(400).json({ error: 'No open cashier session — open a session first' }); }
    }

    const txn = 'WVR-' + crypto.randomUUID();
    await conn.query(
      `INSERT INTO fee_payments
         (fee_id, session_id, type, amount, payment_method, transaction_ref,
          reason, collected_by, collected_by_role)
       VALUES (?, ?, 'WAIVE', ?, 'WAIVER', ?, ?, ?, ?)`,
      [fee.fee_id, session_id, fee.amount, txn, reason.trim(), req.user.id, req.user.role]
    );
    await conn.query(
      `UPDATE fees SET status='WAIVED', paid_date=CURDATE(), transaction_ref=?
       WHERE fee_id = ?`, [txn, fee.fee_id]
    );
    await conn.commit();
    res.json({ message: 'Fee waived', transaction_ref: txn });
  } catch (err) { await conn.rollback(); console.error(err); res.status(500).json({ error: 'Internal server error' }); }
    finally { conn.release(); }
});

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT HISTORY
// ═══════════════════════════════════════════════════════════════════════════
router.get('/payments/:fee_id', feeClerkOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const fee = await getFeeInScope(conn, req.params.fee_id, req);
    if (!fee) return res.status(404).json({ error: 'Fee not found or out of scope' });

    const [rows] = await db.query(
      `SELECT fp.*,
              CASE fp.collected_by_role
                WHEN 'fee_clerk' THEN (SELECT email FROM fee_clerks WHERE fee_clerk_id = fp.collected_by)
                WHEN 'admin'     THEN 'admin'
              END AS collected_by_email
       FROM fee_payments fp
       WHERE fp.fee_id = ?
       ORDER BY fp.created_at DESC`, [req.params.fee_id]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
    finally { conn.release(); }
});

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULTERS
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════
router.get('/reports/programme', feeClerkOnly, async (req, res) => {
  const sf = scopeFilter(req);
  try {
    const [rows] = await db.query(
      `SELECT p.programme_name,
              COUNT(DISTINCT f.student_id) AS students,
              SUM(f.amount) AS total,
              SUM(CASE WHEN f.status='PAID'   THEN f.amount ELSE 0 END) AS collected,
              SUM(CASE WHEN f.status='WAIVED' THEN f.amount ELSE 0 END) AS waived,
              SUM(CASE WHEN f.status IN ('PENDING','OVERDUE') THEN f.amount ELSE 0 END) AS pending
       FROM fees f
       JOIN students s ON f.student_id = s.student_id
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE 1=1 ${sf.clause}
       GROUP BY p.programme_id
       ORDER BY p.programme_name`, [...sf.params]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/reports/fee-type', feeClerkOnly, async (req, res) => {
  const sf = scopeFilter(req);
  try {
    const [rows] = await db.query(
      `SELECT f.fee_type,
              COUNT(*) AS total_records,
              SUM(f.amount) AS total,
              SUM(CASE WHEN f.status='PAID'   THEN f.amount ELSE 0 END) AS collected,
              SUM(CASE WHEN f.status='WAIVED' THEN f.amount ELSE 0 END) AS waived,
              SUM(CASE WHEN f.status IN ('PENDING','OVERDUE') THEN f.amount ELSE 0 END) AS pending
       FROM fees f
       JOIN students s ON f.student_id = s.student_id
       JOIN programmes p ON s.programme_id = p.programme_id
       WHERE 1=1 ${sf.clause}
       GROUP BY f.fee_type
       ORDER BY f.fee_type`, [...sf.params]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// STUDENT FEE HISTORY (scope-enforced)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/student/:student_id', feeClerkOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const ok = await studentInScope(conn, req.params.student_id, req);
    if (!ok) return res.status(404).json({ error: 'Student not found or out of scope' });
    const [rows] = await conn.query(
      `SELECT f.*, ay.year_label
       FROM fees f
       LEFT JOIN academic_years ay ON f.academic_year_id = ay.academic_year_id
       WHERE f.student_id = ?
       ORDER BY f.due_date DESC`, [req.params.student_id]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
    finally { conn.release(); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADD INDIVIDUAL FEE (scope + amount validation)
// ═══════════════════════════════════════════════════════════════════════════
router.post('/fees', feeClerkOnly, async (req, res) => {
  const { student_id, amount, fee_type, due_date, academic_year_id } = req.body;
  if (!student_id || amount == null || !fee_type || !due_date)
    return res.status(400).json({ error: 'student_id, amount, fee_type and due_date required' });
  const amt = validateAmount(amount);
  if (!amt.ok) return res.status(400).json({ error: amt.error });

  const conn = await db.getConnection();
  try {
    const ok = await studentInScope(conn, student_id, req);
    if (!ok) return res.status(403).json({ error: 'Student is outside your scope' });

    const [result] = await conn.query(
      `INSERT INTO fees (student_id, amount, fee_type, due_date, academic_year_id)
       VALUES (?, ?, ?, ?, ?)`,
      [student_id, amt.value, fee_type, due_date, academic_year_id || null]
    );
    res.json({ message: 'Fee added', fee_id: result.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
    finally { conn.release(); }
});

// ═══════════════════════════════════════════════════════════════════════════
// DROPDOWNS
// ═══════════════════════════════════════════════════════════════════════════
router.get('/programmes', feeClerkOnly, async (req, res) => {
  const sf = scopeFilter(req);
  try {
    const [rows] = await db.query(
      `SELECT p.programme_id, p.programme_name, l.level_id, l.level_name
       FROM programmes p
       JOIN levels l ON p.level_id = l.level_id
       WHERE 1=1 ${sf.clause}
       ORDER BY p.programme_name`, [...sf.params]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/academic-years', feeClerkOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM academic_years ORDER BY academic_year_id DESC');
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
