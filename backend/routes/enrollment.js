const express = require('express');
const router = express.Router();
const db = require('../db');
const { verify } = require('../middleware/auth');

router.use(verify());

// ─── Helpers ──────────────────────────────────────────────────────────────────

const canAccessStudent = (req, res, paramId) => {
  if (req.user.role === 'student' && req.user.id !== parseInt(paramId)) {
    res.status(403).json({ error: 'Forbidden: you can only access your own data' });
    return false;
  }
  return true;
};

// Fetch student with level, programme scheme, and discipline info
const getStudent = async (student_id) => {
  const [rows] = await db.query(
    `SELECT s.*, l.level_name, p.scheme, p.programme_name
     FROM students s
     LEFT JOIN levels l ON s.level_id = l.level_id
     LEFT JOIN programmes p ON s.programme_id = p.programme_id
     WHERE s.student_id = ?`,
    [student_id]
  );
  return rows[0] || null;
};

// Get student's assigned disciplines (for Scheme A/B)
const getStudentDisciplines = async (student_id) => {
  const [rows] = await db.query(
    `SELECT discipline_id FROM student_disciplines WHERE student_id = ?`,
    [student_id]
  );
  return rows.map(r => r.discipline_id);
};

// Strip trailing T or P to get base subject code
const getBaseCode = (code) => {
  const c = code.trim();
  const last = c.slice(-1).toUpperCase();
  return ['T', 'P'].includes(last) ? c.slice(0, -1) : c;
};

// VAC semesters per scheme
// Scheme A: Sem 1, 2 only
// Scheme B: Sem 1, 2, 4
// Scheme C: Sem 1, 2, 3, 4
// Scheme D: Sem 1, 2 only
const VAC_SEMESTERS = {
  A: [1, 2],
  B: [1, 2, 4],
  C: [1, 2, 3, 4],
  D: [1, 2],
};

