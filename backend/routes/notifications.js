const express = require('express');
const router = express.Router();
const db = require('../db');
const { verify } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// File upload config
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  }
});

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf'
]);

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Only images (JPEG, PNG, GIF, WebP) and PDF files are allowed'));
  }
});

const VALID_TARGETS = new Set(['all', 'class', 'subject']);

router.use(verify());

// POST / — Create notification
// target: 'all' (admin), 'class' (admin/teacher — programme+semester), 'subject' (teacher)
router.post('/', verify('admin', 'teacher'), upload.single('attachment'), async (req, res) => {
  const { title, message, subject_id, target, programme_id, target_semester } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message are required' });
  if (title.length > 200) return res.status(400).json({ error: 'Title must be under 200 characters' });
  if (message.length > 5000) return res.status(400).json({ error: 'Message must be under 5000 characters' });

  const t = target || (req.user.role === 'admin' ? 'all' : 'subject');
  if (!VALID_TARGETS.has(t)) return res.status(400).json({ error: 'Invalid target. Must be all, class, or subject' });

  // Validate target-specific fields
  if (t === 'subject') {
    if (!subject_id) return res.status(400).json({ error: 'Subject is required for subject-wise notification' });
    if (req.user.role === 'teacher') {
      const [owns] = await db.query(
        'SELECT 1 FROM subject_teachers WHERE subject_id = ? AND teacher_id = ?',
        [subject_id, req.user.id]
      );
      if (!owns.length) return res.status(403).json({ error: 'You are not assigned to this subject' });
    }
  }
  if (t === 'class') {
    if (!programme_id || !target_semester) return res.status(400).json({ error: 'Programme and semester are required for class-wise notification' });
  }
  if (t === 'all' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin can send to all students' });
  }

  try {
    const attachment_url = req.file ? `/uploads/${req.file.filename}` : null;
    const attachment_type = req.file ? (req.file.mimetype === 'application/pdf' ? 'pdf' : 'image') : null;
    const attachment_name = req.file ? req.file.originalname : null;
    const [result] = await db.query(
      `INSERT INTO notifications (title, message, attachment_url, attachment_type, attachment_name, created_by, sender_role, subject_id, target, programme_id, target_semester)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, message, attachment_url, attachment_type, attachment_name,
       req.user.id, req.user.role,
       t === 'subject' ? subject_id : null,
       t,
       t === 'class' ? programme_id : null,
       t === 'class' ? target_semester : null]
    );
    res.status(201).json({ message: 'Notification sent', notification_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET / — Admin notifications (all sent by admin)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT n.*, a.name AS admin_name, p.programme_name
       FROM notifications n
       LEFT JOIN admins a ON n.created_by = a.admin_id AND n.sender_role = 'admin'
       LEFT JOIN programmes p ON n.programme_id = p.programme_id
       WHERE n.sender_role = 'admin'
       ORDER BY n.created_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /teacher/my — Notifications sent by the logged-in teacher
router.get('/teacher/my', verify('teacher'), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT n.*, s.subject_name, s.subject_code, p.programme_name
       FROM notifications n
       LEFT JOIN subjects s ON n.subject_id = s.subject_id
       LEFT JOIN programmes p ON n.programme_id = p.programme_id
       WHERE n.sender_role = 'teacher' AND n.created_by = ?
       ORDER BY n.created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /student/all — All notifications visible to a student
router.get('/student/all', async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Students only' });
  try {
    // Pre-fetch student's programme + semester in one query instead of repeated subqueries
    const [[stu]] = await db.query(
      'SELECT programme_id, semester FROM students WHERE student_id = ?',
      [req.user.id]
    );
    if (!stu) return res.status(404).json({ error: 'Student not found' });

    const [rows] = await db.query(
      `SELECT n.*,
              a.name AS admin_name,
              CONCAT(t.first_name, ' ', t.last_name) AS teacher_name,
              s.subject_name, s.subject_code,
              p.programme_name
       FROM notifications n
       LEFT JOIN admins a ON n.created_by = a.admin_id AND n.sender_role = 'admin'
       LEFT JOIN teachers t ON n.created_by = t.teacher_id AND n.sender_role = 'teacher'
       LEFT JOIN subjects s ON n.subject_id = s.subject_id
       LEFT JOIN programmes p ON n.programme_id = p.programme_id
       WHERE
         (n.target = 'all')
         OR (n.target = 'class' AND n.programme_id = ? AND n.target_semester = ?)
         OR (n.target = 'subject' AND n.subject_id IN (
               SELECT subject_id FROM student_subject_enrollment
               WHERE student_id = ? AND status = 'ACCEPTED' AND is_draft = 0
             ))
       ORDER BY n.created_at DESC
       LIMIT 100`,
      [stu.programme_id, stu.semester, req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id — Delete notification (admin any, teacher own only)
router.delete('/:id', verify('admin', 'teacher'), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM notifications WHERE notification_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Notification not found' });

    if (req.user.role === 'teacher' && (rows[0].sender_role !== 'teacher' || rows[0].created_by !== req.user.id)) {
      return res.status(403).json({ error: 'You can only delete your own notifications' });
    }

    if (rows[0].attachment_url) {
      const filePath = path.join(__dirname, '..', rows[0].attachment_url);
      fs.unlink(filePath, () => {});
    }

    await db.query('DELETE FROM notifications WHERE notification_id = ?', [req.params.id]);
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handler for multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 5MB allowed.' });
    return res.status(400).json({ error: err.message });
  }
  if (err.message && err.message.includes('Only images')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
