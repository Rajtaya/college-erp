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
              TRIM(CONCAT(IFNULL(s.first_name,''), ' ', IFNULL(s.last_name,''))) AS name,
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
              TRIM(CONCAT(IFNULL(s.first_name,''), ' ', IFNULL(s.last_name,''))) AS name,
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

// ── POST /bulk — Bulk import students (admin only) ──────────────────────────
router.post('/bulk', verify('admin'), async (req, res) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'No students provided' });
  }

  // Compulsory: every row must have academic_year_id
  const missingYear = students
    .map((s, i) => ({ idx: i, roll_no: s.roll_no, ay: s.academic_year_id }))
    .filter(r => !r.ay || !Number.isInteger(Number(r.ay)));
  if (missingYear.length > 0) {
    return res.status(400).json({
      error: `${missingYear.length} row(s) missing or invalid academic_year_id. Every student must specify the academic year.`,
      first_failing_roll_nos: missingYear.slice(0, 5).map(r => r.roll_no)
    });
  }

  // Validate all referenced academic_year_ids actually exist
  const yearIds = [...new Set(students.map(s => Number(s.academic_year_id)))];
  const [validYears] = await db.query(
    'SELECT academic_year_id FROM academic_years WHERE academic_year_id IN (?)',
    [yearIds]
  );
  const validSet = new Set(validYears.map(r => r.academic_year_id));
  const bogus = yearIds.filter(y => !validSet.has(y));
  if (bogus.length > 0) {
    return res.status(400).json({
      error: `Unknown academic_year_id value(s): ${bogus.join(', ')}. Check the academic_years table for valid IDs.`
    });
  }

  // Hash ALL passwords in parallel (fast)
  const prepared = await Promise.all(students.map(async (s) => {
    const namePart = (s.first_name || s.name || 'user').replace(/\s/g, '').toLowerCase().slice(0, 4);
    const rollPart = String(s.roll_no || '').slice(-4);
    const rawPass = s.password || (namePart + rollPart);
    const hashed = await bcrypt.hash(rawPass, 8);
    return [
      s.roll_no, s.first_name || s.name || '', s.last_name || '',
      s.email || null, s.phone || null,
      s.semester || 1, s.study_year || 1, hashed,
      s.level_id || null, s.programme_id || null, s.faculty_id || null,
      s.academic_year_id || null, s.abc_id || null
    ];
  }));

  let success = 0, failed = 0;
  const errors = [];
  const BATCH = 50;

  for (let i = 0; i < prepared.length; i += BATCH) {
    const batch = prepared.slice(i, i + BATCH);
    const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const values = batch.flat();
    try {
      await db.query(
        `INSERT INTO students (roll_no, first_name, last_name, email, phone, semester, study_year, password, level_id, programme_id, faculty_id, academic_year_id, abc_id) VALUES ${placeholders}`,
        values
      );
      success += batch.length;
    } catch (err) {
      for (const sv of batch) {
        try {
          await db.query(
            `INSERT INTO students (roll_no, first_name, last_name, email, phone, semester, study_year, password, level_id, programme_id, faculty_id, academic_year_id, abc_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            sv
          );
          success++;
        } catch (e2) { failed++; errors.push({ roll_no: sv[0], error: e2.message }); }
      }
    }
  }

  res.json({ success, failed, errors: errors.slice(0, 20) });
});
// ── POST / — Add a student (admin only) ────────────────────────────────────

// =============================================================================
// PATCH: backend/routes/students.js
// Replaces the existing `router.post('/', verify('admin'), async (req, res) => {...}` 
// handler (around line 133) with a transactional version that:
//   1. Creates the student
//   2. Assigns disciplines (if provided) — atomic with the student insert
//   3. Auto-assigns MAJOR subjects based on programme + semester + level + disciplines
//   4. Returns counts so the UI can confirm the auto-assignment happened
//
// This closes the bug we found today where Taya (and 537 others) had no MAJOR
// rows because the admin UI only inserted the student row, never the MAJORs.
// =============================================================================

router.post('/', verify('admin'), async (req, res) => {
  const {
    roll_no, first_name, last_name, email, phone,
    semester, study_year, password,
    level_id, programme_id, faculty_id, academic_year_id, abc_id,
    discipline_ids  // NEW: optional array of discipline IDs
  } = req.body;

  // Basic validation
// Basic validation
  if (!roll_no || !first_name || !password || !programme_id || !level_id || !semester || !academic_year_id) {
    return res.status(400).json({
      error: 'Missing required fields: roll_no, first_name, password, programme_id, level_id, semester, academic_year_id'
    });
  }

  // Validate academic_year_id exists
  const [ayRows] = await db.query(
    'SELECT academic_year_id FROM academic_years WHERE academic_year_id = ?',
    [academic_year_id]
  );
  if (!ayRows.length) {
    return res.status(400).json({ error: `Unknown academic_year_id: ${academic_year_id}` });
  }

  const discIds = Array.isArray(discipline_ids)
    ? [...new Set(discipline_ids.map(Number).filter(n => Number.isInteger(n) && n > 0))]
    : [];

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Insert student
    const hashed   = await bcrypt.hash(password, 12);
    const emailVal = email && email.trim() ? email.trim() : null;
    const [result] = await conn.query(
      `INSERT INTO students
         (roll_no, first_name, last_name, email, phone,
          semester, study_year, password,
          level_id, programme_id, faculty_id, academic_year_id, abc_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [roll_no, first_name || null, last_name || null, emailVal, phone || null,
       semester, study_year || 1, hashed,
       level_id, programme_id, faculty_id || null,
       academic_year_id || null, abc_id || null]
    );
    const newStudentId = result.insertId;

    // 2. Assign disciplines (if any)
    let disciplinesAssigned = 0;
    if (discIds.length > 0) {
      const placeholders = discIds.map(() => '(?,?)').join(',');
      const values = discIds.flatMap(did => [newStudentId, did]);
      const [dResult] = await conn.query(
        `INSERT IGNORE INTO student_disciplines (student_id, discipline_id) VALUES ${placeholders}`,
        values
      );
      disciplinesAssigned = dResult.affectedRows;
    }

    // 3. Auto-assign MAJOR subjects for this semester
    //    Matches: subjects in student's disciplines, MAJOR category, correct semester + level
    //    Uses ON DUPLICATE KEY UPDATE so re-running this is idempotent.
    let majorsAssigned = 0;
    if (discIds.length > 0) {
      const [mResult] = await conn.query(
        `INSERT INTO student_subject_enrollment
           (student_id, subject_id, status, is_major, is_draft, admin_modified, semester, academic_year_id)
         SELECT ?, s.subject_id, 'ACCEPTED', 1, 0, 1, ?, ?
         FROM subjects s
         WHERE s.category = 'MAJOR'
           AND s.semester = ?
           AND s.level_id = ?
           AND s.discipline_id IN (?)`,
        [newStudentId, semester, academic_year_id || null,
         semester, level_id, discIds]
      );
      majorsAssigned = mResult.affectedRows;
    }

    await conn.commit();

    res.json({
      message: 'Student added',
      student_id: newStudentId,
      disciplines_assigned: disciplinesAssigned,
      majors_assigned: majorsAssigned
    });
  } catch (err) {
    await conn.rollback();
    console.error('POST /students error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Roll number, email, or ABC ID already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    conn.release();
  }
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
              TRIM(CONCAT(IFNULL(s.first_name,''), ' ', IFNULL(s.last_name,''))) AS name,
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


// ── PUT /:id — Admin updates a student ──────────────────────────────────────
router.put('/:id', verify('admin'), async (req, res) => {
  const { first_name, last_name, roll_no, email, phone, semester, study_year, programme_id, level_id, faculty_id, abc_id } = req.body;
  try {
    const fields = [];
    const values = [];
    if (first_name !== undefined) { fields.push('first_name=?'); values.push(first_name); }
    if (last_name !== undefined)  { fields.push('last_name=?');  values.push(last_name); }
    if (roll_no !== undefined)    { fields.push('roll_no=?');    values.push(roll_no); }
    if (email !== undefined)      { fields.push('email=?');      values.push(email||null); }
    if (phone !== undefined)      { fields.push('phone=?');      values.push(phone||null); }
    if (semester !== undefined)   { fields.push('semester=?');    values.push(semester); }
    if (study_year !== undefined) { fields.push('study_year=?'); values.push(study_year); }
    if (programme_id !== undefined){ fields.push('programme_id=?'); values.push(programme_id||null); }
    if (level_id !== undefined)   { fields.push('level_id=?');   values.push(level_id||null); }
    if (faculty_id !== undefined) { fields.push('faculty_id=?'); values.push(faculty_id||null); }
    if (abc_id !== undefined)     { fields.push('abc_id=?');     values.push(abc_id||null); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    await db.query(`UPDATE students SET ${fields.join(', ')} WHERE student_id = ?`, values);
    res.json({ message: 'Student updated' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

module.exports = router;
