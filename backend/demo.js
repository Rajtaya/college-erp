/**
 * College ERP — Full Module Demonstration
 * Run: node demo.js
 */

const http = require('http');

const BASE = 'http://localhost:3000/api';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const options = {
      hostname: 'localhost', port: 3000,
      path: '/api' + path, method,
      headers,
    };
    const r = http.request(options, res => {
      let buf = '';
      res.on('data', d => (buf += d));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch (e) { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function ok(label, r, check) {
  const pass = r.status < 300 && (!check || check(r.data));
  const mark = pass ? '✓' : '✗';
  console.log(`  [${mark}] ${label} → HTTP ${r.status}`);
  if (!pass) console.log('      Response:', JSON.stringify(r.data).slice(0, 120));
  return r;
}

async function run() {
  console.log('='.repeat(60));
  console.log('  COLLEGE ERP — FULL MODULE DEMONSTRATION');
  console.log('='.repeat(60));

  // ── ADMIN LEVEL ─────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║           ADMIN LEVEL                ║');
  console.log('╚══════════════════════════════════════╝\n');

  let r = await req('POST', '/admin/login', { email: 'admin@college.com', password: 'Admin@123' });
  ok('Admin login', r, d => d.token);
  const AT = r.data.token;
  console.log(`     Logged in as: ${r.data.admin?.name} (${r.data.admin?.email})`);

  r = await req('GET', '/admin/students', null, AT);
  ok(`List students (${r.data.length} total)`, r, d => Array.isArray(d));
  r.data.slice(0, 3).forEach(s =>
    console.log(`     • [${s.roll_no}] ${s.name} — ${s.programme_name} Sem ${s.semester}`));

  r = await req('GET', '/admin/teachers', null, AT);
  ok(`List teachers with M2M disciplines+departments (${r.data.length} total)`, r);
  r.data.filter(t => t.disciplines?.length).slice(0, 3).forEach(t =>
    console.log(`     • ${t.first_name} ${t.last_name}: discs=[${t.disciplines.map(d=>d.discipline_name).join(', ')}] depts=[${t.departments?.map(d=>d.department_name).join(', ')||'none'}]`));

  r = await req('GET', '/levels', null, AT);
  ok(`Levels: ${r.data.map(l=>l.level_name).join(', ')}`, r);

  r = await req('GET', '/faculties', null, AT);
  ok(`Faculties (${r.data.length}): ${r.data.map(f=>f.faculty_name).join(', ')}`, r);

  r = await req('GET', '/departments', null, AT);
  ok(`Departments (${r.data.length})`, r);

  r = await req('GET', '/disciplines', null, AT);
  ok(`Disciplines (${r.data.length})`, r);

  // Add a student (via /api/students with admin token)
  const ts = Date.now();
  r = await req('POST', '/students', {
    roll_no: `DEMO${ts}`, first_name: 'Demo', last_name: 'Student',
    email: `demo.student${ts}@test.com`, password: 'Test@123',
    semester: 1, study_year: 1, level_id: 1, programme_id: 1, faculty_id: 1, academic_year_id: 1
  }, AT);
  ok('Add student (POST /api/students)', r, d => d.student_id);
  const NEW_SID = r.data.student_id;
  console.log(`     New student_id: ${NEW_SID}`);

  // Add a teacher
  r = await req('POST', '/admin/teachers', {
    title: 'Prof.', first_name: 'DemoTeach', last_name: 'Test',
    email: `demoteach${ts}@test.com`, phone: '9000000001',
    designation: 'Lecturer', employee_code: `EMP${ts}`,
    password: 'Test@123', discipline_ids: [9, 17], department_ids: []
  }, AT);
  ok('Add teacher with 2 disciplines', r, d => d.teacher_id);
  const NEW_TID = r.data.teacher_id;
  console.log(`     New teacher_id: ${NEW_TID}`);

  // Update teacher — partial update (only designation) — email must be preserved
  r = await req('PUT', `/admin/teachers/${NEW_TID}`, {
    designation: 'Senior Lecturer', discipline_ids: [9, 17, 30]
  }, AT);
  ok('Update teacher (partial: designation + add 3rd discipline)', r, d => d.message);

  // Verify disciplines updated
  r = await req('GET', '/admin/teachers', null, AT);
  const updTeacher = r.data.find(t => t.teacher_id === NEW_TID);
  const discCount = updTeacher?.disciplines?.length || 0;
  console.log(`  [${discCount === 3 ? '✓' : '✗'}] Verify disciplines updated to 3 → got ${discCount}`);

  // Manage fees (bulk generate via admin)
  r = await req('POST', '/admin/fees/bulk', {
    programme_id: 1, semester: 1, academic_year_id: 1,
    fee_type: 'TUITION', amount: 50000, due_date: '2026-04-30'
  }, AT);
  ok('Bulk generate fees for programme', r);

  // ── TEACHER LEVEL ────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║           TEACHER LEVEL              ║');
  console.log('╚══════════════════════════════════════╝\n');

  r = await req('POST', '/auth/teacher/login', { email: 'taya@college.com', password: 'Admin@123' });
  ok('Teacher login', r, d => d.token);
  const TT = r.data.token;
  console.log(`     Logged in as: ${r.data.teacher?.name}`);

  // Teacher subjects via subjects route
  const teacherId = r.data.teacher?.teacher_id || 2;
  r = await req('GET', `/subjects/teacher/${teacherId}`, null, TT);
  ok(`Teacher subjects (via /api/subjects/teacher/:id): ${Array.isArray(r.data) ? r.data.length : 'N/A'} subject(s)`, r);
  if (Array.isArray(r.data)) r.data.slice(0, 3).forEach(s =>
    console.log(`     • [${s.subject_code||'?'}] ${s.subject_name} Sem${s.semester}`));

  // Get a subject actually assigned to this teacher (Rajesh Taya, teacher_id=2)
  const db = require('./db');
  const [[sub]] = await db.query(
    `SELECT st.subject_id, s.subject_name
     FROM subject_teachers st JOIN subjects s ON st.subject_id=s.subject_id
     WHERE st.teacher_id = 2 LIMIT 1`
  );
  const [[st1],[st2],[st3]] = await Promise.all([
    db.query('SELECT student_id FROM students ORDER BY student_id LIMIT 1'),
    db.query('SELECT student_id FROM students ORDER BY student_id LIMIT 1 OFFSET 1'),
    db.query('SELECT student_id FROM students ORDER BY student_id LIMIT 1 OFFSET 2'),
  ]);
  const SID = sub.subject_id;
  const [sid1, sid2, sid3] = [st1[0].student_id, st2[0].student_id, st3[0].student_id];

  r = await req('POST', '/attendance/bulk', {
    subject_id: SID, date: '2026-03-30',
    records: [
      { student_id: sid1, status: 'present' },
      { student_id: sid2, status: 'absent' },
      { student_id: sid3, status: 'present' },
    ]
  }, TT);
  ok(`Mark attendance for 3 students (batched INSERT)`, r, d => d.message);
  console.log(`     ${r.data.message}`);

  r = await req('POST', '/marks/bulk', {
    subject_id: SID, exam_type: 'INTERNAL', max_marks: 30, semester: 1,
    entries: [
      { student_id: sid1, marks_obtained: 25 },
      { student_id: sid2, marks_obtained: 18 },
      { student_id: sid3, marks_obtained: 27 },
    ]
  }, TT);
  ok(`Enter marks for 3 students (batched INSERT)`, r, d => d.message);
  console.log(`     ${r.data.message}`);

  r = await req('GET', `/marks/subject/${SID}`, null, TT);
  ok(`View all marks for subject ${SID} (teacher/admin view): ${r.data.length} records`, r);
  r.data.slice(0, 3).forEach(m =>
    console.log(`     • ${m.name} [${m.roll_no}] ${m.exam_type}: ${m.marks_obtained}/${m.max_marks}`));

  r = await req('GET', `/attendance/subject/${SID}/date/2026-03-30`, null, TT);
  ok(`View attendance for subject ${SID} on 2026-03-30: ${r.data.length} records`, r);
  r.data.slice(0, 3).forEach(a =>
    console.log(`     • student_id=${a.student_id} → ${a.status}`));

  // ── STUDENT LEVEL ────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║           STUDENT LEVEL              ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Login with known student credentials
  r = await req('POST', '/auth/student/login', { roll_no: 'BCA001', password: 'password' });
  let ST = r.data.token;
  ok('Student login (BCA001)', r, d => d.token);
  if (ST) {
    console.log(`     Logged in as: ${r.data.student?.name} [${r.data.student?.roll_no}]`);
    const STU_ID = r.data.student?.student_id;

    r = await req('GET', `/students/${STU_ID}/profile`, null, ST);
    ok('View own profile (IDOR protected)', r, d => d.roll_no || d.student_id);

    r = await req('GET', `/attendance/student/${STU_ID}`, null, ST);
    ok(`View own attendance: ${r.data.length} records`, r);
    if (r.data.length) {
      r.data.slice(0, 3).forEach(a =>
        console.log(`     • ${a.date} → ${a.status} (subject: ${a.subject_id})`));
    }

    r = await req('GET', `/marks/student/${STU_ID}`, null, ST);
    ok(`View own marks (visible only): ${r.data.length} records`, r);
    r.data.slice(0, 3).forEach(m =>
      console.log(`     • ${m.subject_name} ${m.exam_type}: ${m.marks_obtained}/${m.max_marks}`));

    r = await req('GET', `/fees/student/${STU_ID}`, null, ST);
    ok(`View own fees: ${r.data.length} records`, r);

    r = await req('GET', `/fees/student/${STU_ID}/summary`, null, ST);
    ok('View fees summary', r, d => d.total_amount !== undefined || Array.isArray(d) || d.total !== undefined);

    // IDOR check — try accessing another student's data
    const otherId = STU_ID === sid1 ? sid2 : sid1;
    r = await req('GET', `/attendance/student/${otherId}`, null, ST);
    console.log(`  [${r.status === 403 ? '✓' : '✗'}] IDOR block: access other student's attendance → HTTP ${r.status} (expect 403)`);

    // Enrollment
    r = await req('GET', `/enrollment/subjects/${STU_ID}`, null, ST);
    ok(`View enrollment subjects: ${Array.isArray(r.data) ? r.data.length : JSON.stringify(r.data).slice(0,50)} records`, r);

  } else {
    console.log('  [!] Skipping student operations — no known password for seeded students');
    console.log('      (Admin can reset passwords via PUT /api/admin/students/:id)');
  }

  // ── SECURITY CHECKS ──────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║         SECURITY CHECKS              ║');
  console.log('╚══════════════════════════════════════╝\n');

  r = await req('GET', '/admin/students');
  console.log(`  [${r.status === 401 ? '✓' : '✗'}] No token → admin route blocked → HTTP ${r.status}`);

  r = await req('GET', '/admin/students', null, TT);
  console.log(`  [${r.status === 403 ? '✓' : '✗'}] Teacher token → admin route blocked → HTTP ${r.status}`);

  // Use teacher login for security checks to avoid hitting admin rate limiter
  r = await req('POST', '/auth/teacher/login', { email: 'wrong@test.com', password: 'wrong' });
  console.log(`  [${r.status === 401 ? '✓' : '✗'}] Wrong teacher credentials → unified error → ${JSON.stringify(r.data)}`);

  r = await req('POST', '/auth/teacher/login', { email: 'taya@college.com', password: 'wrong' });
  console.log(`  [${r.status === 401 ? '✓' : '✗'}] Wrong password, valid email → same error (no enumeration) → ${JSON.stringify(r.data)}`);

  console.log('\n' + '='.repeat(60));
  console.log('  DEMONSTRATION COMPLETE');
  console.log('='.repeat(60));

  await db.end();
  process.exit(0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