// Fixed PG categories — student cannot reject
const PG_FIXED = new Set(['MAJOR', 'SEMINAR', 'INTERNSHIP']);

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /enrollment/students/:subject_id — teacher/admin only
router.get('/students/:subject_id', verify('teacher', 'admin'), async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.student_id, CONCAT(s.first_name, ' ', s.last_name) AS name, s.roll_no
       FROM student_subject_enrollment e
       JOIN students s ON e.student_id = s.student_id
       WHERE e.subject_id = ? AND e.status = 'ACCEPTED'
       ORDER BY s.roll_no`,
      [req.params.subject_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// GET /enrollment/subjects/:student_id
router.get('/subjects/:student_id', async (req, res) => {
  if (!canAccessStudent(req, res, req.params.student_id)) return;
  try {
    const student = await getStudent(req.params.student_id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const isPG   = student.level_name === 'PG';
    const scheme = student.scheme || 'A';

    // Get discipline IDs from student's ACCEPTED MAJOR subjects
    // This is used to EXCLUDE from MDC/MIC (student cannot pick same discipline as their major)
    let majorDisciplineIds = [];
    if (!isPG) {
      const [majDisc] = await db.query(
        `SELECT DISTINCT sub.discipline_id
         FROM student_subject_enrollment e
         JOIN subjects sub ON e.subject_id = sub.subject_id
         WHERE e.student_id = ? AND sub.category = 'MAJOR'
           AND e.status = 'ACCEPTED' AND sub.discipline_id IS NOT NULL`,
        [req.params.student_id]
      );
      majorDisciplineIds = majDisc.map(r => r.discipline_id);

      // Fallback: if no accepted major yet, use programme's discipline
      if (majorDisciplineIds.length === 0) {
        const [progDisc] = await db.query(
          `SELECT DISTINCT s.discipline_id
           FROM subjects s
           WHERE s.programme_id = ? AND s.category = 'MAJOR' AND s.discipline_id IS NOT NULL`,
          [student.programme_id]
        );
        majorDisciplineIds = progDisc.map(r => r.discipline_id);
      }
    }

    // PG: subjects from programme_subject_pool
    // UG: MAJOR from programme, common subjects by level
    const [subjects] = await db.query(
      isPG
        ? `SELECT s.subject_id, s.subject_code, s.subject_name, s.category,
                  s.semester, s.credits, s.internal_marks,
                  s.level_id, s.programme_id, s.faculty_id,
                  s.discipline_id, s.is_common, d.discipline_name,
                  e.enrollment_id, e.status AS enrollment_status,
                  e.is_major, e.remarks, e.admin_modified
           FROM subjects s
           JOIN programme_subject_pool psp
             ON s.subject_id = psp.subject_id AND psp.programme_id = ?
           LEFT JOIN disciplines d ON s.discipline_id = d.discipline_id
           LEFT JOIN student_subject_enrollment e
             ON s.subject_id = e.subject_id AND e.student_id = ?
           WHERE s.semester = ?
           ORDER BY s.category, s.subject_code`
        : `SELECT s.subject_id, s.subject_code, s.subject_name, s.category,
                  s.semester, s.credits, s.internal_marks,
                  s.level_id, s.programme_id, s.faculty_id,
                  s.discipline_id, s.is_common, d.discipline_name,
                  e.enrollment_id, e.status AS enrollment_status,
                  e.is_major, e.remarks, e.admin_modified
           FROM subjects s
           LEFT JOIN disciplines d ON s.discipline_id = d.discipline_id
           LEFT JOIN student_subject_enrollment e
             ON s.subject_id = e.subject_id AND e.student_id = ?
           LEFT JOIN programme_subject_pool psp
             ON psp.subject_id = s.subject_id AND psp.programme_id = ?
           WHERE s.semester = ?
             AND (
               -- MAJOR: only from student's programme
               (s.category = 'MAJOR' AND s.programme_id = ?)
               OR (
                 s.category != 'MAJOR' AND s.is_common = TRUE AND s.level_id = ?
                 AND (
                   -- VAC, AEC, SEC: show ALL (no discipline restriction)
                   s.category IN ('VAC', 'AEC', 'SEC')
                   OR
                   -- MDC: exclude student's MAJOR discipline subjects
                   (s.category = 'MDC' AND (? = 0 OR s.discipline_id NOT IN (?)))
                   OR
                   -- MIC: exclude student's MAJOR discipline subjects
                   (s.category = 'MIC' AND (? = 0 OR s.discipline_id NOT IN (?)))
                   OR
                   -- Everything else: show all
                   (s.category NOT IN ('VAC','AEC','SEC','MDC','MIC'))
                 )
               )
               OR (psp.id IS NOT NULL)
             )
           ORDER BY s.category, s.subject_code`,
      isPG
        ? [student.programme_id, req.params.student_id, student.semester]
        : [req.params.student_id, student.programme_id, student.semester,
           student.programme_id,
           student.level_id,
           majorDisciplineIds.length, majorDisciplineIds.length ? majorDisciplineIds : [0],
           majorDisciplineIds.length, majorDisciplineIds.length ? majorDisciplineIds : [0]]
    );

    // Add T/P pairing info for MDC, SEC, MAJOR
    const enriched = subjects.map(sub => {
      let pair_code = null;
      let pair_type = null;
      if (['MDC', 'SEC', 'MAJOR'].includes(sub.category)) {
        const code = sub.subject_code.trim();
        const lastChar = code.slice(-1).toUpperCase();
        if (lastChar === 'T') {
          const pCode = code.slice(0, -1) + 'P';
          const pair = subjects.find(s2 => s2.subject_code.trim() === pCode && s2.category === sub.category);
          if (pair) { pair_code = pCode; pair_type = 'THEORY'; }
        } else if (lastChar === 'P') {
          const tCode = code.slice(0, -1) + 'T';
          const pair = subjects.find(s2 => s2.subject_code.trim() === tCode && s2.category === sub.category);
          if (pair) { pair_code = tCode; pair_type = 'PRACTICAL'; }
        }
      }
      return { ...sub, pair_code, pair_type, scheme };
    });

    res.json(enriched);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// GET /enrollment/status/:student_id
router.get('/status/:student_id', async (req, res) => {
  if (!canAccessStudent(req, res, req.params.student_id)) return;
  try {
    const [rows] = await db.query(
      `SELECT e.*, e.is_draft, s.subject_code, s.subject_name, s.category,
              s.credits, s.internal_marks, d.discipline_name
       FROM student_subject_enrollment e
       JOIN subjects s ON e.subject_id = s.subject_id
       LEFT JOIN disciplines d ON s.discipline_id = d.discipline_id
       WHERE e.student_id = ?
       ORDER BY s.category, s.subject_code`,
      [req.params.student_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// POST /enrollment/save-draft/:student_id
router.post('/save-draft/:student_id', verify('student', 'admin'), async (req, res) => {
  if (!canAccessStudent(req, res, req.params.student_id)) return;
  const { decisions } = req.body;
  try {
    const [studentRows] = await db.query(
      'SELECT student_id FROM students WHERE student_id = ?', [req.params.student_id]
    );
    if (!studentRows.length) return res.status(404).json({ error: 'Student not found' });
    // Check for non-draft submitted records instead of relying on flag
    // Exclude admin-modified records — those shouldn't lock student enrollment
    const [submittedCheck] = await db.query(
      'SELECT COUNT(*) as count FROM student_subject_enrollment WHERE student_id = ? AND is_draft = 0 AND admin_modified = 0',
      [req.params.student_id]
    );
    if (submittedCheck[0].count > 0)
      return res.status(400).json({ error: 'Enrollment already submitted and locked' });

    if (decisions.length > 0) {
      // Batch INSERT — single query instead of one per subject
      const placeholders = decisions.map(() => '(?,?,?,?,?,1)').join(',');
      const values = decisions.flatMap(d => [
        req.params.student_id, d.subject_id,
        d.status || 'PENDING', d.is_major || 0, d.remarks || null
      ]);
      await db.query(
        `INSERT INTO student_subject_enrollment
           (student_id, subject_id, status, is_major, remarks, is_draft)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           status=VALUES(status), is_major=VALUES(is_major),
           remarks=VALUES(remarks), is_draft=1`,
        values
      );
    }
    res.json({ message: 'Draft saved successfully' });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// POST /enrollment/submit/:student_id
router.post('/submit/:student_id', verify('student', 'admin'), async (req, res) => {
  if (!canAccessStudent(req, res, req.params.student_id)) return;
  const { enrollments } = req.body;
  try {
    const student = await getStudent(req.params.student_id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const isPG   = student.level_name === 'PG';
    const scheme = student.scheme || 'A';
    const sem    = student.semester;

    // Block re-submission — only block if student has already submitted (not admin-modified)
    const [existing] = await db.query(
      'SELECT COUNT(*) AS count FROM student_subject_enrollment WHERE student_id = ? AND is_draft = 0 AND admin_modified = 0',
      [req.params.student_id]
    );
    if (existing[0].count > 0) {
      return res.status(400).json({ error: 'Already submitted. Contact admin to reset.' });
    }

    // Load full details for ALL subjects to check categories (including pending DEC)
    const DEC_CATS = new Set(['ELECTIVE_FINANCE','ELECTIVE_HR','ELECTIVE_MARKETING']);
    const allSubjectIds = enrollments.map(e => e.subject_id);
    let allSubjectMeta = [];
    if (allSubjectIds.length > 0) {
      const [metaRows] = await db.query(
        'SELECT subject_id, category FROM subjects WHERE subject_id IN (?)',
        [allSubjectIds]
      );
      allSubjectMeta = metaRows;
    }
    // Only non-DEC pending subjects block submission
    const nonDECPending = enrollments.filter(e => {
      if (e.status !== 'PENDING') return false;
      const meta = allSubjectMeta.find(s => s.subject_id === e.subject_id);
      return !meta || !DEC_CATS.has(meta.category);
    });
    if (nonDECPending.length > 0) {
      return res.status(400).json({
        error: `${nonDECPending.length} subject(s) still pending — please Accept or Raise Error for all`,
        errors: [`${nonDECPending.length} subject(s) still pending`]
      });
    }

    // Load full details for accepted subjects only
    const accepted    = enrollments.filter(e => e.status === 'ACCEPTED');
    const subjectIds  = accepted.map(e => e.subject_id);
    let subjectDetails = [];
    if (subjectIds.length > 0) {
      const [details] = await db.query(
        `SELECT s.*, d.discipline_id, d.discipline_name
         FROM subjects s
         LEFT JOIN disciplines d ON s.discipline_id = d.discipline_id
         WHERE s.subject_id IN (?)`,
        [subjectIds]
      );
      subjectDetails = details;
    }

    const errors = [];
    const byCategory = {};
    subjectDetails.forEach(s => {
      if (!byCategory[s.category]) byCategory[s.category] = [];
      byCategory[s.category].push(s);
    });
    const majorDisciplines = (byCategory['MAJOR'] || [])
      .map(s => s.discipline_id).filter(Boolean);

    // ── PG Validation ─────────────────────────────────────────────────────────
    if (isPG) {

      // MAJOR/SEMINAR/INTERNSHIP are fixed — cannot be rejected
      const rejectedFixed = enrollments.filter(e =>
        e.status === 'REJECTED' &&
        subjectDetails.find(s =>
          s.subject_id === e.subject_id &&
          PG_FIXED.has(s.category)
        )
      );
      if (rejectedFixed.length > 0)
        errors.push('❌ DSC, Seminar and Internship subjects are compulsory and cannot be rejected');

      // VAC: exactly 1 — only validate if VAC subjects exist for this semester
      const vac = byCategory['VAC'] || [];
      if (subjectDetails.some(s => s.category === 'VAC')) {
        if (vac.length === 0) errors.push('❌ VAC: Must select exactly 1 subject');
        else if (vac.length > 1) errors.push(`❌ VAC: Select only 1 (selected ${vac.length})`);
      }

      // ELECTIVE Sem 2: exactly 1
      const elective = byCategory['ELECTIVE'] || [];
      if (subjectDetails.some(s => s.category === 'ELECTIVE')) {
        if (elective.length === 0) errors.push('❌ Elective: Must select 1 subject');
        else if (elective.length > 1) errors.push(`❌ Elective: Select only 1 (selected ${elective.length})`);
      }

      // DEC Sem 3: must pick exactly 4 from ELECTIVE_FINANCE/HR/MARKETING
      // Rule: all 4 from one group (core) OR 2+2 from any two groups (mixed)
      const decFinance    = (byCategory['ELECTIVE_FINANCE']    || []).length;
      const decHR         = (byCategory['ELECTIVE_HR']         || []).length;
      const decMarketing  = (byCategory['ELECTIVE_MARKETING']  || []).length;
      const decTotal      = decFinance + decHR + decMarketing;
      const hasDecSubjects = subjectDetails.some(s =>
        ['ELECTIVE_FINANCE','ELECTIVE_HR','ELECTIVE_MARKETING'].includes(s.category)
      );

      if (hasDecSubjects) {
        if (decTotal !== 4) {
          errors.push(`❌ DEC: Must select exactly 4 elective subjects (selected ${decTotal})`);
        } else {
          // Check valid combinations
          const groupsUsed = [decFinance, decHR, decMarketing].filter(n => n > 0);
          const isCore  = groupsUsed.length === 1 && groupsUsed[0] === 4; // all 4 from one group
          const isMixed = groupsUsed.length === 2 &&
                          groupsUsed.every(n => n === 2);                  // 2+2 from two groups
          if (!isCore && !isMixed) {
            errors.push(
              '❌ DEC: Invalid combination. Choose either: ' +
              '4 from one specialisation (Core) OR 2 from each of any two specialisations (Mixed). ' +
              `Current: Finance=${decFinance}, HR=${decHR}, Marketing=${decMarketing}`
            );
          }
        }
      }

      // OEC: exactly 1 (Sem 3)
      const oec = byCategory['OEC'] || [];
      if (subjectDetails.some(s => s.category === 'OEC')) {
        if (oec.length === 0) errors.push('❌ OEC: Must select exactly 1 subject');
        else if (oec.length > 1) errors.push(`❌ OEC: Select only 1 (selected ${oec.length})`);
      }

      // SEC: exactly 1 (Sem 4)
      const sec = byCategory['SEC'] || [];
      if (subjectDetails.some(s => s.category === 'SEC')) {
        if (sec.length === 0) errors.push('❌ SEC: Must select exactly 1 subject');
        else if (sec.length > 1) errors.push(`❌ SEC: Select only 1 (selected ${sec.length})`);
      }

      // Specialisation Electives (Sem 3 & 4): exactly 4, core or mixed
      const fin  = byCategory['ELECTIVE_FINANCE']    || [];
      const hr   = byCategory['ELECTIVE_HR']         || [];
      const mkt  = byCategory['ELECTIVE_MARKETING']  || [];
      const totalSpec = fin.length + hr.length + mkt.length;
      if (subjectDetails.some(s => ['ELECTIVE_FINANCE','ELECTIVE_HR','ELECTIVE_MARKETING'].includes(s.category))) {
        if (totalSpec !== 4) {
          errors.push(`❌ Specialisation Elective: Must select exactly 4 (selected ${totalSpec})`);
        } else {
          const areas  = [fin.length, hr.length, mkt.length].filter(n => n > 0);
          const isCore  = areas.length === 1 && areas[0] === 4;
          const isMixed = areas.length === 2 && areas.every(n => n === 2);
          if (!isCore && !isMixed)
            errors.push('❌ Elective: Choose 4 from one area (core) OR 2+2 from two areas (mixed)');
        }
      }

    // ── UG Validation — Scheme aware ──────────────────────────────────────────
    } else {

      const vacSemesters = VAC_SEMESTERS[scheme] || [1, 2];
      const vacExpected  = vacSemesters.includes(sem);

      // VAC — only validate if expected in this semester for this scheme
      if (vacExpected) {
        const vac = byCategory['VAC'] || [];
        if (vac.length === 0) errors.push('❌ VAC: Must select exactly 1 subject');
        else if (vac.length > 1) errors.push(`❌ VAC: Select only 1 (selected ${vac.length})`);
      }

      // AEC: max 1 (all schemes)
      const aec = byCategory['AEC'] || [];
      if (aec.length > 1) errors.push(`❌ AEC: Select only 1 (selected ${aec.length})`);

      // MIC: exactly 1
      // Scheme A/D Sem 1-2: 2cr MIC, Sem 3+: 4cr MIC (Vocational)
      // Scheme B: same as A
      // Scheme C: 4cr MIC from Sem 1
      const mic = byCategory['MIC'] || [];
      if (mic.length === 0) {
        errors.push('❌ MIC: Must select exactly 1 subject');
      } else if (mic.length > 1) {
        errors.push(`❌ MIC: Select only 1 (selected ${mic.length})`);
      } else {
        // Discipline conflict — MIC must not be from MAJOR discipline
        if (majorDisciplines.includes(mic[0].discipline_id))
          errors.push(`❌ MIC conflict: "${mic[0].subject_name}" is from your MAJOR discipline`);
        // Credit check per scheme and semester
        const micCredits = mic[0].credits;
        if (['A', 'B', 'D'].includes(scheme) && sem <= 2 && micCredits !== 2)
          errors.push(`❌ MIC: Must be 2 credits in Semester ${sem} for Scheme ${scheme}`);
        if (['A', 'B', 'D'].includes(scheme) && sem >= 3 && micCredits !== 4)
          errors.push(`❌ MIC: Must be 4 credits (Vocational) from Semester 3 for Scheme ${scheme}`);
        if (scheme === 'C' && micCredits !== 4)
          errors.push('❌ MIC: Must be 4 credits for Scheme C');
      }

      // MDC: 1 group, T+P pair if 2-credit, no MAJOR discipline conflict
      const mdc = byCategory['MDC'] || [];
      if (mdc.length === 0) {
        errors.push('❌ MDC: Must select at least 1 subject');
      } else {
        mdc.forEach(s => {
          if (majorDisciplines.includes(s.discipline_id))
            errors.push(`❌ MDC conflict: "${s.subject_name}" is from your MAJOR discipline`);
        });
        const mdcGroups = {};
        mdc.forEach(s => {
          const b = getBaseCode(s.subject_code);
          if (!mdcGroups[b]) mdcGroups[b] = [];
          mdcGroups[b].push(s);
        });
        if (Object.keys(mdcGroups).length > 1)
          errors.push('❌ MDC: Select subjects from only ONE group');
        Object.entries(mdcGroups).forEach(([, group]) => {
          const hasT = group.some(s => s.subject_code.trim().toUpperCase().endsWith('T'));
          const hasP = group.some(s => s.subject_code.trim().toUpperCase().endsWith('P'));
          const is2Credit = group.some(s => s.credits <= 2);
          if (is2Credit && hasT && !hasP) errors.push('❌ MDC: Must also select the Practical (P) companion');
          if (is2Credit && hasP && !hasT) errors.push('❌ MDC: Must also select the Theory (T) companion');
        });
      }

      // SEC: 1 group, T+P pair, no discipline conflict (all schemes)
      const sec = byCategory['SEC'] || [];
      if (sec.length > 0) {
        const secGroups = {};
        sec.forEach(s => {
          const b = getBaseCode(s.subject_code);
          if (!secGroups[b]) secGroups[b] = [];
          secGroups[b].push(s);
        });
        if (Object.keys(secGroups).length > 1)
          errors.push('❌ SEC: Select subjects from only ONE group');
        Object.entries(secGroups).forEach(([, group]) => {
          const hasT = group.some(s => s.subject_code.trim().toUpperCase().endsWith('T'));
          const hasP = group.some(s => s.subject_code.trim().toUpperCase().endsWith('P'));
          const is2Credit = group.some(s => s.credits <= 2);
          if (is2Credit && hasT && !hasP) errors.push('❌ SEC: Must also select the Practical (P) companion');
          if (is2Credit && hasP && !hasT) errors.push('❌ SEC: Must also select the Theory (T) companion');
        });
      }

      // MAJOR validation per scheme
      const major = byCategory['MAJOR'] || [];
      const majorGroups = {};
      major.forEach(s => {
        const b = getBaseCode(s.subject_code);
        if (!majorGroups[b]) majorGroups[b] = [];
        majorGroups[b].push(s);
      });
      const majorGroupCount = Object.keys(majorGroups).length;

      if (scheme === 'A' || scheme === 'B') {
        // Scheme A/B Sem 1-2: 3 DSC from 3 different disciplines (pre-assigned by admin)
        // Sem 3+: single major discipline
        if (sem <= 2) {
          const majorDisciplineSet = new Set(
            major.map(s => s.discipline_id).filter(Boolean)
          );
          if (major.length < 3)
            errors.push(`❌ MAJOR: Must have 3 DSC subjects from 3 disciplines (selected ${major.length})`);
          if (majorDisciplineSet.size < 3 && major.length >= 3)
            errors.push('❌ MAJOR: All 3 DSC subjects must be from different disciplines');
        } else {
          // Sem 3+: validate 3 groups with T+P pairing
          if (majorGroupCount < 3) errors.push(`❌ MAJOR: Must select exactly 3 subjects/groups (selected ${majorGroupCount})`);
          if (majorGroupCount > 3) errors.push(`❌ MAJOR: Cannot select more than 3 groups (selected ${majorGroupCount})`);
          Object.entries(majorGroups).forEach(([base, group]) => {
            const hasT = group.some(s => s.subject_code.trim().toUpperCase().endsWith('T'));
            const hasP = group.some(s => s.subject_code.trim().toUpperCase().endsWith('P'));
            const is3Credit = group.some(s => s.credits === 3);
            if (is3Credit && hasT && !hasP) errors.push(`❌ MAJOR: Select Practical companion for ${base}T`);
            if (is3Credit && hasP && !hasT) errors.push(`❌ MAJOR: Select Theory companion for ${base}P`);
          });
        }
      } else if (scheme === 'C' || scheme === 'D') {
        // Scheme C/D: Single major from Sem 1, validate 3 groups with T+P pairing
        if (majorGroupCount < 3) errors.push(`❌ MAJOR: Must select exactly 3 subjects/groups (selected ${majorGroupCount})`);
        if (majorGroupCount > 3) errors.push(`❌ MAJOR: Cannot select more than 3 groups (selected ${majorGroupCount})`);
        Object.entries(majorGroups).forEach(([base, group]) => {
          const hasT = group.some(s => s.subject_code.trim().toUpperCase().endsWith('T'));
          const hasP = group.some(s => s.subject_code.trim().toUpperCase().endsWith('P'));
          const is3Credit = group.some(s => s.credits === 3);
          if (is3Credit && hasT && !hasP) errors.push(`❌ MAJOR: Select Practical companion for ${base}T`);
          if (is3Credit && hasP && !hasT) errors.push(`❌ MAJOR: Select Theory companion for ${base}P`);
        });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('\n'), errors });
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    // Delete all draft records (both PENDING and ACCEPTED drafts) before final save
    // But preserve admin-modified records
    await db.query(
      'DELETE FROM student_subject_enrollment WHERE student_id = ? AND is_draft = 1 AND admin_modified = 0',
      [req.params.student_id]
    );

    // Fetch all admin-modified subject IDs in one query — avoids N+1 loop
    const [adminModified] = await db.query(
      'SELECT subject_id FROM student_subject_enrollment WHERE student_id = ? AND admin_modified = 1',
      [req.params.student_id]
    );
    const adminSubjectIds = new Set(adminModified.map(r => r.subject_id));

    // Skip admin-modified subjects, then batch INSERT the rest
    const toInsert = enrollments.filter(e => !adminSubjectIds.has(e.subject_id));
    if (toInsert.length > 0) {
      const placeholders = toInsert.map(() => '(?,?,?,?,?,0)').join(',');
      const values = toInsert.flatMap(e => [
        req.params.student_id, e.subject_id,
        e.status, e.is_major || false, e.remarks || ''
      ]);
      await db.query(
        `INSERT INTO student_subject_enrollment
           (student_id, subject_id, status, is_major, remarks, is_draft)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           status=VALUES(status), is_major=VALUES(is_major),
           remarks=VALUES(remarks), is_draft=0`,
        values
      );
    }

    // Mark student enrollment as submitted
    await db.query('UPDATE students SET enrollment_submitted = 1 WHERE student_id = ?', [req.params.student_id]);

    res.json({ message: 'Enrollment submitted successfully!' });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// ── POST /enroll-semester — Auto-enroll student in all subjects for their semester (admin only)
router.post("/enroll-semester", verify("admin"), async (req, res) => {
  const { student_id, semester, academic_year_id } = req.body;
  if (!student_id || !semester || !academic_year_id)
    return res.status(400).json({ error: "student_id, semester and academic_year_id are required" });
  try {
    await db.query("CALL EnrollStudentInSemester(?, ?, ?, @count, @msg)",
      [student_id, semester, academic_year_id]);
    const [[result]] = await db.query("SELECT @count AS enrolled_count, @msg AS message");
    const isError = result.message && result.message.startsWith("ERROR");
    res.status(isError ? 400 : 200).json(result);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

module.exports = router;
