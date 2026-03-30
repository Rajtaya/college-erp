const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { verify } = require('../middleware/auth');

router.use(verify());

// ── GET /student/:student_id — All fees for a student ──────────────────────
router.get('/student/:student_id', async (req, res) => {
  // Students can only view their own fees
  if (req.user.role === 'student' && req.user.id !== parseInt(req.params.student_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const [rows] = await db.query(
      'SELECT * FROM fees WHERE student_id = ? ORDER BY due_date DESC',
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── GET /student/:student_id/summary — Fee summary (total, paid, pending) ──
router.get('/student/:student_id/summary', async (req, res) => {
  // Students can only view their own fees
  if (req.user.role === 'student' && req.user.id !== parseInt(req.params.student_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const [rows] = await db.query(
      `SELECT
         COUNT(*) AS total_records,
         SUM(amount) AS total_amount,
         SUM(CASE WHEN status = 'PAID'    THEN amount ELSE 0 END) AS paid_amount,
         SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END) AS pending_amount,
         SUM(CASE WHEN status = 'OVERDUE' THEN amount ELSE 0 END) AS overdue_amount
       FROM fees WHERE student_id = ?`,
      [req.params.student_id]
    );
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── GET /student/:student_id/status — Detailed fee status using view ────────
router.get('/student/:student_id/status', async (req, res) => {
  // Students can only view their own fees
  if (req.user.role === 'student' && req.user.id !== parseInt(req.params.student_id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const [rows] = await db.query(
      `SELECT * FROM vw_fee_status_report
       WHERE student_id = ?
       ORDER BY due_date`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

const VALID_FEE_TYPES   = new Set(['TUITION','EXAM','LIBRARY','HOSTEL','TRANSPORT','OTHER']);
const VALID_FEE_STATUSES = new Set(['PENDING','PAID','OVERDUE','WAIVED']);

// ── POST / — Add fee record (admin only) ───────────────────────────────────
router.post('/', verify('admin'), async (req, res) => {
  const { student_id, amount, fee_type, due_date, fee_structure_id, academic_year_id } = req.body;
  if (!student_id || !amount || !fee_type || !due_date)
    return res.status(400).json({ error: 'student_id, amount, fee_type and due_date are required' });
  if (isNaN(Number(amount)) || Number(amount) <= 0 || Number(amount) > 1_000_000)
    return res.status(400).json({ error: 'Invalid fee amount' });
  if (!VALID_FEE_TYPES.has(fee_type))
    return res.status(400).json({ error: `Invalid fee_type. Must be one of: ${[...VALID_FEE_TYPES].join(', ')}` });
  try {
    const [result] = await db.query(
      `INSERT INTO fees (student_id, amount, fee_type, due_date, fee_structure_id, academic_year_id)
       VALUES (?,?,?,?,?,?)`,
      [student_id, Number(amount), fee_type, due_date,
       fee_structure_id || null, academic_year_id || null]
    );
    res.json({ message: 'Fee record added', fee_id: result.insertId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── PUT /pay/:fee_id — Mark fee as paid (admin only) ───────────────────────
router.put('/pay/:fee_id', verify('admin'), async (req, res) => {
  const { transaction_ref } = req.body;
  const txnRef = transaction_ref || ('TXN' + Date.now());
  try {
    const [result] = await db.query(
      `UPDATE fees
       SET status = 'PAID', paid_date = CURDATE(), transaction_ref = ?
       WHERE fee_id = ?`,
      [txnRef, req.params.fee_id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Fee record not found' });
    res.json({ message: 'Payment recorded', transaction_ref: txnRef });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── PUT /:fee_id — Update fee record details (admin only) ──────────────────
router.put('/:fee_id', verify('admin'), async (req, res) => {
  const { amount, fee_type, due_date, status } = req.body;
  if (amount !== undefined && (isNaN(Number(amount)) || Number(amount) <= 0 || Number(amount) > 1_000_000))
    return res.status(400).json({ error: 'Invalid fee amount' });
  if (fee_type !== undefined && !VALID_FEE_TYPES.has(fee_type))
    return res.status(400).json({ error: `Invalid fee_type. Must be one of: ${[...VALID_FEE_TYPES].join(', ')}` });
  if (status !== undefined && !VALID_FEE_STATUSES.has(status))
    return res.status(400).json({ error: `Invalid status. Must be one of: ${[...VALID_FEE_STATUSES].join(', ')}` });
  try {
    const [result] = await db.query(
      `UPDATE fees SET
         amount   = COALESCE(?, amount),
         fee_type = COALESCE(?, fee_type),
         due_date = COALESCE(?, due_date),
         status   = COALESCE(?, status)
       WHERE fee_id = ?`,
      [amount ? Number(amount) : null, fee_type ?? null, due_date ?? null, status ?? null, req.params.fee_id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Fee record not found' });
    res.json({ message: 'Fee updated' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// ── DELETE /:fee_id — Delete fee record (admin only) ───────────────────────
router.delete('/:fee_id', verify('admin'), async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM fees WHERE fee_id = ?', [req.params.fee_id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Fee record not found' });
    res.json({ message: 'Fee deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
