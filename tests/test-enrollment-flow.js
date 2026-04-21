#!/usr/bin/env node
/**
 * End-to-end test for College ERP enrollment flow.
 *
 * Verifies the three fixes landed today:
 *   1. save-draft preserves admin-locked rows (admin_modified=1) instead of clobbering them
 *   2. submit returns truthful counts { inserted, skipped_admin_locked, total_requested }
 *   3. admin bulkupdate/import on a MAJOR cascades MIC/MDC draft wipe
 *
 * Strategy: hits the real backend on :3000, uses mysql2 for DB setup/assert/teardown.
 * Target student: Taya Rajesh (student_id 2233, roll_no 09, B.A Sem 1).
 *
 * Run:
 *   cd tests/
 *   npm install
 *   node test-enrollment-flow.js
 */

const mysql = require('mysql2/promise');

// ── Config ─────────────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE || 'http://localhost:3000/api';
const STUDENT_ID = 2233;
const STUDENT_ROLL = '09';
const STUDENT_PASSWORD = 'password';
const ADMIN_EMAIL = 'admin@college.com';
const ADMIN_PASSWORD = 'Admin@123';

const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: 'Root@123',
  database: 'college_erp',
};

// ── Pretty output ──────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const log = (msg) => console.log(msg);
const pass = (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`);
const fail = (msg, detail) => {
  console.log(`  ${c.red}✗${c.reset} ${msg}`);
  if (detail) console.log(`    ${c.dim}${detail}${c.reset}`);
  failures++;
};
const info = (msg) => console.log(`  ${c.dim}${msg}${c.reset}`);
const section = (title) => console.log(`\n${c.bold}${c.cyan}━━ ${title} ━━${c.reset}`);

let failures = 0;
let db;

// ── HTTP helper ────────────────────────────────────────────────────────────
async function request(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

// ── Setup helpers ──────────────────────────────────────────────────────────
async function loginStudent() {
  const { status, data } = await request('POST', '/auth/student/login', {
    body: { roll_no: STUDENT_ROLL, password: STUDENT_PASSWORD },
  });
  if (status !== 200 || !data?.token) {
    throw new Error(`Student login failed: ${status} ${JSON.stringify(data)}`);
  }
  return data.token;
}

async function loginAdmin() {
  const { status, data } = await request('POST', '/admin/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (status !== 200 || !data?.token) {
    throw new Error(`Admin login failed: ${status} ${JSON.stringify(data)}`);
  }
  return data.token;
}

async function resetStudentEnrollment() {
  // Wipe everything for this student so each run starts clean
  await db.query(
    'DELETE FROM student_subject_enrollment WHERE student_id = ?',
    [STUDENT_ID]
  );
  await db.query(
    'UPDATE students SET enrollment_submitted = 0, enrollment_submitted_at = NULL WHERE student_id = ?',
    [STUDENT_ID]
  );
}

async function getStudentContext() {
  const [rows] = await db.query(
    'SELECT student_id, semester, academic_year_id, level_id, programme_id FROM students WHERE student_id = ?',
    [STUDENT_ID]
  );
  if (!rows.length) throw new Error(`Student ${STUDENT_ID} not found in DB`);
  return rows[0];
}

async function getStudentRows() {
  const [rows] = await db.query(
    `SELECT e.enrollment_id, e.subject_id, e.status, e.is_major, e.is_draft,
            e.admin_modified, e.semester, e.academic_year_id,
            s.subject_code, s.category
     FROM student_subject_enrollment e
     JOIN subjects s ON e.subject_id = s.subject_id
     WHERE e.student_id = ?
     ORDER BY s.category, s.subject_code`,
    [STUDENT_ID]
  );
  return rows;
}

async function pickSubjectsByCategory(category, limit, semester) {
  const [rows] = await db.query(
    `SELECT subject_id, subject_code, category
     FROM subjects
     WHERE category = ? AND semester = ?
     LIMIT ?`,
    [category, semester, limit]
  );
  return rows;
}

// ── Assertion helpers ──────────────────────────────────────────────────────
function assertEqual(actual, expected, msg) {
  if (actual === expected) pass(msg);
  else fail(msg, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertTrue(cond, msg, detail) {
  if (cond) pass(msg);
  else fail(msg, detail);
}

// ── Test scenarios ─────────────────────────────────────────────────────────

async function scenario1_saveDraftPreservesAdminLocks(studentToken, adminToken, ctx) {
  section('Scenario 1: save-draft must NOT clobber admin-locked rows');

  // Pick one MAJOR + one MIC from the student's semester
  const majors = await pickSubjectsByCategory('MAJOR', 1, ctx.semester);
  const mics = await pickSubjectsByCategory('MIC', 1, ctx.semester);
  if (!majors.length || !mics.length) {
    info(`Skipping (no MAJOR+MIC available for sem ${ctx.semester})`);
    return;
  }
  const majorSubj = majors[0];
  const micSubj = mics[0];

  // Step 1: admin locks the MAJOR row (simulates bulkupdate)
  const bulkRes = await request('PUT', `/admin/enrollment/bulkupdate/${STUDENT_ID}`, {
    token: adminToken,
    body: { changes: [{ subject_id: majorSubj.subject_id, status: 'ACCEPTED' }], admin_note: 'locked by e2e test' },
  });
  assertEqual(bulkRes.status, 200, 'admin bulkupdate returns 200');

  const afterAdmin = await getStudentRows();
  const lockedRow = afterAdmin.find(r => r.subject_id === majorSubj.subject_id);
  assertTrue(lockedRow, 'admin-locked MAJOR row exists in DB');
  assertEqual(lockedRow?.admin_modified, 1, 'admin_modified = 1');
  assertEqual(lockedRow?.is_draft, 0, 'is_draft = 0');
  assertEqual(lockedRow?.status, 'ACCEPTED', 'status = ACCEPTED');
  assertEqual(lockedRow?.is_major, 1, 'is_major derived correctly = 1');

  // Step 2: student calls save-draft including BOTH the admin-locked MAJOR and the new MIC
  // Student tries to flip the MAJOR status to PENDING — must NOT succeed (row is locked)
  const draftRes = await request('POST', `/enrollment/save-draft/${STUDENT_ID}`, {
    token: studentToken,
    body: {
      decisions: [
        { subject_id: majorSubj.subject_id, status: 'PENDING', is_major: 1, remarks: 'student tried to overwrite' },
        { subject_id: micSubj.subject_id, status: 'PENDING', is_major: 0 },
      ],
    },
  });
  assertEqual(draftRes.status, 200, 'save-draft returns 200');

  // Step 3: verify DB state — MAJOR row must be unchanged, MIC row must be inserted as draft
  const afterDraft = await getStudentRows();
  const majorAfter = afterDraft.find(r => r.subject_id === majorSubj.subject_id);
  const micAfter = afterDraft.find(r => r.subject_id === micSubj.subject_id);

  assertEqual(majorAfter?.status, 'ACCEPTED', 'locked MAJOR still ACCEPTED (not clobbered to PENDING)');
  assertEqual(majorAfter?.is_draft, 0, 'locked MAJOR still is_draft=0 (not flipped back to 1)');
  assertEqual(majorAfter?.admin_modified, 1, 'locked MAJOR still admin_modified=1');

  assertTrue(micAfter, 'MIC draft row was inserted');
  assertEqual(micAfter?.is_draft, 1, 'MIC row is_draft = 1');
  assertEqual(micAfter?.admin_modified, 0, 'MIC row admin_modified = 0');
  assertEqual(micAfter?.semester, ctx.semester, 'MIC row has semester populated (sse_chk_sem gotcha)');
}

async function scenario2_submitReturnsCounts(studentToken, adminToken, ctx) {
  section('Scenario 2: submit returns truthful counts payload');

  await resetStudentEnrollment();

  // Admin locks 2 MAJORs first
  const majors = await pickSubjectsByCategory('MAJOR', 2, ctx.semester);
  if (majors.length < 2) {
    info(`Skipping (need 2 MAJORs for sem ${ctx.semester}, found ${majors.length})`);
    return;
  }

  await request('PUT', `/admin/enrollment/bulkupdate/${STUDENT_ID}`, {
    token: adminToken,
    body: { changes: majors.map(m => ({ subject_id: m.subject_id, status: 'ACCEPTED' })) },
  });

  // Student submits with 2 admin-locked MAJORs + pick whatever other subjects are available
  const extras = await pickSubjectsByCategory('AEC', 1, ctx.semester);
  const enrollments = [
    ...majors.map(m => ({ subject_id: m.subject_id, status: 'ACCEPTED', is_major: 1 })),
    ...extras.map(e => ({ subject_id: e.subject_id, status: 'ACCEPTED', is_major: 0 })),
  ];

  const submitRes = await request('POST', `/enrollment/submit/${STUDENT_ID}`, {
    token: studentToken,
    body: { enrollments },
  });

  // Submit will validate NEP rules — we don't care about pass/fail here, just the response shape
  // If it succeeds, assert the counts; if 400 (rules), report the rule error as info
  if (submitRes.status === 200) {
    const { inserted, skipped_admin_locked, total_requested } = submitRes.data || {};
    assertTrue(typeof inserted === 'number', 'response has `inserted` (number)');
    assertTrue(typeof skipped_admin_locked === 'number', 'response has `skipped_admin_locked` (number)');
    assertTrue(typeof total_requested === 'number', 'response has `total_requested` (number)');
    assertEqual(total_requested, enrollments.length, 'total_requested matches payload size');
    assertEqual(skipped_admin_locked, majors.length, 'skipped_admin_locked counts the 2 admin-locked MAJORs');
    assertEqual(inserted + skipped_admin_locked, total_requested, 'inserted + skipped = total');
  } else if (submitRes.status === 400) {
    info(`submit rejected by NEP rules (expected when picking subjects arbitrarily): ${submitRes.data?.error?.slice(0, 120)}`);
    info('Counts-payload shape check skipped — need a fuller valid selection to exercise the happy path');
  } else {
    fail('submit returned unexpected status', `${submitRes.status}: ${JSON.stringify(submitRes.data)}`);
  }
}

async function scenario3_majorTouchCascadesMicMdcWipe(adminToken, ctx) {
  section('Scenario 3: admin MAJOR touch wipes student\'s MIC/MDC drafts');

  await resetStudentEnrollment();

  const majors = await pickSubjectsByCategory('MAJOR', 1, ctx.semester);
  const mics = await pickSubjectsByCategory('MIC', 2, ctx.semester);
  const mdcs = await pickSubjectsByCategory('MDC', 1, ctx.semester);
  const aecs = await pickSubjectsByCategory('AEC', 1, ctx.semester);

  if (!majors.length) { info(`Skipping (no MAJOR for sem ${ctx.semester})`); return; }
  if (!mics.length && !mdcs.length) { info('Skipping (no MIC or MDC to test cascade on)'); return; }

  // Step 1: seed student drafts directly (bypass NEP validation) — include MIC, MDC, AEC
  const draftSeed = [
    ...mics.map(s => ({ subject_id: s.subject_id, cat: 'MIC' })),
    ...mdcs.map(s => ({ subject_id: s.subject_id, cat: 'MDC' })),
    ...aecs.map(s => ({ subject_id: s.subject_id, cat: 'AEC' })),
  ];
  for (const { subject_id } of draftSeed) {
    await db.query(
      `INSERT INTO student_subject_enrollment
         (student_id, subject_id, status, is_major, is_draft, admin_modified, semester, academic_year_id)
       VALUES (?, ?, 'PENDING', 0, 1, 0, ?, ?)`,
      [STUDENT_ID, subject_id, ctx.semester, ctx.academic_year_id]
    );
  }

  const before = await getStudentRows();
  const micCountBefore = before.filter(r => r.category === 'MIC' && r.is_draft === 1).length;
  const mdcCountBefore = before.filter(r => r.category === 'MDC' && r.is_draft === 1).length;
  const aecCountBefore = before.filter(r => r.category === 'AEC' && r.is_draft === 1).length;
  info(`Seeded: MIC=${micCountBefore}, MDC=${mdcCountBefore}, AEC=${aecCountBefore}`);

  // Step 2: admin touches a MAJOR via bulkupdate
  const bulkRes = await request('PUT', `/admin/enrollment/bulkupdate/${STUDENT_ID}`, {
    token: adminToken,
    body: { changes: [{ subject_id: majors[0].subject_id, status: 'ACCEPTED' }] },
  });
  assertEqual(bulkRes.status, 200, 'admin bulkupdate (MAJOR) returns 200');
  assertEqual(bulkRes.data?.major_touched, true, 'response signals major_touched=true');

  // Step 3: verify MIC/MDC drafts got wiped, AEC drafts stayed
  const after = await getStudentRows();
  const micAfter = after.filter(r => r.category === 'MIC').length;
  const mdcAfter = after.filter(r => r.category === 'MDC').length;
  const aecAfter = after.filter(r => r.category === 'AEC' && r.is_draft === 1).length;

  assertEqual(micAfter, 0, 'all MIC draft rows wiped');
  assertEqual(mdcAfter, 0, 'all MDC draft rows wiped');
  assertEqual(aecAfter, aecCountBefore, 'AEC draft rows preserved (not in cascade scope)');

  // Confirm the MAJOR row is locked and properly annotated
  const majorRow = after.find(r => r.subject_id === majors[0].subject_id);
  assertEqual(majorRow?.admin_modified, 1, 'MAJOR locked (admin_modified=1)');
  assertEqual(majorRow?.is_major, 1, 'MAJOR has is_major=1 (derived by backend)');
  assertEqual(majorRow?.semester, ctx.semester, 'MAJOR has semester populated');
  assertTrue(majorRow?.academic_year_id != null, 'MAJOR has academic_year_id populated');
}

async function scenario4_adminLockedRowDoesNotBlockReWipe(adminToken, ctx) {
  section('Scenario 4: admin-locked MIC/MDC survives cascade (only drafts get wiped)');

  await resetStudentEnrollment();

  const majors = await pickSubjectsByCategory('MAJOR', 1, ctx.semester);
  const mics = await pickSubjectsByCategory('MIC', 2, ctx.semester);
  if (!majors.length || mics.length < 2) {
    info('Skipping (need 1 MAJOR + 2 MICs)');
    return;
  }

  // Admin-lock one MIC first
  await request('PUT', `/admin/enrollment/bulkupdate/${STUDENT_ID}`, {
    token: adminToken,
    body: { changes: [{ subject_id: mics[0].subject_id, status: 'REJECTED' }] },
  });
  // Seed a second MIC as a student draft
  await db.query(
    `INSERT INTO student_subject_enrollment
       (student_id, subject_id, status, is_major, is_draft, admin_modified, semester, academic_year_id)
     VALUES (?, ?, 'PENDING', 0, 1, 0, ?, ?)`,
    [STUDENT_ID, mics[1].subject_id, ctx.semester, ctx.academic_year_id]
  );

  // Admin now touches a MAJOR — should wipe MIC draft but NOT the admin-locked MIC
  await request('PUT', `/admin/enrollment/bulkupdate/${STUDENT_ID}`, {
    token: adminToken,
    body: { changes: [{ subject_id: majors[0].subject_id, status: 'ACCEPTED' }] },
  });

  const after = await getStudentRows();
  const lockedMic = after.find(r => r.subject_id === mics[0].subject_id);
  const draftMic = after.find(r => r.subject_id === mics[1].subject_id);

  assertTrue(lockedMic, 'admin-locked MIC survived cascade');
  assertEqual(lockedMic?.admin_modified, 1, 'locked MIC still admin_modified=1');
  assertTrue(!draftMic, 'student-draft MIC was wiped by cascade');
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  console.log(`${c.bold}College ERP — Enrollment Flow E2E Tests${c.reset}`);
  console.log(`${c.dim}API: ${API_BASE}  •  Student: ${STUDENT_ID} (${STUDENT_ROLL})${c.reset}\n`);

  try {
    db = await mysql.createConnection(DB_CONFIG);
  } catch (e) {
    console.error(`${c.red}Failed to connect to MySQL:${c.reset} ${e.message}`);
    process.exit(2);
  }

  let studentToken, adminToken, ctx;
  try {
    section('Setup');
    await resetStudentEnrollment();
    pass('student enrollment reset');
    studentToken = await loginStudent();
    pass('student login');
    adminToken = await loginAdmin();
    pass('admin login');
    ctx = await getStudentContext();
    info(`student context: sem=${ctx.semester}, academic_year_id=${ctx.academic_year_id}`);
    if (ctx.semester == null) throw new Error('Student has no semester set — cannot run tests');
  } catch (e) {
    console.error(`\n${c.red}Setup failed:${c.reset} ${e.message}`);
    await db.end();
    process.exit(2);
  }

  try {
    await scenario1_saveDraftPreservesAdminLocks(studentToken, adminToken, ctx);
    await scenario2_submitReturnsCounts(studentToken, adminToken, ctx);
    await scenario3_majorTouchCascadesMicMdcWipe(adminToken, ctx);
    await scenario4_adminLockedRowDoesNotBlockReWipe(adminToken, ctx);
  } catch (e) {
    console.error(`\n${c.red}Unhandled error:${c.reset} ${e.stack || e.message}`);
    failures++;
  }

  section('Teardown');
  await resetStudentEnrollment();
  pass('student enrollment reset');
  await db.end();

  console.log();
  if (failures === 0) {
    console.log(`${c.bold}${c.green}All assertions passed.${c.reset}`);
    process.exit(0);
  } else {
    console.log(`${c.bold}${c.red}${failures} assertion(s) failed.${c.reset}`);
    process.exit(1);
  }
})();
