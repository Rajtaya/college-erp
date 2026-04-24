import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import API, { SERVER_BASE } from '../api';
import SubjectsTab from '../components/SubjectsTab';

export default function AdminDashboard({ admin, onLogout }) {
  const [activeTab, setActiveTab] = useState('levels');
  const [levels, setLevels] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [fees, setFees] = useState([]);
  const [feeSummary, setFeeSummary] = useState([]);
  const [bulkFeeForm, setBulkFeeForm] = useState({});
  const [feeFilter, setFeeFilter] = useState('');
  const [marks, setMarks] = useState([]);
  const [enrollmentSummary, setEnrollmentSummary] = useState([]);
  const [editingStudent, setEditingStudent] = useState(null);
  const [enrollmentDetail, setEnrollmentDetail] = useState([]);
  const [enrollValidationErrors, setEnrollValidationErrors] = useState([]);
  const [selectedEnrollStudent, setSelectedEnrollStudent] = useState(null);
  const [adminNote, setAdminNote] = useState('');
  const [enrollSearch, setEnrollSearch] = useState('');
  const [form, setForm] = useState({});
  const [studentLevel, setStudentLevel] = useState('');
  const [studentFaculty, setStudentFaculty] = useState('');
  const [studentProgrammes, setStudentProgrammes] = useState([]);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success');
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [disciplines, setDisciplines] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [managingTeacher, setManagingTeacher] = useState(null);
  const [allSubjects, setAllSubjects] = useState([]);
  const [teacherSubjects, setTeacherSubjects] = useState([]);
  const [assignmentData, setAssignmentData] = useState([]);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState([]);
  const [importErrorsOpen, setImportErrorsOpen] = useState(false);
  const [stuFilterProg, setStuFilterProg] = useState('');
  const [stuFilterSem, setStuFilterSem] = useState('');
  const [stuFilterFaculty, setStuFilterFaculty] = useState('');
  const [stuSearch, setStuSearch] = useState('');
  const [enrollFilterProg, setEnrollFilterProg] = useState('');
  const [enrollFilterFaculty, setEnrollFilterFaculty] = useState('');
  const [enrollFilterSem, setEnrollFilterSem] = useState('');
  const [enrollFilterLevel, setEnrollFilterLevel] = useState('');
  const [enrollFilterStatus, setEnrollFilterStatus] = useState('');
  const studentFileRef = useRef();
  const teacherFileRef = useRef();
  const feeFileRef = useRef();

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [notifForm, setNotifForm] = useState({ title: '', message: '', target: 'all', programme_id: '', target_semester: '' });
  const [notifFile, setNotifFile] = useState(null);
  const [notifSending, setNotifSending] = useState(false);
  const notifFileRef = useRef();

  useEffect(() => {
    fetchLevels();
    fetchFaculties();
    fetchProgrammes();
    fetchStudents();
    fetchDisciplines();
    fetchDepartments();
  }, []);

  useEffect(() => {
    if (activeTab === 'students') fetchStudents();
    if (activeTab === 'teachers') fetchTeachers();
    if (activeTab === 'attendance') fetchAttendance();
    if (activeTab === 'fees') { fetchFees(); fetchStudents(); fetchFeeSummary(); autoMarkOverdue(); }
    if (activeTab === 'marks') fetchAllMarks();
    if (activeTab === 'enrollment') { fetchEnrollmentSummary(); setSelectedEnrollStudent(null); }
    if (activeTab === 'notifications') fetchNotifications();
  }, [activeTab]);

  useEffect(() => {
    if (studentLevel && studentFaculty) {
      setStudentProgrammes(programmes.filter(p =>
        String(p.level_id) === String(studentLevel) &&
        String(p.faculty_id) === String(studentFaculty)
      ));
    } else { setStudentProgrammes([]); }
  }, [studentLevel, studentFaculty, programmes]);

  const fetchLevels = async () => { try { const r = await API.get('/levels'); setLevels(r.data); } catch(e){} };
  const fetchFaculties = async () => { try { const r = await API.get('/faculties'); setFaculties(r.data); } catch(e){} };
  const fetchProgrammes = async () => { try { const r = await API.get('/programmes'); setProgrammes(r.data); } catch(e){} };
  const fetchStudents = async () => { try { const r = await API.get('/admin/students'); setStudents(r.data); } catch(e){} };
  const fetchDisciplines = async () => { try { const r = await API.get('/disciplines'); setDisciplines(r.data); } catch(e){} };
  const fetchDepartments = async () => { try { const r = await API.get('/departments'); setDepartments(r.data); } catch(e){} };
  const fetchTeachers = async () => { try { const r = await API.get('/admin/teachers'); setTeachers(r.data); } catch(e){} };
  const fetchAttendance = async () => { try { const r = await API.get('/admin/attendance'); setAttendance(r.data); } catch(e){} };
  const fetchFees = async () => { try { const r = await API.get('/admin/fees'); setFees(r.data); } catch(e){} };
  const fetchFeeSummary = async () => { try { const r = await API.get('/admin/fees/summary'); setFeeSummary(r.data); } catch(e){} };
  const autoMarkOverdue = async () => { try { await API.put('/admin/fees/mark-overdue'); } catch(e){} };
  const fetchAllMarks = async () => { try { const r = await API.get('/admin/marks'); setMarks(r.data); } catch(e){} };
  const fetchEnrollmentSummary = async () => { try { const r = await API.get('/admin/enrollment/summary'); setEnrollmentSummary(r.data); } catch(e){} };
  const fetchNotifications = async () => { try { const r = await API.get('/notifications'); setNotifications(r.data); } catch(e){} };

  const API_BASE = SERVER_BASE;

  const sendNotification = async () => {
    if (!notifForm.title.trim() || !notifForm.message.trim()) { showMsg('Title and message are required', 'error'); return; }
    if (notifForm.target === 'class' && (!notifForm.programme_id || !notifForm.target_semester)) {
      showMsg('Select programme and semester for class-wise notification', 'error'); return;
    }
    setNotifSending(true);
    try {
      const fd = new FormData();
      fd.append('title', notifForm.title);
      fd.append('message', notifForm.message);
      fd.append('target', notifForm.target);
      if (notifForm.target === 'class') {
        fd.append('programme_id', notifForm.programme_id);
        fd.append('target_semester', notifForm.target_semester);
      }
      if (notifFile) fd.append('attachment', notifFile);
      await API.post('/notifications', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const prog = notifForm.target === 'class' ? programmes.find(p => String(p.programme_id) === String(notifForm.programme_id)) : null;
      showMsg(notifForm.target === 'all' ? 'Notification sent to all students!' : `Notification sent to ${prog?.programme_name || ''} Sem ${notifForm.target_semester}!`);
      setNotifForm({ title: '', message: '', target: 'all', programme_id: '', target_semester: '' });
      setNotifFile(null);
      if (notifFileRef.current) notifFileRef.current.value = '';
      fetchNotifications();
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to send', 'error'); }
    setNotifSending(false);
  };

  const deleteNotification = async (id) => {
    if (!window.confirm('Delete this notification?')) return;
    try {
      await API.delete(`/notifications/${id}`);
      showMsg('Notification deleted');
      fetchNotifications();
    } catch (e) { showMsg('Failed to delete', 'error'); }
  };

  // Helper: build enrollment sheet
  // Format: one column for Code, one for Name, per subject slot
  // T and P in separate columns
  const buildEnrollmentSheet = (data) => {
    const catOrder = ['MAJOR','MIC','MDC','SEC','VAC','AEC','ELECTIVE',
      'ELECTIVE_FINANCE','ELECTIVE_HR','ELECTIVE_MARKETING','OEC','SEMINAR','INTERNSHIP','VOC'];
    const catLabels = {
      MAJOR:'DSC', MIC:'MIC', MDC:'MDC', SEC:'SEC', VAC:'VAC', AEC:'AEC',
      ELECTIVE:'Elective', ELECTIVE_FINANCE:'DEC-Finance',
      ELECTIVE_HR:'DEC-HR', ELECTIVE_MARKETING:'DEC-Marketing',
      OEC:'OEC', SEMINAR:'Seminar', INTERNSHIP:'Internship', VOC:'VOC'
    };

    // Get unique students sorted by roll_no
    const students = [...new Map(data.map(d => [d.roll_no, {
      roll_no: d.roll_no, student_name: d.student_name,
      semester: d.semester, programme_name: d.programme_name
    }])).values()].sort((a,b) => a.roll_no.localeCompare(b.roll_no));

    // Get categories present in data
    const categories = [...new Set(data.map(d => d.category))]
      .sort((a,b) => {
        const ai = catOrder.indexOf(a), bi = catOrder.indexOf(b);
        return (ai===-1?99:ai) - (bi===-1?99:bi);
      });

    // For each category, find the max number of subject SLOTS any student has
    // Each subject (T or P) is a separate slot
    const catMaxSlots = {};
    categories.forEach(cat => {
      let max = 0;
      students.forEach(stu => {
        const count = data.filter(d => d.roll_no === stu.roll_no && d.category === cat).length;
        max = Math.max(max, count);
      });
      catMaxSlots[cat] = Math.max(max, 1);
    });

    // Build rows — one per student
    const rows = students.map(stu => {
      const row = {
        'Roll No': stu.roll_no,
        'Student Name': stu.student_name,
        'Programme': stu.programme_name,
        'Semester': stu.semester,
      };

      categories.forEach(cat => {
        const label = catLabels[cat] || cat;
        const stuSubs = data
          .filter(d => d.roll_no === stu.roll_no && d.category === cat)
          .sort((a,b) => a.subject_code.localeCompare(b.subject_code));
        const slots = catMaxSlots[cat];

        if (slots === 1) {
          // Single subject — Code and Name in separate columns
          row[`${label} Code`] = stuSubs[0]?.subject_code || '—';
          row[`${label} Name`] = stuSubs[0]?.subject_name || '—';
        } else {
          // Multiple subjects — numbered slots, each with Code and Name column
          for (let i = 0; i < slots; i++) {
            const sub = stuSubs[i];
            row[`${label}-${i+1} Code`] = sub?.subject_code || '—';
            row[`${label}-${i+1} Name`] = sub?.subject_name || '—';
          }
        }
      });

      return row;
    });

    return rows;
  };

  // ── Enrollment Export: shared cache + filter helper ────────────────
  const enrollmentExportCacheRef = useRef({ data: null, ts: 0 });

  const fetchEnrollmentExportData = async () => {
    const CACHE_MS = 60 * 1000;
    const cache = enrollmentExportCacheRef.current;
    if (cache.data && Date.now() - cache.ts < CACHE_MS) return cache.data;
    const r = await API.get('/admin/enrollment/export');
    enrollmentExportCacheRef.current = { data: r.data, ts: Date.now() };
    return r.data;
  };

  // Apply the on-screen Enrollment Management filters to export rows.
  const applyEnrollmentFilters = (data) => {
    const search = (enrollSearch || '').trim().toLowerCase();
    return data.filter(r => {
      if (search) {
        const hay = `${r.roll_no || ''} ${r.student_name || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      if (enrollFilterFaculty && String(r.faculty_id)   !== String(enrollFilterFaculty)) return false;
      if (enrollFilterLevel   && String(r.level_id)     !== String(enrollFilterLevel))   return false;
      if (enrollFilterProg    && String(r.programme_id) !== String(enrollFilterProg))    return false;
      if (enrollFilterSem     && String(r.semester)     !== String(enrollFilterSem))     return false;
      // Status filter: dropdown values are 'submitted','draft','not_enrolled'
      // Export endpoint only returns ACCEPTED (Submitted) rows, so:
      //   submitted    → all rows pass (already all ACCEPTED)
      //   draft        → no match (drafts not in export)
      //   not_enrolled → no match (not-enrolled students not in export)
      if (enrollFilterStatus === 'draft' || enrollFilterStatus === 'not_enrolled') return false;
      return true;
    });
  };

  const todayStamp = () => new Date().toLocaleDateString('en-IN').replace(/\//g, '-');

  const logExportError = (label, e) => {
    console.error(`[Export] ${label} failed:`, e);
    const detail = e?.response?.data?.error || e?.message || 'Unknown error';
    showMsg(`Export failed: ${detail}`, 'error');
  };

  // ── Enrollment Export: Programme-wise (one sheet per programme) ────
  const handleExportEnrollment = async () => {
    try {
      const data = applyEnrollmentFilters(await fetchEnrollmentExportData());
      if (!data.length) { showMsg('No enrollment data matches current filters', 'error'); return; }

      const wb = XLSX.utils.book_new();
      const programmes = [...new Set(data.map(d => d.programme_name))].sort();

      programmes.forEach(prog => {
        const progData = data.filter(d => d.programme_name === prog);
        const rows = buildEnrollmentSheet(progData);
        if (!rows.length) return;
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 22) }));
        XLSX.utils.book_append_sheet(wb, ws, prog.replace(/[\/\?*\[\]]/g, '').substring(0, 31));
      });

      XLSX.writeFile(wb, `Enrollment_Programme_${todayStamp()}.xlsx`);
      showMsg('✅ Programme-wise export done!');
    } catch (e) { logExportError('Programme-wise', e); }
  };

  // ── Enrollment Export: generic semester-grouped helper ─────────────
  const exportSemesterGrouped = async (label, filterFn, filenamePrefix, sheetLabelFn, successMsg) => {
    try {
      const data = applyEnrollmentFilters(await fetchEnrollmentExportData()).filter(filterFn);
      if (!data.length) { showMsg('No enrollment data matches current filters', 'error'); return; }

      const wb = XLSX.utils.book_new();
      const semesters = [...new Set(data.map(d => d.semester))].sort((a, b) => a - b);

      semesters.forEach(sem => {
        const rows = buildEnrollmentSheet(data.filter(d => d.semester === sem));
        if (!rows.length) return;
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 22) }));
        XLSX.utils.book_append_sheet(wb, ws, sheetLabelFn(sem));
      });

      XLSX.writeFile(wb, `${filenamePrefix}_${todayStamp()}.xlsx`);
      showMsg(successMsg);
    } catch (e) { logExportError(label, e); }
  };

  const handleExportSemesterWise = () => exportSemesterGrouped(
    'Semester-wise', () => true, 'Enrollment_Semester',
    s => `Semester ${s}`, '✅ Semester-wise export done!'
  );

  const handleExportOddSemesters = () => exportSemesterGrouped(
    'Odd-Sem', d => d.semester % 2 !== 0, 'Enrollment_OddSem',
    s => `Sem ${s} (Odd)`, '✅ Odd semester export done!'
  );

  const handleExportEvenSemesters = () => exportSemesterGrouped(
    'Even-Sem', d => d.semester % 2 === 0, 'Enrollment_EvenSem',
    s => `Sem ${s} (Even)`, '✅ Even semester export done!'
  );

  // ── Enrollment Import from Excel ───────────────────────────────────
  const handleImportEnrollment = async (e) => {
    const file = e.target.files[0]; if (!file) return; setImporting(true);
    setImportErrors([]);
    try {
      const data = await file.arrayBuffer(); const wb = XLSX.read(data);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

      // Build discipline name → ID lookup
      const discMap = {};
      disciplines.forEach(d => { discMap[d.discipline_name.toLowerCase()] = d.discipline_id; });

      // ── PRE-FLIGHT: scan rows, collect validation warnings ──
      const warnings = [];
      rows.forEach((row, idx) => {
        const rowNum = idx + 2; // +2 = 1-indexed + header row
        const roll_no = String(row.roll_no || '').trim();
        const name = roll_no || '(no roll_no)';

        if (!roll_no) {
          warnings.push({ row: rowNum, name, email: '', severity: 'error', reason: 'Missing roll_no' });
        }

        // Collect discipline names from discipline_1/2/3 columns
        const discNames = [row.discipline_1, row.discipline_2, row.discipline_3].filter(Boolean);
        if (discNames.length === 0) {
          warnings.push({ row: rowNum, name, email: '', severity: 'error', reason: 'No disciplines provided (need at least discipline_1)' });
        }
        discNames.forEach((dname, i) => {
          if (!discMap[String(dname).toLowerCase()]) {
            warnings.push({ row: rowNum, name, email: '', severity: 'error', reason: `discipline_${i+1} "${dname}" not found in system` });
          }
        });
      });

      const blockingCount = warnings.filter(w => w.severity === 'error').length;
      const warningCount = warnings.filter(w => w.severity === 'warning').length;
      if (warnings.length > 0) {
        const proceed = window.confirm(
          `Pre-flight check found ${blockingCount} error(s) and ${warningCount} warning(s) across ${rows.length} rows.\n\n` +
          `Rows with errors will be skipped.\n\n` +
          `Click OK to proceed (failures will be reported after).\n` +
          `Click Cancel to abort and fix the file first.`
        );
        if (!proceed) {
          setImportErrors(warnings);
          setImportErrorsOpen(true);
          setImporting(false);
          e.target.value = '';
          return;
        }
      }

      // ── BUILD PAYLOAD: resolve discipline names → IDs per row ──
      const enrollments = rows.map(row => {
        const roll_no = String(row.roll_no || '').trim();
        const discNames = [row.discipline_1, row.discipline_2, row.discipline_3].filter(Boolean);
        const discipline_ids = discNames
          .map(n => discMap[String(n).toLowerCase()])
          .filter(Boolean);
        return { roll_no, discipline_ids };
      }).filter(r => r.roll_no && r.discipline_ids.length > 0);

      if (enrollments.length === 0) {
        showMsg('No valid rows to import', 'error');
        setImporting(false);
        e.target.value = '';
        return;
      }

      // ── SEND: backend handles per-row transactions + MAJOR auto-enrollment ──
      const res = await API.post('/enrollment/bulk-import', { enrollments });
      const { success, failed, disciplines_assigned, majors_assigned, locked_skipped, errors } = res.data;

      // Show summary toast with new response fields
      const parts = [`✅ ${success} students`];
      if (disciplines_assigned) parts.push(`${disciplines_assigned} disciplines`);
      if (majors_assigned)      parts.push(`${majors_assigned} MAJORs enrolled`);
      if (locked_skipped)       parts.push(`${locked_skipped} locked (skipped)`);
      if (failed)               parts.push(`❌ ${failed} failed`);
      showMsg(parts.join(' · '), failed ? 'warning' : 'success');

      // Merge server errors with pre-flight warnings into the errors modal
      const serverErrors = (errors || []).map(err => ({
        row: '—', name: err.roll_no || '(unknown)', email: '',
        severity: 'error', reason: err.error || 'Unknown error'
      }));
      const allIssues = [...serverErrors, ...warnings.filter(w => w.severity === 'warning')];
      if (allIssues.length > 0) {
        setImportErrors(allIssues);
        setImportErrorsOpen(true);
      }

      fetchEnrollmentSummary();
    } catch (err) {
      console.error('[Import] Enrollment failed:', err);
      showMsg('Import failed: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setImporting(false); e.target.value = '';
    }
  }; 

  // ── Enrollment Export: Summary (uses enrollmentSummary state) ──────
  const exportEnrollmentSummary = () => {
    try {
      if (!enrollmentSummary?.length) { showMsg('No summary data to export', 'error'); return; }
      const rows = enrollmentSummary.map(s => ({
        'Roll No': s.roll_no,
        'Student Name': s.student_name,
        'Programme': s.programme_name || '—',
        'Level': s.level_name || '—',
        'Semester': s.semester,
        'Status': s.accepted > 0 ? 'Submitted' : s.total_enrolled > 0 ? 'Draft' : 'Not Enrolled',
        'Total Enrolled': s.total_enrolled || 0,
        'Accepted': s.accepted || 0,
        'Rejected': s.rejected || 0,
        'Pending': s.pending || 0,
        'Admin Modified': s.admin_modified ? 'Yes' : 'No',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Enrollment Summary');
      XLSX.writeFile(wb, `Enrollment_Summary_${todayStamp()}.xlsx`);
      showMsg('✅ Summary exported!');
    } catch (e) { logExportError('Summary', e); }
  };

  // ── Enrollment Export: Full Detail (one row per enrollment) ────────
  const exportEnrollmentDetail = async () => {
    try {
      const data = applyEnrollmentFilters(await fetchEnrollmentExportData());
      if (!data.length) { showMsg('No enrollment data matches current filters', 'error'); return; }

      const rows = data.map(e => ({
        'Roll No': e.roll_no,
        'Student Name': e.student_name,
        'Programme': e.programme_name || '—',
        'Level': e.level_name || '—',
        'Semester': e.semester,
        'Subject Code': e.subject_code,
        'Subject Name': e.subject_name,
        'Category': e.category,
        'Credits': e.credits,
        'Status': e.status || 'NOT ENROLLED',
        'Is Major': e.is_major,
        'Admin Modified': e.admin_modified,
        'Remarks': e.remarks || '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 18) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Enrollment Detail');
      XLSX.writeFile(wb, `Enrollment_Detail_${todayStamp()}.xlsx`);
      showMsg('✅ Full detail exported!');
    } catch (e) { logExportError('Full Detail', e); }
  };

  // ── Marks Export Functions ─────────────────────────────────────────────────

  // Helper: build ONE marks sheet for a specific exam type
  // No Total, No %, No External
  const buildMarksSheetByType = (data, examType) => {
    const typeData = data.filter(d => d.exam_type === examType);
    if (!typeData.length) return [];

    // Unique students
    const students = [...new Map(data.map(d => [d.roll_no, {
      roll_no: d.roll_no, student_name: d.student_name,
      semester: d.semester, programme_name: d.programme_name
    }])).values()].sort((a,b) => a.roll_no.localeCompare(b.roll_no));

    // Unique subjects that have this exam type
    const subjects = [...new Map(typeData.map(d => [d.subject_code, {
      subject_code: d.subject_code, subject_name: d.subject_name,
      category: d.category, max_marks: d.max_marks
    }])).values()].sort((a,b) => a.subject_code.localeCompare(b.subject_code));

    return students.map(stu => {
      const row = {
        'Roll No': stu.roll_no,
        'Student Name': stu.student_name,
        'Programme': stu.programme_name,
        'Semester': stu.semester,
      };
      subjects.forEach(sub => {
        const mark = typeData.find(d => d.roll_no === stu.roll_no && d.subject_code === sub.subject_code);
        row[`${sub.subject_code} (/${sub.max_marks})`] = mark ? mark.marks_obtained : '—';
      });
      return row;
    });
  };

  // Generic marks export with 3 sheets: Internal, Practical Internal, Assignment
  const exportMarksToWorkbook = (data, filename) => {
    const wb = XLSX.utils.book_new();
    const examTypes = [
      { key: 'INTERNAL',           label: 'Internal Theory' },
      { key: 'PRACTICAL_INTERNAL', label: 'Practical Internal' },
      { key: 'ASSIGNMENT',         label: 'Assignment' },
    ];
    let hasSheet = false;
    examTypes.forEach(({ key, label }) => {
      const rows = buildMarksSheetByType(data, key);
      if (!rows.length) return;
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 16) }));
      XLSX.utils.book_append_sheet(wb, ws, label.substring(0, 31));
      hasSheet = true;
    });
    if (!hasSheet) return false;
    XLSX.writeFile(wb, filename);
    return true;
  };

  // Export marks programme-wise (one file per programme, 3 sheets inside)
  const exportMarksProgrammeWise = async () => {
    try {
      const r = await API.get('/admin/marks/export');
      const data = r.data;
      if (!data.length) { showMsg('No marks data to export', 'error'); return; }
      const programmes = [...new Set(data.map(d => d.programme_name))].sort();
      programmes.forEach(prog => {
        const progData = data.filter(d => d.programme_name === prog);
        exportMarksToWorkbook(progData, `Marks_${prog.replace(/[^a-zA-Z0-9]/g,'_')}_${todayStamp()}.xlsx`);
      });
      showMsg(`✅ Marks exported for ${programmes.length} programme(s)!`);
    } catch (e) { logExportError('Marks Programme-wise', e); }
  };

  // ── Marks Export: generic semester-grouped helper ─────────────────
  // Used by Semester-wise, Odd Sem, and Even Sem marks exports.
  // One file, one sheet per (semester × exam type) combination.
  const exportMarksSemesterGrouped = async (label, filterFn, filenamePrefix, successMsg) => {
    try {
      const r = await API.get('/admin/marks/export');
      const data = r.data.filter(filterFn);
      if (!data.length) { showMsg(`No marks data for ${label}`, 'error'); return; }

      const wb = XLSX.utils.book_new();
      const examTypes = [
        { key: 'INTERNAL',           label: 'Internal Theory' },
        { key: 'PRACTICAL_INTERNAL', label: 'Practical Internal' },
        { key: 'ASSIGNMENT',         label: 'Assignment' },
      ];
      const semesters = [...new Set(data.map(d => d.semester))].sort((a, b) => a - b);

      semesters.forEach(sem => {
        const semData = data.filter(d => d.semester === sem);
        examTypes.forEach(({ key, label: etLabel }) => {
          const rows = buildMarksSheetByType(semData, key);
          if (!rows.length) return;
          const ws = XLSX.utils.json_to_sheet(rows);
          ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 16) }));
          XLSX.utils.book_append_sheet(wb, ws, `Sem${sem}-${etLabel.substring(0, 18)}`);
        });
      });

      XLSX.writeFile(wb, `${filenamePrefix}_${todayStamp()}.xlsx`);
      showMsg(successMsg);
    } catch (e) { logExportError(`Marks ${label}`, e); }
  };

  const exportMarksSemesterWise = () => exportMarksSemesterGrouped(
    'Semester-wise', () => true, 'Marks_SemesterWise',
    '✅ Semester-wise marks exported!'
  );

  const exportMarksOddSem = () => exportMarksSemesterGrouped(
    'Odd-Sem', d => d.semester % 2 !== 0, 'Marks_OddSem',
    '✅ Odd semester marks exported!'
  );

  const exportMarksEvenSem = () => exportMarksSemesterGrouped(
    'Even-Sem', d => d.semester % 2 === 0, 'Marks_EvenSem',
    '✅ Even semester marks exported!'
  );

  // Per-subject export: Excel + PDF for all students of one programme
  // Shows: Roll No, Name, Internal, Assignment, Practical Internal marks
  const exportSubjectMarks = async () => {
    try {
      const r = await API.get('/admin/marks/export');
      const allData = r.data;
      if (!allData.length) { showMsg('No marks data to export', 'error'); return; }

      // Get all unique subjects
      const subjects = [...new Map(allData.map(d => [d.subject_code, {
        subject_code: d.subject_code,
        subject_name: d.subject_name,
        programme_name: d.programme_name,
        semester: d.semester,
        category: d.category,
      }])).values()].sort((a,b) => a.subject_code.localeCompare(b.subject_code));

      const examTypes = [
        { key: 'INTERNAL',           label: 'Internal' },
        { key: 'ASSIGNMENT',         label: 'Assignment' },
        { key: 'PRACTICAL_INTERNAL', label: 'Practical Internal' },
      ];

      // One Excel file with one sheet per subject
      const wb = XLSX.utils.book_new();

      subjects.forEach(sub => {
        const subData = allData.filter(d => d.subject_code === sub.subject_code);
        const students = [...new Map(subData.map(d => [d.roll_no, {
          roll_no: d.roll_no, student_name: d.student_name,
          programme_name: d.programme_name, semester: d.semester
        }])).values()].sort((a,b) => a.roll_no.localeCompare(b.roll_no));

        const rows = students.map((stu, idx) => {
          const row = {
            'S.No': idx + 1,
            'Roll No': stu.roll_no,
            'Student Name': stu.student_name,
            'Programme': stu.programme_name,
            'Semester': stu.semester,
          };
          examTypes.forEach(({ key, label }) => {
            const mark = subData.find(d => d.roll_no === stu.roll_no && d.exam_type === key);
            if (mark) row[`${label} (/${mark.max_marks})`] = mark.marks_obtained;
          });
          return row;
        });

        if (!rows.length) return;
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 16) }));
        // Sheet name = subject code (max 31 chars)
        const sheetName = sub.subject_code.replace(/[\/\?*\[\]]/g,'').substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      XLSX.writeFile(wb, `Marks_SubjectWise_${todayStamp()}.xlsx`);

      // PDF: one PDF per subject using printable HTML
      subjects.forEach(sub => {
        const subData = allData.filter(d => d.subject_code === sub.subject_code);
        const students = [...new Map(subData.map(d => [d.roll_no, {
          roll_no: d.roll_no, student_name: d.student_name,
          programme_name: d.programme_name, semester: d.semester
        }])).values()].sort((a,b) => a.roll_no.localeCompare(b.roll_no));

        if (!students.length) return;

        const prog = students[0].programme_name;
        const sem  = students[0].semester;

        // Build HTML table
        const typeHeaders = examTypes.map(({ key, label }) => {
          const sample = subData.find(d => d.exam_type === key);
          return sample ? `<th>${label} (/${sample.max_marks})</th>` : '';
        }).join('');

        const bodyRows = students.map((stu, idx) => {
          const cells = examTypes.map(({ key }) => {
            const mark = subData.find(d => d.roll_no === stu.roll_no && d.exam_type === key);
            return `<td>${mark ? mark.marks_obtained : '—'}</td>`;
          }).join('');
          return `<tr><td>${idx+1}</td><td>${stu.roll_no}</td><td>${stu.student_name}</td>${cells}</tr>`;
        }).join('');

        const html = `
          <html><head><title>${sub.subject_code}</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
            h2 { margin: 0 0 4px; } h4 { margin: 0 0 12px; color: #555; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th { background: #2d3748; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
            td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
            tr:nth-child(even) { background: #f7fafc; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2d3748; padding-bottom: 8px; margin-bottom: 4px; }
          </style></head>
          <body>
            <div class="header">
              <div>
                <h2>${sub.subject_code} — ${sub.subject_name}</h2>
                <h4>${prog} | Semester ${sem} | ${sub.category}</h4>
              </div>
              <div style="text-align:right;font-size:11px;color:#555;">
                Generated: ${new Date().toLocaleDateString('en-IN')}<br/>
                Total Students: ${students.length}
              </div>
            </div>
            <table>
              <thead><tr><th>S.No</th><th>Roll No</th><th>Student Name</th>${typeHeaders}</tr></thead>
              <tbody>${bodyRows}</tbody>
            </table>
          </body></html>`;

        const w = window.open('', '_blank');
        if (w) {
          w.document.write(html);
          w.document.close();
          w.focus();
          setTimeout(() => { w.print(); }, 500);
        }
      });

      showMsg('✅ Subject-wise Excel downloaded! PDF print dialogs opening...');
    } catch(e) { showMsg('Export failed: ' + e.message, 'error'); }
  };

  // ── Attendance Export Functions ────────────────────────────────────────────

  // Helper: build attendance sheet for a group of data
  // One row per student, each subject as columns: Present, Absent, Late, Total, %
  const buildAttendanceSheet = (data) => {
    const students = [...new Map(data.map(d => [d.roll_no, {
      roll_no: d.roll_no, student_name: d.student_name,
      programme_name: d.programme_name, semester: d.semester
    }])).values()].sort((a,b) => a.roll_no.localeCompare(b.roll_no));

    const subjects = [...new Map(data.map(d => [d.subject_code, {
      subject_code: d.subject_code, subject_name: d.subject_name
    }])).values()].sort((a,b) => a.subject_code.localeCompare(b.subject_code));

    return students.map((stu, idx) => {
      const row = {
        'S.No': idx + 1,
        'Roll No': stu.roll_no,
        'Student Name': stu.student_name,
        'Programme': stu.programme_name,
        'Semester': stu.semester,
      };
      subjects.forEach(sub => {
        const rec = data.find(d => d.roll_no === stu.roll_no && d.subject_code === sub.subject_code);
        const total   = rec?.total_classes || 0;
        const present = rec?.present || 0;
        const absent  = rec?.absent  || 0;
        const late    = rec?.late    || 0;
        const pct     = rec?.attendance_pct || 0;
        row[`${sub.subject_code} Present`] = present;
        row[`${sub.subject_code} Absent`]  = absent;
        row[`${sub.subject_code} Late`]    = late;
        row[`${sub.subject_code} Total`]   = total;
        row[`${sub.subject_code} %`]       = pct ? `${pct}%` : '—';
      });
      return row;
    });
  };

  // Helper: build attendance sheet from summary API data
  const buildAttendanceSummarySheet = (data) => {
    const students = [...new Map(data.map(d => [d.roll_no, {
      roll_no: d.roll_no, student_name: d.student_name,
      programme_name: d.programme_name, semester: d.semester
    }])).values()].sort((a,b) => a.roll_no.localeCompare(b.roll_no));

    const subjects = [...new Map(data.map(d => [d.subject_code, {
      subject_code: d.subject_code, subject_name: d.subject_name
    }])).values()].sort((a,b) => a.subject_code.localeCompare(b.subject_code));

    return students.map((stu, idx) => {
      const row = {
        'S.No': idx + 1,
        'Roll No': stu.roll_no,
        'Student Name': stu.student_name,
        'Programme': stu.programme_name,
        'Semester': stu.semester,
      };
      subjects.forEach(sub => {
        const rec = data.find(d => d.roll_no === stu.roll_no && d.subject_code === sub.subject_code);
        row[`${sub.subject_code} P`]     = rec ? rec.present  : '—';
        row[`${sub.subject_code} A`]     = rec ? rec.absent   : '—';
        row[`${sub.subject_code} L`]     = rec ? rec.late     : '—';
        row[`${sub.subject_code} Total`] = rec ? rec.total_classes : '—';
        row[`${sub.subject_code} %`]     = rec ? `${rec.attendance_pct}%` : '—';
      });
      return row;
    });
  };

  // Export attendance programme-wise Excel
  const exportAttendanceProgrammeWise = async () => {
    try {
      const r = await API.get('/admin/attendance/summary');
      const data = r.data;
      if (!data.length) { showMsg('No attendance data to export', 'error'); return; }

      const wb = XLSX.utils.book_new();
      const programmes = [...new Set(data.map(d => d.programme_name))].sort();

      programmes.forEach(prog => {
        const progData = data.filter(d => d.programme_name === prog);
        const rows = buildAttendanceSummarySheet(progData);
        if (!rows.length) return;
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 14) }));
        XLSX.utils.book_append_sheet(wb, ws, prog.replace(/[\/\?*\[\]]/g,'').substring(0,31));
      });

      XLSX.writeFile(wb, `Attendance_Programme_${todayStamp()}.xlsx`);
      showMsg('✅ Programme-wise attendance exported!');
    } catch(e) { showMsg('Attendance export failed', 'error'); }
  };

  // Export attendance subject-wise Excel + PDF
  const exportAttendanceSubjectWise = async () => {
    try {
      const r = await API.get('/admin/attendance/summary');
      const data = r.data;
      if (!data.length) { showMsg('No attendance data to export', 'error'); return; }

      const subjects = [...new Map(data.map(d => [d.subject_code, {
        subject_code: d.subject_code, subject_name: d.subject_name,
        category: d.category
      }])).values()].sort((a,b) => a.subject_code.localeCompare(b.subject_code));

      // One Excel with one sheet per subject
      const wb = XLSX.utils.book_new();

      subjects.forEach(sub => {
        const subData = data.filter(d => d.subject_code === sub.subject_code);
        const students = [...new Map(subData.map(d => [d.roll_no, d])).values()]
          .sort((a,b) => a.roll_no.localeCompare(b.roll_no));

        const rows = students.map((stu, idx) => ({
          'S.No':         idx + 1,
          'Roll No':      stu.roll_no,
          'Student Name': stu.student_name,
          'Programme':    stu.programme_name,
          'Semester':     stu.semester,
          'Total Classes':stu.total_classes,
          'Present':      stu.present,
          'Absent':       stu.absent,
          'Late':         stu.late,
          'Attendance %': `${stu.attendance_pct}%`,
        }));

        if (!rows.length) return;
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 14) }));
        XLSX.utils.book_append_sheet(wb, ws, sub.subject_code.replace(/[\/\?*\[\]]/g,'').substring(0,31));
      });

      XLSX.writeFile(wb, `Attendance_SubjectWise_${todayStamp()}.xlsx`);

      // PDF — one per subject
      subjects.forEach(sub => {
        const subData = data.filter(d => d.subject_code === sub.subject_code);
        const students = [...new Map(subData.map(d => [d.roll_no, d])).values()]
          .sort((a,b) => a.roll_no.localeCompare(b.roll_no));
        if (!students.length) return;

        const prog = students[0].programme_name;
        const sem  = students[0].semester;

        const bodyRows = students.map((stu, idx) => {
          const pct = Number(stu.attendance_pct);
          const color = pct >= 75 ? '#276749' : pct >= 60 ? '#92400e' : '#c53030';
          return `<tr>
            <td>${idx+1}</td>
            <td>${stu.roll_no}</td>
            <td>${stu.student_name}</td>
            <td>${stu.total_classes}</td>
            <td>${stu.present}</td>
            <td>${stu.absent}</td>
            <td>${stu.late}</td>
            <td style="color:${color};font-weight:700">${stu.attendance_pct}%</td>
          </tr>`;
        }).join('');

        const html = `
          <html><head><title>${sub.subject_code}</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
            h2 { margin: 0 0 4px; } h4 { margin: 0 0 12px; color: #555; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th { background: #2d3748; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
            td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
            tr:nth-child(even) { background: #f7fafc; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2d3748; padding-bottom: 8px; margin-bottom: 4px; }
          </style></head>
          <body>
            <div class="header">
              <div>
                <h2>${sub.subject_code} — ${sub.subject_name}</h2>
                <h4>${prog} | Semester ${sem} | ${sub.category}</h4>
              </div>
              <div style="text-align:right;font-size:11px;color:#555;">
                Generated: ${new Date().toLocaleDateString('en-IN')}<br/>
                Total Students: ${students.length}
              </div>
            </div>
            <table>
              <thead><tr>
                <th>S.No</th><th>Roll No</th><th>Student Name</th>
                <th>Total</th><th>Present</th><th>Absent</th><th>Late</th><th>%</th>
              </tr></thead>
              <tbody>${bodyRows}</tbody>
            </table>
          </body></html>`;

        const w = window.open('', '_blank');
        if (w) {
          w.document.write(html);
          w.document.close();
          w.focus();
          setTimeout(() => { w.print(); }, 500);
        }
      });

      showMsg('✅ Subject-wise attendance Excel downloaded! PDF print dialogs opening...');
    } catch(e) { showMsg('Attendance export failed: ' + e.message, 'error'); }
  };

  const exportSubjectWise = async () => {
    try {
      const r = await API.get('/admin/enrollment/export-subject-wise');
      const rows = r.data.map(e => ({
        'Subject Code': e.subject_code,
        'Subject Name': e.subject_name,
        'Category': e.category,
        'Programme': e.programme_name || 'Common',
        'Semester': e.semester,
        'Credits': e.credits,
        'Roll No': e.roll_no,
        'Student Name': e.student_name,
        'Status': e.status,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Subject-wise');
      XLSX.writeFile(wb, 'enrollment_subject_wise.xlsx');
    } catch(e) { showMsg('Failed to export', 'error'); }
  };

  const openEnrollmentDetail = async (student) => {
    setSelectedEnrollStudent(student);
    setAdminNote('');
    setEnrollValidationErrors([]);
    try { const r = await API.get(`/admin/enrollment/detail/${student.student_id}`); setEnrollmentDetail(r.data); } catch(e){}
  };

  const handleEnrollStatusChange = (subject_id, newStatus) => {
    setEnrollmentDetail(prev => {
      let updated = prev.map(s => s.subject_id === subject_id ? { ...s, status: newStatus } : s);
      const sub = prev.find(s => s.subject_id === subject_id);
      // Auto-sync T/P pair
      if (sub && sub.pair_code) {
        updated = updated.map(s => s.subject_code.trim() === sub.pair_code.trim() ? { ...s, status: newStatus } : s);
      }
      // Auto-reject other subjects in single-select categories when accepting
      if (newStatus === 'ACCEPTED' && sub) {
        const singleSelectCats = ['MDC', 'MIC', 'VAC', 'AEC'];
        if (singleSelectCats.includes(sub.category)) {
          // Get the paired practical code for the newly accepted subject
          const acceptedCodes = new Set([sub.subject_code.trim()]);
          if (sub.pair_code) acceptedCodes.add(sub.pair_code.trim());
          updated = updated.map(s => {
            if (s.category === sub.category && !acceptedCodes.has(s.subject_code.trim()) && s.status === 'ACCEPTED') {
              return { ...s, status: 'REJECTED' };
            }
            return s;
          });
        }
      }
      // Run validation on the updated detail directly
      runValidationOn(updated);
      return updated;
    });
  };

  const getBaseCode = (code) => {
    const c = code.trim();
    const last = c.slice(-1).toUpperCase();
    return ['T','P'].includes(last) ? c.slice(0,-1) : c;
  };

  const runValidationOn = (detail) => {
    const errors = validateAdminEnrollment(detail);
    return errors;
  };

  const validateAdminEnrollment = (detail) => {
    const enrollDetail = detail || enrollmentDetail;
    const isPG = selectedEnrollStudent?.level_name === 'PG'
      || Number(selectedEnrollStudent?.level_id) === 2
      || String(selectedEnrollStudent?.course||'').toUpperCase().startsWith('M.');

    const accepted = enrollDetail.filter(s => s.status === 'ACCEPTED');
    const byCategory = {};
    accepted.forEach(s => {
      if (!byCategory[s.category]) byCategory[s.category] = [];
      byCategory[s.category].push(s);
    });

    const errors = [];
    const majorDisciplines = (byCategory['MAJOR']||[]).map(s => s.discipline_id).filter(Boolean);

    if (isPG) {
      // PG Validations
      const vac = byCategory['VAC'] || [];
      if (enrollDetail.some(s=>s.category==='VAC') && vac.length > 1)
        errors.push(`❌ VAC: Select only 1 (selected ${vac.length})`);

      const elective = byCategory['ELECTIVE'] || [];
      if (enrollDetail.some(s=>s.category==='ELECTIVE') && elective.length > 1)
        errors.push(`❌ Elective: Select only 1 (selected ${elective.length})`);

      const fin = (byCategory['ELECTIVE_FINANCE']||[]).length;
      const hr  = (byCategory['ELECTIVE_HR']||[]).length;
      const mkt = (byCategory['ELECTIVE_MARKETING']||[]).length;
      const decTotal = fin + hr + mkt;
      if (enrollDetail.some(s=>['ELECTIVE_FINANCE','ELECTIVE_HR','ELECTIVE_MARKETING'].includes(s.category)) && decTotal > 0) {
        if (decTotal !== 4) errors.push(`❌ DEC: Must select exactly 4 (selected ${decTotal})`);
        else {
          const groups = [fin,hr,mkt].filter(n=>n>0);
          const isCore = groups.length===1 && groups[0]===4;
          const isMixed = groups.length===2 && groups.every(n=>n===2);
          if (!isCore && !isMixed) errors.push(`❌ DEC: Invalid combination. Finance=${fin}, HR=${hr}, Marketing=${mkt}`);
        }
      }
    } else {
      // UG Validations
      const mic = byCategory['MIC'] || [];
      if (mic.length > 1) errors.push(`❌ MIC: Select only 1 (selected ${mic.length})`);
      else if (mic.length===1 && majorDisciplines.includes(mic[0].discipline_id))
        errors.push(`❌ MIC: "${mic[0].subject_name}" conflicts with MAJOR discipline`);

      const vac = byCategory['VAC'] || [];
      if (vac.length > 1) errors.push(`❌ VAC: Select only 1 (selected ${vac.length})`);

      const aec = byCategory['AEC'] || [];
      if (aec.length > 1) errors.push(`❌ AEC: Select only 1 (selected ${aec.length})`);

      const mdc = byCategory['MDC'] || [];
      if (mdc.length > 0) {
        mdc.forEach(s => { if (majorDisciplines.includes(s.discipline_id)) errors.push(`❌ MDC: "${s.subject_name}" conflicts with MAJOR`); });
        const mdcGroups = {};
        mdc.forEach(s => { const b=getBaseCode(s.subject_code); if(!mdcGroups[b]) mdcGroups[b]=[]; mdcGroups[b].push(s); });
        if (Object.keys(mdcGroups).length > 1) errors.push('❌ MDC: Select from only ONE group');
      }

      const sec = byCategory['SEC'] || [];
      if (sec.length > 0) {
        const secGroups = {};
        sec.forEach(s => { const b=getBaseCode(s.subject_code); if(!secGroups[b]) secGroups[b]=[]; secGroups[b].push(s); });
        if (Object.keys(secGroups).length > 1) errors.push('❌ SEC: Select from only ONE group');
      }

      // T/P pair sync check
      enrollDetail.forEach(s => {
        if (s.pair_type === 'THEORY' && s.pair_code) {
          const practical = enrollDetail.find(s2 => s2.subject_code.trim() === s.pair_code.trim());
          if (practical && s.status !== practical.status)
            errors.push(`❌ ${s.subject_code}: Theory and Practical must have same status`);
        }
      });
    }

    return errors;
  };

  const handleEnrollSave = async () => {
    const errors = validateAdminEnrollment(enrollmentDetail);
    if (errors.length > 0) {
      setEnrollValidationErrors(errors);
      showMsg(`⚠️ Fix ${errors.length} validation error(s) before saving`, 'error');
      return;
    }
    const changes = enrollmentDetail
      .filter(s => s.status)
      .map(s => ({ subject_id: s.subject_id, status: s.status }));
    if (changes.length === 0) { showMsg('No changes to save', 'error'); return; }
    try {
      await API.put(`/admin/enrollment/bulkupdate/${selectedEnrollStudent.student_id}`, { changes, admin_note: adminNote });
      showMsg(`✅ ${changes.length} subject(s) updated!`);
      setEnrollValidationErrors([]);
      fetchEnrollmentSummary();
      openEnrollmentDetail(selectedEnrollStudent);
    } catch(e) { showMsg(e.response?.data?.error || 'Error', 'error'); }
  };

  const handleEnrollReset = async (student) => {
    if (!window.confirm(`Reset all enrollment for ${student.name}?`)) return;
    try {
      await API.delete(`/admin/enrollment/reset/${student.student_id}`);
      showMsg('Enrollment reset!');
      fetchEnrollmentSummary();
      if (selectedEnrollStudent?.student_id === student.student_id) openEnrollmentDetail(student);
    } catch(e) { showMsg('Reset failed', 'error'); }
  };

  // Helper to get faculty name from faculty_id
  const getFacultyName = (faculty_id) => {
    const f = faculties.find(f => String(f.faculty_id) === String(faculty_id));
    return f ? f.faculty_name : 'N/A';
  };

  const getFacultyColor = (faculty_id) => {
    const name = getFacultyName(faculty_id);
    return facultyColors[name] || '#667eea';
  };

  const showMsg = (text, type = 'success') => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(''), 4000); };

  const handleDelete = async (type, id) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      await API.delete(`/admin/${type}/${id}`);
      showMsg('Deleted!');
      if (type === 'students') fetchStudents();
      if (type === 'teachers') fetchTeachers();
    } catch(e) { showMsg('Delete failed!', 'error'); }
  };

  const handleAddLevel = async (e) => {
    e.preventDefault();
    try { await API.post('/levels', form); showMsg('Level added!'); setForm({}); fetchLevels(); }
    catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleAddFaculty = async (e) => {
    e.preventDefault();
    try { await API.post('/faculties', form); showMsg('Faculty added!'); setForm({}); fetchFaculties(); }
    catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleAddProgramme = async (e) => {
    e.preventDefault();
    try { await API.post('/programmes', form); showMsg('Programme added!'); setForm({}); fetchProgrammes(); }
    catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    try {
      const selectedProg = programmes.find(p => String(p.programme_id) === String(form.programme_id));
      const finalFacultyId = studentFaculty || selectedProg?.faculty_id || '';
      // Use the form's dedicated first_name / last_name inputs (not legacy "name" field)
      const first_name = (form.first_name || '').trim();
      const last_name  = (form.last_name  || '').trim();
      if (!first_name) { showMsg('First name is required', 'error'); return; }
      const discipline_ids = [form.discipline_1, form.discipline_2, form.discipline_3].filter(Boolean).map(Number);
      const payload = { ...form, first_name, last_name, level_id: studentLevel, faculty_id: finalFacultyId, discipline_ids };
      delete payload.name;
      delete payload.discipline_1; delete payload.discipline_2; delete payload.discipline_3;
      const result = await API.post('/students', payload);
      const majors = result.data.majors_assigned || 0;
      const discs  = result.data.disciplines_assigned || 0;
      const extra  = (discs || majors) ? ` (${discs} disciplines, ${majors} MAJORs auto-assigned)` : '';
      showMsg('Student added!' + extra);
      setForm({}); setStudentLevel(''); setStudentFaculty(''); fetchStudents();
    } catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    try {
      await API.put('/students/' + editingStudent.student_id, editingStudent);
      // Save disciplines if set
      const discIds = [editingStudent.discipline_1, editingStudent.discipline_2, editingStudent.discipline_3].filter(Boolean).map(Number);
      if (discIds.length > 0) {
        await API.post('/admin/students/' + editingStudent.student_id + '/disciplines', { discipline_ids: discIds });
      }
      showMsg('Student updated!'); setEditingStudent(null); fetchStudents();
    } catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleAddTeacher = async (e) => {
    e.preventDefault();
    try { await API.post('/admin/teachers', form); showMsg('Teacher added!'); setForm({}); fetchTeachers(); }
    catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleUpdateTeacher = async (e) => {
    e.preventDefault();
    try {
      // Always derive discipline_ids and department_ids so the backend never sees them as undefined
      const discipline_ids = editingTeacher.discipline_ids ?? (editingTeacher.disciplines || []).map(d => d.discipline_id);
      const department_ids = editingTeacher.department_ids ?? (editingTeacher.departments || []).map(d => d.department_id);
      await API.put(`/admin/teachers/${editingTeacher.teacher_id}`, { ...editingTeacher, discipline_ids, department_ids });
      showMsg('Teacher updated!'); setEditingTeacher(null); fetchTeachers();
    } catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const openManageSubjects = async (teacher) => {
    setManagingTeacher(teacher);
    setEditingTeacher(null);
    setEditingAssignment(null);
    try {
      const [filtered, assigned] = await Promise.all([
        API.get(`/admin/teachers/${teacher.teacher_id}/subjects`),
        API.get(`/subjects/teacher/${teacher.teacher_id}`)
      ]);
      setAllSubjects(filtered.data);
      setTeacherSubjects(assigned.data.map(s => s.subject_id));
      setAssignmentData(assigned.data);
    } catch(e) { showMsg('Failed to load subjects', 'error'); }
  };

  const refreshManageSubjects = async () => {
    if (!managingTeacher) return;
    try {
      const [filtered, assigned] = await Promise.all([
        API.get(`/admin/teachers/${managingTeacher.teacher_id}/subjects`),
        API.get(`/subjects/teacher/${managingTeacher.teacher_id}`)
      ]);
      setAllSubjects(filtered.data);
      setTeacherSubjects(assigned.data.map(s => s.subject_id));
      setAssignmentData(assigned.data);
    } catch(e) {}
  };

  const handleToggleSubject = async (subject_id, currentlyAssigned) => {
    try {
      if (currentlyAssigned) {
        await API.delete(`/subjects/${subject_id}/teachers/${managingTeacher.teacher_id}`);
        setTeacherSubjects(prev => prev.filter(id => id !== subject_id));
        showMsg('Subject unassigned');
      } else {
        await API.post(`/subjects/${subject_id}/teachers`, {
          teacher_id: managingTeacher.teacher_id,
          section: 'A',
          programme_id: null,
          class_name: null
        });
        setTeacherSubjects(prev => [...prev, subject_id]);
        showMsg('Subject assigned!');
      }
    } catch(e) { showMsg(e.response?.data?.error || 'Failed to update', 'error'); }
  };

  const handleUpdateAssignment = async (assignment) => {
    try {
      await API.put(`/subjects/assignments/${assignment.assignment_id}`, {
        section: assignment.section,
        programme_id: assignment.programme_id || null,
        class_name: assignment.class_name || null
      });
      showMsg('Assignment updated!');
      setEditingAssignment(null);
      const assigned = await API.get(`/subjects/teacher/${managingTeacher.teacher_id}`);
      setTeacherSubjects(assigned.data.map(s => s.subject_id));
      setAssignmentData(assigned.data);
    } catch(e) { showMsg(e.response?.data?.error || 'Failed to update assignment', 'error'); }
  };

  const handleBulkFee = async (e) => {
    e.preventDefault();
    try {
      const r = await API.post('/admin/fees/bulk', bulkFeeForm);
      showMsg(`✅ ${r.data.message}`);
      setBulkFeeForm({});
      fetchFees(); fetchFeeSummary();
    } catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleAddFee = async (e) => {
    e.preventDefault();
    try { await API.post('/fees', form); showMsg('Fee added!'); setForm({}); fetchFees(); }
    catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const handleMarkPaid = async (fee_id) => {
    try { await API.put(`/fees/pay/${fee_id}`); showMsg('Fee marked as paid!'); fetchFees(); }
    catch(err) { showMsg(err.response?.data?.error || 'Error', 'error'); }
  };

  const downloadTemplate = (type) => {
    const templates = {
students: [{ roll_no:'BA001', name:'Priya Sharma', email:'priya@college.com', phone:'9876543211', level_name:'UG', faculty_name:'Arts', programme_name:'B.A', semester:1, year:1, academic_year_id:2, password:'password123', discipline_1:'Economics', discipline_2:'History', discipline_3:'English' }],
      teachers: [
        { title:'Dr',   first_name:'Priya',  last_name:'Sharma', email:'priya.sharma@college.com',  phone:'9876543211', designation:'Assistant Professor', employee_code:'EMP001', password:'teacher123', discipline_1:'Economics',       discipline_2:'',        discipline_3:'', department_1:'Department of Economics',  department_2:'' },
        { title:'Prof', first_name:'Ramesh', last_name:'Verma',  email:'ramesh.verma@college.com',  phone:'9876543212', designation:'Professor',           employee_code:'EMP002', password:'teacher123', discipline_1:'Botany',          discipline_2:'Zoology', discipline_3:'', department_1:'Department of Botany',     department_2:'Department of Zoology' },
        { title:'Ms',   first_name:'Anjali', last_name:'Gupta',  email:'anjali.gupta@college.com',  phone:'9876543213', designation:'Associate Professor', employee_code:'EMP003', password:'teacher123', discipline_1:'Computer Science', discipline_2:'',        discipline_3:'', department_1:'Department of Computer Science', department_2:'' },
      ],
fees: [{ roll_no:'BCA001', amount:15000, fee_type:'Tuition Fee', due_date:'2026-04-01' }],
      enrollment: [
        { roll_no:'BCAAI101', discipline_1:'Computer Applications (BCA-AI)', discipline_2:'', discipline_3:'' },
        { roll_no:'BCA101',   discipline_1:'Computer Applications (BCA)',    discipline_2:'', discipline_3:'' },
        { roll_no:'BA101',    discipline_1:'Economics',                      discipline_2:'History', discipline_3:'English' },
      ],    };

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templates[type]);
    XLSX.utils.book_append_sheet(wb, ws, type);

    // For the teachers template, attach extra help sheets so users don't mistype discipline/department names
    if (type === 'teachers') {
      // Sheet 2: Instructions
      const instructions = [
        { Column:'title',          Required:'No',  Notes:'Honorific. Examples: Dr, Prof, Mr, Ms' },
        { Column:'first_name',     Required:'Yes', Notes:'Given name' },
        { Column:'last_name',      Required:'No',  Notes:'Surname. Blank is OK' },
        { Column:'email',          Required:'Yes', Notes:'Must be UNIQUE across all teachers. Used as login ID' },
        { Column:'phone',          Required:'No',  Notes:'10-digit mobile number. No +91 prefix' },
        { Column:'designation',    Required:'No',  Notes:'Assistant Professor / Associate Professor / Professor / Guest Faculty' },
        { Column:'employee_code',  Required:'No',  Notes:'Unique internal code (e.g. EMP001). Blank is OK' },
        { Column:'password',       Required:'No',  Notes:'If blank, defaults to "teacher123". Teacher should change on first login' },
        { Column:'discipline_1',   Required:'Yes', Notes:'Teacher\'s primary discipline. MUST EXACTLY match a name from the ValidValues sheet (case insensitive). If no match, the import silently drops it and the teacher will have no discipline assigned' },
        { Column:'discipline_2',   Required:'No',  Notes:'Secondary discipline if the teacher holds multiple. Same matching rule as above' },
        { Column:'discipline_3',   Required:'No',  Notes:'Third discipline if applicable' },
        { Column:'department_1',   Required:'Yes', Notes:'Primary department. MUST EXACTLY match a name from the ValidValues sheet. Format is "Department of X", not "X Department"' },
        { Column:'department_2',   Required:'No',  Notes:'Secondary department if teacher belongs to multiple' },
        { Column:'',               Required:'',    Notes:'' },
        { Column:'COMMON MISTAKES', Required:'', Notes:'' },
        { Column:'Typos in discipline/department name', Required:'', Notes:'Silent drop — teacher imported but discipline/department not linked. Use copy-paste from ValidValues sheet' },
        { Column:'Duplicate email', Required:'', Notes:'Row fails. Check existing teachers in Admin > Teachers tab before adding' },
        { Column:'"Economics Department" instead of "Department of Economics"', Required:'', Notes:'Silent drop. Department names always start with "Department of"' },
        { Column:'Extra spaces in names', Required:'', Notes:'Trimmed automatically, but avoid to be safe' },
      ];
      const wsInstructions = XLSX.utils.json_to_sheet(instructions);
      XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

      // Sheet 3: ValidValues — exact discipline and department names for copy-paste
      const validValues = [];
      const maxLen = Math.max(disciplines.length, departments.length);
      for (let i = 0; i < maxLen; i++) {
        validValues.push({
          'Discipline Name (copy for discipline_1/2/3)': disciplines[i]?.discipline_name || '',
          'Discipline ID (for reference)':                disciplines[i]?.discipline_id   || '',
          'Department Name (copy for department_1/2)':   departments[i]?.department_name  || '',
          'Department ID (for reference)':                departments[i]?.department_id    || '',
        });
      }
      const wsValidValues = XLSX.utils.json_to_sheet(validValues);
      XLSX.utils.book_append_sheet(wb, wsValidValues, 'ValidValues');
    }

    XLSX.writeFile(wb, `${type}_template.xlsx`);
  };

  const handleImportStudents = async (e) => {
    const file = e.target.files[0]; if (!file) return; setImporting(true);
    try {
      const data = await file.arrayBuffer(); const wb = XLSX.read(data);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const levelMap = {}; levels.forEach(l => { levelMap[l.level_name.toUpperCase()] = l.level_id; });
      const progMap = {}; programmes.forEach(p => { progMap[p.programme_name.toLowerCase()] = p.programme_id; });
      const facMap = {}; faculties.forEach(f => { facMap[f.faculty_name.toLowerCase()] = f.faculty_id; });

      const students = rows.map(row => ({
        roll_no: String(row.roll_no || ''),
        first_name: String(row.name || row.first_name || ''),
        last_name: String(row.last_name || ''),
        email: String(row.email || ''),
        phone: String(row.phone || ''),
        semester: Number(row.semester || 1),
        study_year: Number(row.year || row.study_year || 1),
        password: row.password ? String(row.password) : undefined,
        level_id: levelMap[String(row.level_name || '').toUpperCase()] || null,
        programme_id: progMap[String(row.programme_name || '').toLowerCase()] || null,
        faculty_id: facMap[String(row.faculty_name || '').toLowerCase()] || null,
      }));

      const res = await API.post('/students/bulk', { students });
      const { success, failed, errors } = res.data;
      if (errors?.length) console.warn('Import errors:', errors);
      showMsg(`✅ Imported ${success} students${failed ? `, ❌ ${failed} failed` : ''}`, failed ? 'warning' : 'success');
      fetchStudents();
    } catch (err) { showMsg('Import failed: ' + (err.response?.data?.error || err.message), 'error'); }
    finally { setImporting(false); e.target.value = ''; }
  };
  const handleImportTeachers = async (e) => {
    const file = e.target.files[0]; if (!file) return; setImporting(true);
    setImportErrors([]);
    try {
      const data = await file.arrayBuffer(); const wb = XLSX.read(data);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      // Build lookup maps for discipline and department names → IDs
      const discMap = {}; disciplines.forEach(d => { discMap[d.discipline_name.toLowerCase()] = d.discipline_id; });
      const deptMap = {}; departments.forEach(d => { deptMap[d.department_name.toLowerCase()] = d.department_id; });

      // ── PRE-FLIGHT: scan all rows, collect validation warnings before hitting server ──
      const warnings = [];
      rows.forEach((row, idx) => {
        const rowNum = idx + 2; // +2 = 1-indexed + header row
        const name = `${String(row.first_name||'').trim()} ${String(row.last_name||'').trim()}`.trim() || '(no name)';
        if (!String(row.first_name||'').trim()) warnings.push({ row: rowNum, name, email: row.email||'', severity: 'error', reason: 'Missing first_name' });
        if (!String(row.email||'').trim())      warnings.push({ row: rowNum, name, email: row.email||'', severity: 'error', reason: 'Missing email' });

        // Check discipline matches
        [row.discipline_1, row.discipline_2, row.discipline_3].forEach((dname, i) => {
          if (dname && !discMap[String(dname).toLowerCase()]) {
            warnings.push({ row: rowNum, name, email: row.email||'', severity: 'warning', reason: `discipline_${i+1} "${dname}" not found — will be silently dropped` });
          }
        });
        // Check department matches
        [row.department_1, row.department_2].forEach((dname, i) => {
          if (dname && !deptMap[String(dname).toLowerCase()]) {
            warnings.push({ row: rowNum, name, email: row.email||'', severity: 'warning', reason: `department_${i+1} "${dname}" not found — will be silently dropped` });
          }
        });
      });

      // If pre-flight has blocking errors OR warnings, confirm before proceeding
      const blockingCount = warnings.filter(w => w.severity === 'error').length;
      const warningCount = warnings.filter(w => w.severity === 'warning').length;
      if (warnings.length > 0) {
        const proceed = window.confirm(
          `Pre-flight check found ${blockingCount} error(s) and ${warningCount} warning(s) across ${rows.length} rows.\n\n` +
          `Errors will cause rows to fail. Warnings will import but with missing links.\n\n` +
          `Click OK to proceed with import (bad rows will be reported after).\n` +
          `Click Cancel to abort and fix the file first.`
        );
        if (!proceed) {
          setImportErrors(warnings);
          setImportErrorsOpen(true);
          setImporting(false);
          e.target.value = '';
          return;
        }
      }

      // ── IMPORT: per-row with error tracking ──
      const errors = [];
      let success = 0, failed = 0;
      for (const [idx, row] of rows.entries()) {
        const rowNum = idx + 2;
        const name = `${String(row.first_name||'').trim()} ${String(row.last_name||'').trim()}`.trim() || '(no name)';
        try {
          const discNames = [row.discipline_1, row.discipline_2, row.discipline_3].filter(Boolean);
          const discipline_ids = discNames.map(n => discMap[String(n).toLowerCase()]).filter(Boolean);
          const deptNames = [row.department_1, row.department_2].filter(Boolean);
          const department_ids = deptNames.map(n => deptMap[String(n).toLowerCase()]).filter(Boolean);
          await API.post('/admin/teachers', {
            title:         String(row.title         || '').trim() || null,
            first_name:    String(row.first_name    || '').trim(),
            last_name:     String(row.last_name     || '').trim(),
            email:         String(row.email         || '').trim(),
            phone:         String(row.phone         || '').trim() || null,
            designation:   String(row.designation   || '').trim() || null,
            employee_code: String(row.employee_code || '').trim() || null,
            password:      String(row.password      || 'teacher123'),
            discipline_ids: discipline_ids.length > 0 ? discipline_ids : undefined,
            department_ids: department_ids.length > 0 ? department_ids : undefined,
          });
          success++;
        } catch (err) {
          failed++;
          errors.push({
            row: rowNum, name, email: row.email || '',
            severity: 'error',
            reason: err.response?.data?.error || err.message || 'Unknown error'
          });
        }
      }
      // Show summary toast
      showMsg(`✅ Imported ${success}${failed?`, ❌ ${failed} failed (click to see details)`:''}`, failed?'warning':'success');
      // Open modal with both pre-flight warnings (informational) + actual failures
      const allIssues = [...errors, ...warnings.filter(w => w.severity === 'warning')];
      if (allIssues.length > 0) {
        setImportErrors(allIssues);
        setImportErrorsOpen(true);
      }
      fetchTeachers();
    } catch (err) { showMsg('Import failed: ' + (err.message || 'Unknown error'), 'error'); }
    finally { setImporting(false); e.target.value=''; }
  };

  // Export failed rows as CSV for easy re-upload after fixing
  const downloadImportErrorsCSV = () => {
    const csv = [
      'Row,Name,Email,Severity,Reason',
      ...importErrors.map(e => `${e.row},"${e.name}","${e.email}",${e.severity},"${String(e.reason).replace(/"/g,'""')}"`)
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'import_errors.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFees = async (e) => {
    const file = e.target.files[0]; if (!file) return; setImporting(true);
    try {
      const data = await file.arrayBuffer(); const wb = XLSX.read(data);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const studentMap = {}; students.forEach(s => { studentMap[s.roll_no] = s.student_id; });
      let success = 0, failed = 0, notFound = [];
      for (const row of rows) {
        try {
          const student_id = studentMap[String(row.roll_no||'').trim()];
          if (!student_id) { failed++; notFound.push(row.roll_no); continue; }
          await API.post('/fees', { student_id, amount: Number(row.amount||0), fee_type: String(row.fee_type||'Tuition Fee'), due_date: String(row.due_date||'') });
          success++;
        } catch { failed++; }
      }
      let m = `✅ Imported ${success}${failed?`, ❌ ${failed} failed`:''}`;
      if (notFound.length) m += `. Not found: ${notFound.join(', ')}`;
      showMsg(m, failed?'warning':'success');
      fetchFees();
    } catch { showMsg('Failed!','error'); } finally { setImporting(false); e.target.value=''; }
  };

  const tabs = ['levels','students','teachers','subjects','enrollment','attendance','fees','marks','notifications'];
  const msgStyle = { ...styles.msg, background: msgType==='error'?'#fff5f5':msgType==='warning'?'#fffbeb':'#c6f6d5', color: msgType==='error'?'#c53030':msgType==='warning'?'#92400e':'#276749' };

  return (
    <div style={styles.container}>
      <nav style={styles.nav} className="erp-nav">
        <h2 style={styles.navTitle}>🎓 College ERP — Admin Panel</h2>
        <div style={styles.navRight}>
          <span style={styles.adminName}>👤 {admin.name}</span>
          <button style={styles.logoutBtn} onClick={onLogout}>Logout</button>
        </div>
      </nav>

      <div style={styles.tabs} className="erp-tabs">
        {tabs.map(tab => (
          <button key={tab} style={{...styles.tab, ...(activeTab===tab ? styles.activeTab : {})}}
            onClick={() => { setActiveTab(tab); setMsg(''); setForm({}); setStudentLevel(''); setStudentFaculty(''); }}>
            {tab==='levels'?'🏫 Levels & Faculties':tab==='notifications'?'🔔 Notifications':tab.charAt(0).toUpperCase()+tab.slice(1)}
          </button>
        ))}
      </div>

      {msg && <div style={msgStyle}>{msg}</div>}

      <div style={styles.content} className="erp-content">

        {/* LEVELS FACULTIES PROGRAMMES */}
        {activeTab === 'levels' && (
          <div style={styles.threeCol}>
            {/* LEVELS */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>🎯 Levels</h3>
              <form onSubmit={handleAddLevel} style={styles.form} className="erp-form-grid erp-form-grid-3">
                <input style={styles.input} placeholder="Level (e.g. UG)" value={form.level_name||''} onChange={e=>setForm({...form,level_name:e.target.value})} required />
                <input style={styles.input} placeholder="Description" value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})} />
                <button style={styles.addBtn} type="submit">Add</button>
              </form>
              <div className="erp-table-wrap">
              <table style={styles.table} className="erp-table">
                <thead><tr>{['ID','Level','Desc','Del'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>{levels.map(l=>(
                  <tr key={l.level_id}>
                    <td style={styles.td}>{l.level_id}</td>
                    <td style={styles.td}><span style={{...styles.badge,background:'#4c51bf'}}>{l.level_name}</span></td>
                    <td style={styles.td}>{l.description}</td>
                    <td style={styles.td}><button style={styles.delBtn} onClick={()=>API.delete(`/levels/${l.level_id}`).then(fetchLevels)}>✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
              </div>
            </div>

            {/* FACULTIES */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>🏛️ Faculties</h3>
              <form onSubmit={handleAddFaculty} style={styles.form} className="erp-form-grid erp-form-grid-3">
                <input style={styles.input} placeholder="Faculty (e.g. Arts)" value={form.faculty_name||''} onChange={e=>setForm({...form,faculty_name:e.target.value})} required />
                <input style={styles.input} placeholder="Description" value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})} />
                <button style={styles.addBtn} type="submit">Add</button>
              </form>
              <div className="erp-table-wrap">
              <table style={styles.table} className="erp-table">
                <thead><tr>{['ID','Faculty','Desc','Del'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>{faculties.map(f=>(
                  <tr key={f.faculty_id}>
                    <td style={styles.td}>{f.faculty_id}</td>
                    <td style={styles.td}><span style={{...styles.badge,background:facultyColors[f.faculty_name]||'#667eea'}}>{f.faculty_name}</span></td>
                    <td style={styles.td}>{f.description}</td>
                    <td style={styles.td}><button style={styles.delBtn} onClick={()=>API.delete(`/faculties/${f.faculty_id}`).then(fetchFaculties)}>✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
              </div>
            </div>

            {/* PROGRAMMES */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>📚 Programmes</h3>
              <form onSubmit={handleAddProgramme} style={styles.form} className="erp-form-grid erp-form-grid-4">
                <select style={styles.input} value={form.level_id||''} onChange={e=>setForm({...form,level_id:e.target.value})} required>
                  <option value="">Select Level</option>
                  {levels.map(l=><option key={l.level_id} value={l.level_id}>{l.level_name}</option>)}
                </select>
                <select style={styles.input} value={form.faculty_id||''} onChange={e=>setForm({...form,faculty_id:e.target.value})} required>
                  <option value="">Select Faculty</option>
                  {faculties.map(f=><option key={f.faculty_id} value={f.faculty_id}>{f.faculty_name}</option>)}
                </select>
                <input style={styles.input} placeholder="Programme Name" value={form.programme_name||''} onChange={e=>setForm({...form,programme_name:e.target.value})} required />
                <input style={styles.input} type="number" placeholder="Duration (yrs)" value={form.duration_years||''} onChange={e=>setForm({...form,duration_years:e.target.value})} required />
                <button style={styles.addBtn} type="submit">Add</button>
              </form>
              <div className="erp-table-wrap erp-programmes-scroll">
              <table style={styles.table} className="erp-table">
                <thead><tr>{['Level','Faculty','Programme','Dur','Del'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>{programmes.map(p=>(
                  <tr key={p.programme_id}>
                    <td style={styles.td}>
                      <span style={{...styles.badge,background:'#4c51bf'}}>{p.level_name}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{...styles.badge, background: getFacultyColor(p.faculty_id)}}>
                        {getFacultyName(p.faculty_id)}
                      </span>
                    </td>
                    <td style={styles.td}>{p.programme_name}</td>
                    <td style={styles.td}>{p.duration_years}y</td>
                    <td style={styles.td}>
                      <button style={styles.delBtn} onClick={()=>API.delete(`/programmes/${p.programme_id}`).then(fetchProgrammes)}>✕</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {/* STUDENTS */}
        {activeTab === 'students' && (
          <div>
            <div style={styles.importBox}>
              <h3 style={styles.importTitle}>📥 Import Students from Excel</h3>
              <div style={styles.importActions}>
                <button style={styles.templateBtn} onClick={()=>downloadTemplate('students')}>⬇️ Download Template</button>
                <label style={{...styles.importBtn,opacity:importing?0.6:1}}>
                  {importing?'⏳ Importing...':'📂 Choose Excel File'}
                  <input ref={studentFileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImportStudents} disabled={importing} />
                </label>
              </div>
              <p style={styles.importHint}>📋 Required: <strong>roll_no, name, email, phone, level_name, faculty_name, programme_name, semester, year, password</strong></p>
            </div>
            <h3>Add Student Manually</h3>
            <form onSubmit={handleAddStudent} style={styles.form} className="erp-form-grid erp-form-grid-4">
              <input style={styles.input} placeholder="Roll No" value={form.roll_no||''} onChange={e=>setForm({...form,roll_no:e.target.value})} required />
              <input style={styles.input} placeholder="First Name" value={form.first_name||''} onChange={e=>setForm({...form,first_name:e.target.value})} required />
              <input style={styles.input} placeholder="Last Name" value={form.last_name||''} onChange={e=>setForm({...form,last_name:e.target.value})} />
              <input style={styles.input} placeholder="Email" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})} />
              <input style={styles.input} placeholder="Phone" value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})} />
              <select style={styles.input} value={studentLevel} onChange={e=>{setStudentLevel(e.target.value);setStudentFaculty('');setForm({...form,programme_id:''});}} required>
                <option value="">① Select Level</option>
                {levels.map(l=><option key={l.level_id} value={l.level_id}>{l.level_name} — {l.description}</option>)}
              </select>
              <select style={styles.input} value={studentFaculty} onChange={e=>{setStudentFaculty(e.target.value);setForm({...form,programme_id:''});}} required disabled={!studentLevel}>
                <option value="">{studentLevel?'② Select Faculty':'Select Level first'}</option>
                {faculties.map(f=><option key={f.faculty_id} value={f.faculty_id}>{f.faculty_name}</option>)}
              </select>
              <select style={styles.input} value={form.programme_id||''} onChange={e=>{ const prog=studentProgrammes.find(p=>String(p.programme_id)===e.target.value); setForm({...form,programme_id:e.target.value,course:prog?.programme_name||''}); if(prog?.faculty_id) setStudentFaculty(String(prog.faculty_id)); }} required disabled={!studentFaculty}>
                <option value="">{studentFaculty?(studentProgrammes.length?'③ Select Programme':'No programmes found'):'Select Faculty first'}</option>
                {studentProgrammes.map(p=><option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>)}
              </select>
              <input style={styles.input} type="number" placeholder="Semester" value={form.semester||''} onChange={e=>setForm({...form,semester:e.target.value})} required />
              <input style={styles.input} type="number" placeholder="Year" value={form.year||''} onChange={e=>setForm({...form,year:e.target.value})} required />
              <input style={styles.input} type="password" placeholder="Password" value={form.password||''} onChange={e=>setForm({...form,password:e.target.value})} required />
              {/* Discipline picker — shown for multi-discipline programmes like B.A */}
              {(() => {
                const selectedProg = programmes.find(p => String(p.programme_id) === String(form.programme_id));
                const needsDisc = selectedProg && (selectedProg.scheme === 'A' || selectedProg.scheme === 'B');
                if (!needsDisc) return null;
                const progDiscs = [...new Map(
                  disciplines.filter(d => {
                    // Show disciplines that have MAJOR subjects for this programme
                    return true; // We'll filter in the select
                  }).map(d => [d.discipline_id, d])
                ).values()];
                return (
                  <div style={{gridColumn:'1/-1',background:'#ebf8ff',borderRadius:'8px',padding:'0.75rem 1rem',border:'1px solid #bee3f8'}}>
                    <p style={{margin:'0 0 0.5rem',fontWeight:'600',color:'#2b6cb0',fontSize:'0.85rem'}}>📚 Select 3 Disciplines for {selectedProg.programme_name}</p>
                    <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                      {[1,2,3].map(i => (
                        <select key={i} style={{...styles.input,flex:'1 1 180px',margin:0}} value={form['discipline_'+i]||''} onChange={e=>setForm({...form,['discipline_'+i]:e.target.value})}>
                          <option value="">Discipline {i}</option>
                          {disciplines.map(d=><option key={d.discipline_id} value={d.discipline_id}>{d.discipline_name}</option>)}
                        </select>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <button style={styles.addBtn} type="submit">Add Student</button>
            </form>
            {editingStudent && (
              <form onSubmit={handleUpdateStudent} style={{...styles.form, background:'#fffbeb', border:'1px solid #f6e05e', marginBottom:'1rem', borderRadius:'10px', padding:'1rem'}}>
                <strong style={{width:'100%',color:'#744210',marginBottom:'0.5rem'}}>✏️ Editing: {editingStudent.name} ({editingStudent.roll_no})</strong>
                <input style={styles.input} placeholder="First Name" value={editingStudent.first_name||''} onChange={e=>setEditingStudent({...editingStudent,first_name:e.target.value})} required />
                <input style={styles.input} placeholder="Last Name" value={editingStudent.last_name||''} onChange={e=>setEditingStudent({...editingStudent,last_name:e.target.value})} />
                <input style={styles.input} placeholder="Roll No" value={editingStudent.roll_no||''} onChange={e=>setEditingStudent({...editingStudent,roll_no:e.target.value})} required />
                <input style={styles.input} placeholder="Email" value={editingStudent.email||''} onChange={e=>setEditingStudent({...editingStudent,email:e.target.value})} />
                <input style={styles.input} placeholder="Phone" value={editingStudent.phone||''} onChange={e=>setEditingStudent({...editingStudent,phone:e.target.value})} />
                <input style={styles.input} type="number" placeholder="Semester" value={editingStudent.semester||''} onChange={e=>setEditingStudent({...editingStudent,semester:e.target.value})} required />
                <select style={styles.input} value={editingStudent.programme_id||''} onChange={e=>setEditingStudent({...editingStudent,programme_id:e.target.value})}>
                  <option value="">Change Programme</option>
                  {programmes.map(p=><option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>)}
                </select>
                {/* Discipline picker for edit */}
                {(() => {
                  const editProg = programmes.find(p => String(p.programme_id) === String(editingStudent.programme_id));
                  const needsDisc = editProg && (editProg.scheme === 'A' || editProg.scheme === 'B');
                  if (!needsDisc) return null;
                  return (
                    <div style={{gridColumn:'1/-1',background:'#ebf8ff',borderRadius:'8px',padding:'0.75rem 1rem',border:'1px solid #bee3f8'}}>
                      <p style={{margin:'0 0 0.5rem',fontWeight:'600',color:'#2b6cb0',fontSize:'0.85rem'}}>📚 Disciplines (select 3)</p>
                      <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                        {[1,2,3].map(i => (
                          <select key={i} style={{...styles.input,flex:'1 1 180px',margin:0}} value={editingStudent['discipline_'+i]||''} onChange={e=>setEditingStudent({...editingStudent,['discipline_'+i]:e.target.value})}>
                            <option value="">Discipline {i}</option>
                            {disciplines.map(d=><option key={d.discipline_id} value={d.discipline_id}>{d.discipline_name}</option>)}
                          </select>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {(() => {
                  const editProg = programmes.find(p => String(p.programme_id) === String(editingStudent.programme_id));
                  const needsDisc = editProg && (editProg.scheme === 'A' || editProg.scheme === 'B');
                  if (!needsDisc) return null;
                  return (
                    <div style={{gridColumn:'1/-1',background:'#ebf8ff',borderRadius:'8px',padding:'0.75rem 1rem',border:'1px solid #bee3f8'}}>
                      <p style={{margin:'0 0 0.5rem',fontWeight:'600',color:'#2b6cb0',fontSize:'0.85rem'}}>Disciplines (select 3)</p>
                      <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                        {[1,2,3].map(i => (
                          <select key={i} style={{...styles.input,flex:'1 1 180px',margin:0}} value={editingStudent['discipline_'+i]||''} onChange={e=>setEditingStudent({...editingStudent,['discipline_'+i]:e.target.value})}>
                            <option value="">Discipline {i}</option>
                            {disciplines.map(d=><option key={d.discipline_id} value={d.discipline_id}>{d.discipline_name}</option>)}
                          </select>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <div style={{display:'flex',gap:'0.5rem'}}>
                  <button style={styles.addBtn} type="submit">💾 Save</button>
                  <button style={{...styles.delBtn,padding:'0.6rem 1rem'}} type="button" onClick={()=>setEditingStudent(null)}>Cancel</button>
                </div>
              </form>
            )}
            <h3>All Students ({students.length})</h3>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'1rem',alignItems:'center'}}>
              <input style={{...styles.input,flex:'1 1 180px',minWidth:'150px'}} placeholder="🔍 Search roll no or name..." value={stuSearch} onChange={e=>setStuSearch(e.target.value)} />
              <select style={{...styles.input,flex:'0 1 150px'}} value={stuFilterFaculty} onChange={e=>{setStuFilterFaculty(e.target.value);setStuFilterProg('');}}>
                <option value="">All Faculties</option>
                {faculties.map(f=><option key={f.faculty_id} value={f.faculty_id}>{f.faculty_name}</option>)}
              </select>
              <select style={{...styles.input,flex:'0 1 180px'}} value={stuFilterProg} onChange={e=>setStuFilterProg(e.target.value)}>
                <option value="">All Programmes</option>
                {programmes.filter(p=>!stuFilterFaculty||String(p.faculty_id)===stuFilterFaculty).map(p=><option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>)}
              </select>
              <select style={{...styles.input,flex:'0 1 100px'}} value={stuFilterSem} onChange={e=>setStuFilterSem(e.target.value)}>
                <option value="">All Sem</option>
                {[1,2,3,4,5,6,7,8].map(s=><option key={s} value={s}>Sem {s}</option>)}
              </select>
              <button style={{...styles.delBtn,background:'#a0aec0',color:'#fff'}} onClick={()=>{setStuSearch('');setStuFilterFaculty('');setStuFilterProg('');setStuFilterSem('');}}>Clear</button>
            </div>
            {(() => {
              let filtered = students;
              if (stuSearch) { const q = stuSearch.toLowerCase(); filtered = filtered.filter(s => (s.roll_no||'').toLowerCase().includes(q) || (s.name||'').toLowerCase().includes(q)); }
              if (stuFilterFaculty) filtered = filtered.filter(s => String(s.faculty_id) === stuFilterFaculty);
              if (stuFilterProg) filtered = filtered.filter(s => String(s.programme_id) === stuFilterProg);
              if (stuFilterSem) filtered = filtered.filter(s => String(s.semester) === stuFilterSem);
              return (<>
              <p style={{margin:'0 0 0.5rem',color:'#718096',fontSize:'0.85rem'}}>Showing {filtered.length} of {students.length} students</p>
            <table style={styles.table} className="erp-table">
              <thead><tr>{['ID','Roll No','Name','Level','Faculty','Programme','Sem','Action'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>{filtered.map(s=>(
                <tr key={s.student_id}>
                  <td style={styles.td}>{s.student_id}</td>
                  <td style={styles.td}>{s.roll_no}</td>
                  <td style={styles.td}>{s.name}</td>
                  <td style={styles.td}><span style={{...styles.badge,background:'#4c51bf'}}>{s.level_name||'N/A'}</span></td>
                  <td style={styles.td}><span style={{...styles.badge,background:getFacultyColor(s.faculty_id)}}>{getFacultyName(s.faculty_id)}</span></td>
                  <td style={styles.td}>{s.programme_name||s.course||'N/A'}</td>
                  <td style={styles.td}>{s.semester}</td>
                  <td style={styles.td}>
                    <button style={{...styles.addBtn,padding:'0.3rem 0.8rem',fontSize:'0.8rem',marginRight:'0.4rem'}}
                      onClick={async ()=>{
                      const stu = {...s, first_name: (s.name||'').split(' ')[0]||'', last_name: (s.name||'').split(' ').slice(1).join(' ')||''};
                      try {
                        const dr = await API.get('/admin/students/' + s.student_id + '/disciplines');
                        if (dr.data && dr.data.length) {
                          dr.data.forEach((d,i) => { stu['discipline_'+(i+1)] = String(d.discipline_id); });
                        }
                      } catch(e){}
                      setEditingStudent(stu);
                    }}>Edit</button>
                    <button style={styles.delBtn} onClick={()=>handleDelete('students',s.student_id)}>Delete</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
            </>); })()}
          </div>
        )}

        {/* TEACHERS */}
        {activeTab === 'teachers' && (
          <div>
            <div style={styles.importBox}>
              <h3 style={styles.importTitle}>📥 Import Teachers from Excel</h3>
              <div style={styles.importActions}>
                <button style={styles.templateBtn} onClick={()=>downloadTemplate('teachers')}>⬇️ Download Template</button>
                <label style={{...styles.importBtn,opacity:importing?0.6:1}}>
                  {importing?'⏳ Importing...':'📂 Choose Excel File'}
                  <input ref={teacherFileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImportTeachers} disabled={importing} />
                </label>
              </div>
              <p style={styles.importHint}>📋 Required: <strong>first_name, email, password</strong> &nbsp;|&nbsp; Optional: title, last_name, phone, designation, employee_code, discipline_1, discipline_2, discipline_3, department_1, department_2</p>
            </div>
            <h3>Add Teacher Manually</h3>
            <form onSubmit={handleAddTeacher} style={styles.form} className="erp-form-grid erp-form-grid-4">
              <select style={styles.input} value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})} required>
                <option value="">Select Title</option>
                {['Dr','Mr','Mrs','Ms','Prof'].map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <input style={styles.input} placeholder="First Name" value={form.first_name||''} onChange={e=>setForm({...form,first_name:e.target.value})} required />
              <input style={styles.input} placeholder="Last Name" value={form.last_name||''} onChange={e=>setForm({...form,last_name:e.target.value})} />
              {['email','phone'].map(f=>(
                <input key={f} style={styles.input} placeholder={f.charAt(0).toUpperCase()+f.slice(1)} value={form[f]||''} onChange={e=>setForm({...form,[f]:e.target.value})} required={f==='email'} />
              ))}
              <input style={styles.input} placeholder="Designation (e.g. Assistant Professor)" value={form.designation||''} onChange={e=>setForm({...form,designation:e.target.value})} />
              <input style={styles.input} placeholder="Employee Code (optional)" value={form.employee_code||''} onChange={e=>setForm({...form,employee_code:e.target.value})} />
              <input style={styles.input} type="password" placeholder="password" value={form.password||''} onChange={e=>setForm({...form,password:e.target.value})} required />
              <div style={{width:'100%'}}>
                <label style={{fontSize:'0.85rem',color:'#4a5568',fontWeight:'600',display:'block',marginBottom:'0.3rem'}}>Disciplines (hold Ctrl/Cmd to select multiple)</label>
                <select multiple style={{...styles.input, height:'120px'}}
                  value={form.discipline_ids||[]}
                  onChange={e=>setForm({...form, discipline_ids: Array.from(e.target.selectedOptions).map(o=>parseInt(o.value))})}>
                  {disciplines.map(d=>(
                    <option key={d.discipline_id} value={d.discipline_id}>{d.discipline_name} {d.faculty_name ? `(${d.faculty_name})` : ''}</option>
                  ))}
                </select>
              </div>
              <div style={{width:'100%'}}>
                <label style={{fontSize:'0.85rem',color:'#4a5568',fontWeight:'600',display:'block',marginBottom:'0.3rem'}}>Departments (hold Ctrl/Cmd to select multiple)</label>
                <select multiple style={{...styles.input, height:'100px'}}
                  value={form.department_ids||[]}
                  onChange={e=>setForm({...form, department_ids: Array.from(e.target.selectedOptions).map(o=>parseInt(o.value))})}>
                  {departments.map(d=>(
                    <option key={d.department_id} value={d.department_id}>{d.department_name} {d.faculty_name ? `(${d.faculty_name})` : ''}</option>
                  ))}
                </select>
              </div>
              <button style={styles.addBtn} type="submit">Add Teacher</button>
            </form>
            <h3>All Teachers ({teachers.length})</h3>
            {editingTeacher && (
              <form onSubmit={handleUpdateTeacher} style={{...styles.form, background:'#fffbeb', border:'1px solid #f6e05e', marginBottom:'1rem'}}>
                <strong style={{width:'100%',color:'#744210'}}>✏️ Editing: {editingTeacher.title} {editingTeacher.first_name} {editingTeacher.last_name}</strong>
                <select style={styles.input} value={editingTeacher.title||''} onChange={e=>setEditingTeacher({...editingTeacher,title:e.target.value})} required>
                  <option value="">Select Title</option>
                  {['Dr','Mr','Mrs','Ms','Prof'].map(t=><option key={t} value={t}>{t}</option>)}
                </select>
                <input style={styles.input} placeholder="First Name" value={editingTeacher.first_name||''} onChange={e=>setEditingTeacher({...editingTeacher,first_name:e.target.value})} required />
                <input style={styles.input} placeholder="Last Name" value={editingTeacher.last_name||''} onChange={e=>setEditingTeacher({...editingTeacher,last_name:e.target.value})} />
                {['email','phone'].map(f=>(
                  <input key={f} style={styles.input} placeholder={f.charAt(0).toUpperCase()+f.slice(1)} value={editingTeacher[f]||''}
                    onChange={e=>setEditingTeacher({...editingTeacher,[f]:e.target.value})} required={f==='email'} />
                ))}
                <input style={styles.input} placeholder="Designation (e.g. Assistant Professor)" value={editingTeacher.designation||''} onChange={e=>setEditingTeacher({...editingTeacher,designation:e.target.value})} />
                <input style={styles.input} placeholder="Employee Code (optional)" value={editingTeacher.employee_code||''} onChange={e=>setEditingTeacher({...editingTeacher,employee_code:e.target.value})} />
                <div style={{width:'100%'}}>
                  <label style={{fontSize:'0.85rem',color:'#4a5568',fontWeight:'600',display:'block',marginBottom:'0.3rem'}}>Disciplines (hold Ctrl/Cmd to select multiple)</label>
                  <select multiple style={{...styles.input, height:'120px'}}
                    value={(editingTeacher.discipline_ids ?? (editingTeacher.disciplines||[]).map(d=>d.discipline_id)).map(Number)}
                    onChange={e=>setEditingTeacher({...editingTeacher, discipline_ids: Array.from(e.target.selectedOptions).map(o=>parseInt(o.value))})}>
                    {disciplines.map(d=>(
                      <option key={d.discipline_id} value={d.discipline_id}>{d.discipline_name} {d.faculty_name ? `(${d.faculty_name})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div style={{width:'100%'}}>
                  <label style={{fontSize:'0.85rem',color:'#4a5568',fontWeight:'600',display:'block',marginBottom:'0.3rem'}}>Departments (hold Ctrl/Cmd to select multiple)</label>
                  <select multiple style={{...styles.input, height:'100px'}}
                    value={(editingTeacher.department_ids ?? (editingTeacher.departments||[]).map(d=>d.department_id)).map(Number)}
                    onChange={e=>setEditingTeacher({...editingTeacher, department_ids: Array.from(e.target.selectedOptions).map(o=>parseInt(o.value))})}>
                    {departments.map(d=>(
                      <option key={d.department_id} value={d.department_id}>{d.department_name} {d.faculty_name ? `(${d.faculty_name})` : ''}</option>
                    ))}
                  </select>
                </div>
                <button style={styles.addBtn} type="submit">Save</button>
                <button style={{...styles.delBtn, padding:'0.6rem 1rem'}} type="button" onClick={()=>setEditingTeacher(null)}>Cancel</button>
              </form>
            )}
            <table style={styles.table} className="erp-table">
              <thead><tr>{['ID','Name','Email','Phone','Department','Discipline','Action'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>{teachers.map(t=>(
                <tr key={t.teacher_id} style={editingTeacher?.teacher_id===t.teacher_id?{background:'#fffbeb'}:{}}>
                  <td style={styles.td}>{t.teacher_id}</td>
                  <td style={styles.td}>{t.name}</td>
                  <td style={styles.td}>{t.email}</td>
                  <td style={styles.td}>{t.phone||'—'}</td>
                  <td style={styles.td}>
                    {t.departments && t.departments.length > 0
                      ? t.departments.map(d => d.department_name).join(', ')
                      : <span style={{color:'#a0aec0',fontSize:'0.8rem'}}>Not set</span>}
                  </td>
                  <td style={styles.td}>
                    {t.disciplines && t.disciplines.length > 0
                      ? t.disciplines.map(d=>(
                          <span key={d.discipline_id} style={{background:'#ebf8ff',color:'#2b6cb0',padding:'0.15rem 0.5rem',borderRadius:'999px',fontSize:'0.75rem',fontWeight:'600',marginRight:'0.3rem',display:'inline-block',marginBottom:'0.2rem'}}>{d.discipline_name}</span>
                        ))
                      : <span style={{color:'#a0aec0',fontSize:'0.8rem'}}>Not set</span>}
                  </td>
                  <td style={styles.td}>
                    <button style={{...styles.addBtn,padding:'0.3rem 0.8rem',fontSize:'0.8rem',marginRight:'0.4rem'}}
                      onClick={()=>{
                        setManagingTeacher(null);
                        const parts = (t.name||'').trim().split(/\s+/);
                        setEditingTeacher({...t, first_name: t.first_name || parts[0] || '', last_name: t.last_name || parts.slice(1).join(' ') || ''});
                      }}>Edit</button>
                    <button style={{...styles.addBtn,padding:'0.3rem 0.8rem',fontSize:'0.8rem',marginRight:'0.4rem',background:'#805ad5'}}
                      onClick={()=>openManageSubjects(t)}>Subjects</button>
                    <button style={styles.delBtn} onClick={()=>handleDelete('teachers',t.teacher_id)}>Delete</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* SUBJECTS */}
        {activeTab === 'subjects' && (
          <SubjectsTab levels={levels} faculties={faculties} programmes={programmes} showMsg={showMsg} />
        )}

        {/* MANAGE SUBJECTS PANEL — shown in teachers tab */}
        {activeTab === 'teachers' && managingTeacher && (
          <div style={{marginTop:'2rem', background:'#fff', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
            {/* Header */}
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem', borderBottom:'2px solid #e2e8f0', paddingBottom:'0.75rem', flexWrap:'wrap', gap:'0.5rem'}}>
              <div>
                <h3 style={{margin:0}}>📚 Subject Assignment — <span style={{color:'#805ad5'}}>{managingTeacher.name}</span></h3>
                <div style={{marginTop:'0.3rem', display:'flex', flexWrap:'wrap', gap:'0.3rem'}}>
                  {managingTeacher.disciplines && managingTeacher.disciplines.length > 0
                    ? managingTeacher.disciplines.map(d=>(
                        <span key={d.discipline_id} style={{fontSize:'0.78rem',background:'#ebf8ff',color:'#2b6cb0',padding:'0.15rem 0.5rem',borderRadius:'999px',fontWeight:'600'}}>{d.discipline_name}</span>
                      ))
                    : <span style={{fontSize:'0.8rem',color:'#a0aec0'}}>No discipline set — showing all subjects</span>}
                </div>
              </div>
              <div style={{display:'flex', gap:'0.5rem', alignItems:'center'}}>
                <span style={{fontSize:'0.85rem', color:'#718096'}}>
                  ✅ {teacherSubjects.length} assigned
                </span>
                <button style={{...styles.delBtn, padding:'0.4rem 1rem'}} onClick={()=>setManagingTeacher(null)}>✕ Close</button>
              </div>
            </div>

            {/* Summary bar */}
            <div style={{display:'flex', gap:'1rem', marginBottom:'1.5rem', flexWrap:'wrap'}}>
              <div style={{background:'#f0fff4', border:'1px solid #9ae6b4', borderRadius:'8px', padding:'0.5rem 1rem', fontSize:'0.85rem', color:'#276749', fontWeight:'600'}}>
                ✅ Assigned: {teacherSubjects.length}
              </div>
              <div style={{background:'#f7fafc', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'0.5rem 1rem', fontSize:'0.85rem', color:'#4a5568', fontWeight:'600'}}>
                📚 Total visible: {allSubjects.length}
              </div>
              <div style={{background:'#fff5f5', border:'1px solid #feb2b2', borderRadius:'8px', padding:'0.5rem 1rem', fontSize:'0.85rem', color:'#c53030', fontWeight:'600'}}>
                ⬜ Unassigned: {allSubjects.length - teacherSubjects.length}
              </div>
            </div>

            {/* Subjects grouped by Level → Semester */}
            {['UG','PG'].map(level => {
              const levelSubjects = allSubjects.filter(s => s.level_name === level);
              if (!levelSubjects.length) return null;
              return (
                <div key={level} style={{marginBottom:'2rem'}}>
                  <div style={{background: level==='UG'?'#4c51bf':'#805ad5', color:'#fff', padding:'0.5rem 1rem', borderRadius:'8px', marginBottom:'1rem', fontWeight:'700', fontSize:'0.95rem'}}>
                    {level === 'UG' ? '🎓 Under Graduate (UG)' : '🎓 Post Graduate (PG)'}
                  </div>
                  {['1','2','3','4','5','6','7','8'].map(sem => {
                    const semSubjects = levelSubjects.filter(s => String(s.semester) === sem);
                    if (!semSubjects.length) return null;
                    const assignedCount = semSubjects.filter(s => teacherSubjects.includes(s.subject_id)).length;
                    return (
                      <div key={sem} style={{marginBottom:'1.5rem', borderRadius:'8px', overflow:'hidden', border:'1px solid #e2e8f0'}}>
                        <div style={{background:'#f7fafc', padding:'0.5rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #e2e8f0'}}>
                          <h4 style={{margin:0, color:'#2d3748', fontSize:'0.9rem'}}>Semester {sem}</h4>
                          <span style={{fontSize:'0.8rem', color:'#718096'}}>{assignedCount}/{semSubjects.length} assigned</span>
                        </div>
                        <table style={{...styles.table, boxShadow:'none', borderRadius:0}}>
                          <thead>
                            <tr>
                              {['Code','Subject Name','Programme','Discipline','Category','Credits','Action'].map(h=>(
                                <th key={h} style={styles.th}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {semSubjects.map(s => {
                              const assigned = teacherSubjects.includes(s.subject_id);
                              return (
                                <tr key={s.subject_id} style={{background: assigned ? '#f0fff4' : '#fff', transition:'background 0.15s'}}>
                                  <td style={{...styles.td, fontFamily:'monospace', fontWeight:'600', fontSize:'0.8rem', whiteSpace:'nowrap'}}>{s.subject_code}</td>
                                  <td style={styles.td}>{s.subject_name}</td>
                                  <td style={styles.td}>
                                    {s.programme_name
                                      ? <span style={{background:'#faf5ff',color:'#553c9a',padding:'0.15rem 0.5rem',borderRadius:'999px',fontSize:'0.75rem',fontWeight:'600'}}>{s.programme_name}</span>
                                      : <span style={{color:'#a0aec0',fontSize:'0.75rem'}}>Common</span>}
                                  </td>
                                  <td style={styles.td}>
                                    {s.discipline_name
                                      ? <span style={{background:'#ebf8ff',color:'#2b6cb0',padding:'0.15rem 0.5rem',borderRadius:'999px',fontSize:'0.75rem',fontWeight:'600'}}>{s.discipline_name}</span>
                                      : <span style={{color:'#a0aec0',fontSize:'0.75rem'}}>—</span>}
                                  </td>
                                  <td style={styles.td}>
                                    <span style={{...styles.badge, background:'#9f7aea', fontSize:'0.72rem'}}>{s.category}</span>
                                  </td>
                                  <td style={{...styles.td, textAlign:'center'}}>{s.credits}</td>
                                  <td style={{...styles.td, textAlign:'center', whiteSpace:'nowrap'}}>
                                    {assigned ? (
                                      <>
                                        {(() => {
                                          const asg = assignmentData.find(a => a.subject_id === s.subject_id);
                                          return asg ? (
                                            <span style={{fontSize:'0.72rem',color:'#718096',marginRight:'0.4rem',display:'inline-block',marginBottom:'0.2rem'}}>
                                              Sec:{asg.section||'A'}{asg.programme_name ? ` | ${asg.programme_name}` : ''}{asg.class_name ? ` | ${asg.class_name}` : ''}
                                            </span>
                                          ) : null;
                                        })()}
                                        <button
                                          onClick={() => {
                                            const asg = assignmentData.find(a => a.subject_id === s.subject_id);
                                            if (asg) setEditingAssignment({...asg});
                                          }}
                                          style={{padding:'0.3rem 0.6rem',background:'#dd6b20',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontWeight:'600',fontSize:'0.78rem',marginRight:'0.3rem'}}>
                                          ✏️ Edit
                                        </button>
                                        <button
                                          onClick={() => handleToggleSubject(s.subject_id, true)}
                                          style={{padding:'0.3rem 0.6rem',background:'#e53e3e',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontWeight:'600',fontSize:'0.78rem'}}>
                                          ✕ Remove
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => handleToggleSubject(s.subject_id, false)}
                                        style={{padding:'0.3rem 0.8rem',background:'#38a169',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontWeight:'600',fontSize:'0.78rem',whiteSpace:'nowrap'}}>
                                        + Assign
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {editingAssignment && semSubjects.some(s => s.subject_id === editingAssignment.subject_id) && (
                          <div style={{background:'#fffbeb', border:'1px solid #f6e05e', borderRadius:'0 0 8px 8px', padding:'1rem 1.25rem'}}>
                            <strong style={{color:'#744210', fontSize:'0.9rem', display:'block', marginBottom:'0.6rem'}}>
                              ✏️ Edit: {editingAssignment.subject_code} — {editingAssignment.subject_name}
                            </strong>
                            <div style={{display:'flex', gap:'0.8rem', flexWrap:'wrap', alignItems:'flex-end'}}>
                              <div>
                                <label style={{fontSize:'0.78rem',color:'#4a5568',fontWeight:'600',display:'block',marginBottom:'0.2rem'}}>Section</label>
                                <input style={{...styles.input, width:'80px', margin:0}}
                                  value={editingAssignment.section || 'A'}
                                  onChange={e => setEditingAssignment({...editingAssignment, section: e.target.value})} />
                              </div>
                              <div>
                                <label style={{fontSize:'0.78rem',color:'#4a5568',fontWeight:'600',display:'block',marginBottom:'0.2rem'}}>Programme</label>
                                <select style={{...styles.input, width:'200px', margin:0}}
                                  value={editingAssignment.programme_id || ''}
                                  onChange={e => setEditingAssignment({...editingAssignment, programme_id: e.target.value ? parseInt(e.target.value) : null})}>
                                  <option value="">— None —</option>
                                  {programmes.map(p => <option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label style={{fontSize:'0.78rem',color:'#4a5568',fontWeight:'600',display:'block',marginBottom:'0.2rem'}}>Class Name</label>
                                <input style={{...styles.input, width:'150px', margin:0}} placeholder="e.g. 3rd Year"
                                  value={editingAssignment.class_name || ''}
                                  onChange={e => setEditingAssignment({...editingAssignment, class_name: e.target.value})} />
                              </div>
                              <button onClick={() => handleUpdateAssignment(editingAssignment)}
                                style={{padding:'0.5rem 1.2rem',background:'#38a169',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontWeight:'600',fontSize:'0.85rem'}}>
                                💾 Save
                              </button>
                              <button onClick={() => setEditingAssignment(null)}
                                style={{padding:'0.5rem 1rem',background:'#718096',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontWeight:'600',fontSize:'0.85rem'}}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* ENROLLMENT */}
        {activeTab === 'enrollment' && (
          <div>
            {!selectedEnrollStudent ? (
              <div>
                {/* Header + Search + Filters */}
                <div style={{background:'#fff',borderRadius:'12px',padding:'1.25rem',marginBottom:'1.5rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',flexWrap:'wrap',gap:'0.75rem'}}>
                    <h3 style={{margin:0}}>📋 Enrollment Management
                      <span style={{fontSize:'0.85rem',color:'#718096',fontWeight:'400',marginLeft:'0.75rem'}}>({enrollmentSummary.length} students)</span>
                    </h3>
                    <button style={{...styles.templateBtn,whiteSpace:'nowrap'}} onClick={()=>downloadTemplate('enrollment')}>⬇️ Download Template</button>
                    <label style={{...styles.templateBtn,whiteSpace:'nowrap',background:'#2b6cb0',color:'#fff',cursor:'pointer',margin:0}}>📤 Import Enrollment <input type="file" accept=".xlsx,.xls" hidden onChange={handleImportEnrollment}/></label>
                  </div>
                  {/* Filters */}
                  <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'1rem',alignItems:'center'}}>
                    <input style={{...styles.input,flex:'1 1 180px',minWidth:'150px',margin:0}} placeholder="🔍 Search roll no or name…"
                      value={enrollSearch} onChange={e=>setEnrollSearch(e.target.value)} />
                    <select style={{...styles.input,flex:'0 1 140px',margin:0}} value={enrollFilterFaculty} onChange={e=>{setEnrollFilterFaculty(e.target.value);setEnrollFilterProg('');}}>
                      <option value="">All Faculties</option>
                      {faculties.map(f=><option key={f.faculty_id} value={f.faculty_id}>{f.faculty_name}</option>)}
                    </select>
                    <select style={{...styles.input,flex:'0 1 120px',margin:0}} value={enrollFilterLevel} onChange={e=>{setEnrollFilterLevel(e.target.value);setEnrollFilterProg('');}}>
                      <option value="">All Levels</option>
                      {levels.map(l=><option key={l.level_id} value={l.level_id}>{l.level_name}</option>)}
                    </select>
                    <select style={{...styles.input,flex:'0 1 180px',margin:0}} value={enrollFilterProg} onChange={e=>setEnrollFilterProg(e.target.value)}>
                      <option value="">All Programmes</option>
                      {programmes.filter(p=>(!enrollFilterFaculty||String(p.faculty_id)===enrollFilterFaculty)&&(!enrollFilterLevel||String(p.level_id)===enrollFilterLevel)).map(p=><option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>)}
                    </select>
                    <select style={{...styles.input,flex:'0 1 100px',margin:0}} value={enrollFilterSem} onChange={e=>setEnrollFilterSem(e.target.value)}>
                      <option value="">All Sem</option>
                      {[1,2,3,4,5,6,7,8].map(s=><option key={s} value={s}>Sem {s}</option>)}
                    </select>
                    <select style={{...styles.input,flex:'0 1 140px',margin:0}} value={enrollFilterStatus} onChange={e=>setEnrollFilterStatus(e.target.value)}>
                      <option value="">All Status</option>
                      <option value="submitted">Submitted</option>
                      <option value="draft">Draft</option>
                      <option value="not_enrolled">Not Enrolled</option>
                    </select>
                    <button style={{...styles.delBtn,background:'#a0aec0',color:'#fff'}} onClick={()=>{setEnrollSearch('');setEnrollFilterFaculty('');setEnrollFilterLevel('');setEnrollFilterProg('');setEnrollFilterSem('');setEnrollFilterStatus('');}}>Clear</button>
                  </div>
                  {/* Export Buttons */}
                  <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap',marginBottom:'1rem'}}>
                    <button style={{...styles.templateBtn,whiteSpace:'nowrap'}} onClick={exportEnrollmentSummary}>📊 Summary</button>
                    <button style={{...styles.templateBtn,whiteSpace:'nowrap',background:'#276749',color:'#fff'}} onClick={handleExportEnrollment}>📥 Programme-wise</button>
                    <button style={{...styles.templateBtn,whiteSpace:'nowrap'}} onClick={handleExportSemesterWise}>📅 Semester-wise</button>
                    <button style={{...styles.templateBtn,whiteSpace:'nowrap'}} onClick={handleExportOddSemesters}>📋 Odd Sem</button>
                    <button style={{...styles.templateBtn,whiteSpace:'nowrap'}} onClick={handleExportEvenSemesters}>📋 Even Sem</button>
                    <button style={{...styles.templateBtn,whiteSpace:'nowrap'}} onClick={exportEnrollmentDetail}>📄 Full Detail</button>
                    <button style={{...styles.templateBtn,whiteSpace:'nowrap'}} onClick={exportSubjectWise}>📚 Subject-wise</button>
                  </div>
                  {/* Stats bar */}
                  <div style={{display:'flex',gap:'1rem',flexWrap:'wrap'}}>
                    {[
                      {label:'Total Students', value:enrollmentSummary.length, bg:'#ebf8ff', color:'#2b6cb0'},
                      {label:'Submitted', value:enrollmentSummary.filter(s=>s.accepted>0).length, bg:'#f0fff4', color:'#276749'},
                      {label:'Not Enrolled', value:enrollmentSummary.filter(s=>!s.total_enrolled).length, bg:'#fff5f5', color:'#c53030'},
                      {label:'Admin Modified', value:enrollmentSummary.filter(s=>s.admin_modified).length, bg:'#faf5ff', color:'#553c9a'},
                    ].map(item=>(
                      <div key={item.label} style={{background:item.bg,borderRadius:'8px',padding:'0.5rem 1rem',fontSize:'0.85rem',fontWeight:'600',color:item.color}}>
                        {item.label}: {item.value}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Students Table */}
                <div style={{background:'#fff',borderRadius:'12px',overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
                  <table style={{...styles.table,boxShadow:'none'}}>
                    <thead><tr>{['Roll No','Name','Programme','Level','Sem','Status','Accepted','Pending','Admin Modified','Actions'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                    <tbody>{enrollmentSummary
                      .filter(s => {
                        if (enrollSearch) { const q = enrollSearch.toLowerCase(); if (!(s.student_name||'').toLowerCase().includes(q) && !(s.roll_no||'').toLowerCase().includes(q)) return false; }
                        if (enrollFilterFaculty && String(s.faculty_id) !== enrollFilterFaculty) return false;
                        if (enrollFilterLevel && String(s.level_id) !== enrollFilterLevel) return false;
                        if (enrollFilterProg && String(s.programme_id) !== enrollFilterProg) return false;
                        if (enrollFilterSem && String(s.semester) !== enrollFilterSem) return false;
                        if (enrollFilterStatus === 'submitted' && !(s.accepted > 0)) return false;
                        if (enrollFilterStatus === 'draft' && !(s.total_enrolled > 0 && s.accepted === 0)) return false;
                        if (enrollFilterStatus === 'not_enrolled' && s.total_enrolled) return false;
                        return true;
                      })
                      .map(s => {
                        const isSubmitted = s.accepted > 0;
                        const notEnrolled = !s.total_enrolled;
                        const isDraft = s.total_enrolled > 0 && s.accepted === 0 && s.pending > 0;
                        return (
                          <tr key={s.student_id} style={{background: s.admin_modified ? '#faf5ff' : notEnrolled ? '#fff5f5' : '#fff'}}>
                            <td style={{...styles.td,fontFamily:'monospace',fontWeight:'700'}}>{s.roll_no}</td>
                            <td style={styles.td}>{s.student_name}</td>
                            <td style={styles.td}>{s.programme_name||'—'}</td>
                            <td style={styles.td}>
                              <span style={{background:s.level_name==='PG'?'#805ad5':'#4c51bf',color:'#fff',padding:'0.15rem 0.5rem',borderRadius:'999px',fontSize:'0.75rem',fontWeight:'600'}}>{s.level_name||'—'}</span>
                            </td>
                            <td style={{...styles.td,textAlign:'center'}}>{s.semester}</td>
                            <td style={styles.td}>
                              {notEnrolled
                                ? <span style={{...styles.badge,background:'#e53e3e'}}>Not Enrolled</span>
                                : isDraft
                                ? <span style={{...styles.badge,background:'#ed8936'}}>Draft</span>
                                : isSubmitted
                                ? <span style={{...styles.badge,background:'#48bb78'}}>Submitted</span>
                                : <span style={{...styles.badge,background:'#a0aec0'}}>Pending</span>}
                            </td>
                            <td style={styles.td}><span style={{...styles.badge,background:'#48bb78'}}>{s.accepted||0}</span></td>
                            <td style={styles.td}><span style={{...styles.badge,background:'#ed8936'}}>{s.pending||0}</span></td>
                            <td style={styles.td}>{s.admin_modified ? <span style={{...styles.badge,background:'#9f7aea'}}>✏️ Yes</span> : <span style={{color:'#a0aec0'}}>—</span>}</td>
                            <td style={styles.td}>
                              <button style={{...styles.addBtn,padding:'0.3rem 0.9rem',fontSize:'0.8rem',marginRight:'0.4rem'}}
                                onClick={()=>openEnrollmentDetail(s)}>📋 Manage</button>
                              <button style={{...styles.delBtn,padding:'0.3rem 0.7rem',fontSize:'0.8rem'}}
                                onClick={()=>handleEnrollReset(s)}>Reset</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div>
                {/* Detail Header */}
                <div style={{background:'#fff',borderRadius:'12px',padding:'1.25rem',marginBottom:'1.5rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'1rem',marginBottom:'1rem',flexWrap:'wrap'}}>
                    <button style={{...styles.addBtn,background:'#718096'}} onClick={()=>setSelectedEnrollStudent(null)}>← Back</button>
                    <div>
                      <h3 style={{margin:0}}>📋 {selectedEnrollStudent.name}
                        <span style={{fontSize:'0.85rem',color:'#718096',fontWeight:'400',marginLeft:'0.5rem'}}>({selectedEnrollStudent.roll_no})</span>
                      </h3>
                      <p style={{margin:'0.25rem 0 0',color:'#718096',fontSize:'0.85rem'}}>
                        {selectedEnrollStudent.programme_name} | Semester {selectedEnrollStudent.semester} |
                        <span style={{marginLeft:'0.4rem',background:selectedEnrollStudent.level_name==='PG'?'#805ad5':'#4c51bf',color:'#fff',padding:'0.1rem 0.4rem',borderRadius:'999px',fontSize:'0.75rem'}}>{selectedEnrollStudent.level_name}</span>
                      </p>
                    </div>
                  </div>
                  {/* Stats */}
                  <div style={{display:'flex',gap:'1rem',flexWrap:'wrap',marginBottom:'1rem'}}>
                    {[
                      {l:'Total',   v:enrollmentDetail.length,                                           bg:'#ebf8ff',c:'#2b6cb0'},
                      {l:'Accepted',v:enrollmentDetail.filter(s=>s.status==='ACCEPTED').length,           bg:'#f0fff4',c:'#276749'},
                      {l:'Rejected',v:enrollmentDetail.filter(s=>s.status==='REJECTED').length,           bg:'#fff5f5',c:'#c53030'},
                      {l:'Pending', v:enrollmentDetail.filter(s=>s.status==='PENDING').length,            bg:'#fffbeb',c:'#92400e'},
                      {l:'Not Set', v:enrollmentDetail.filter(s=>!s.status).length,                      bg:'#f7fafc',c:'#718096'},
                    ].map(item=>(
                      <div key={item.l} style={{background:item.bg,borderRadius:'8px',padding:'0.4rem 0.8rem',fontSize:'0.82rem',fontWeight:'600',color:item.c}}>
                        {item.l}: {item.v}
                      </div>
                    ))}
                  </div>
                  {/* Validation Errors */}
                  {enrollValidationErrors.length > 0 && (
                    <div style={{background:'#fff5f5',border:'2px solid #fc8181',borderRadius:'10px',padding:'1rem',marginBottom:'1rem'}}>
                      <h4 style={{margin:'0 0 0.5rem',color:'#c53030'}}>⚠️ Please fix these issues before saving:</h4>
                      {enrollValidationErrors.map((err,i)=>(
                        <p key={i} style={{margin:'0.2rem 0',color:'#c53030',fontSize:'0.85rem'}}>{err}</p>
                      ))}
                    </div>
                  )}

                  {/* Admin note + actions */}
                  <div style={{display:'flex',gap:'0.75rem',flexWrap:'wrap',alignItems:'center'}}>
                    <input style={{...styles.input,flex:1,minWidth:'200px',margin:0}} placeholder="Admin note (optional — shown to student)"
                      value={adminNote} onChange={e=>setAdminNote(e.target.value)} />
                    <button style={{...styles.addBtn,whiteSpace:'nowrap'}} onClick={handleEnrollSave}>💾 Save Changes</button>
                    <button style={{...styles.delBtn,padding:'0.6rem 1.2rem',whiteSpace:'nowrap'}}
                      onClick={()=>handleEnrollReset(selectedEnrollStudent)}>🔄 Reset All</button>
                  </div>
                </div>

                {/* Category labels */}
                {(() => {
                  const catLabels = {
                    MAJOR:'Discipline Specific Course (DSC)', MIC:'Minor Course / Vocational',
                    MDC:'Multidisciplinary Course', SEC:'Skill Enhancement Course',
                    VAC:'Value Added Course', AEC:'Ability Enhancement Course',
                    ELECTIVE:'Discipline Elective Course', ELECTIVE_FINANCE:'Discipline Elective — Finance',
                    ELECTIVE_HR:'Discipline Elective — Human Resource', ELECTIVE_MARKETING:'Discipline Elective — Marketing',
                    OEC:'Open Elective Course', SEMINAR:'Seminar', INTERNSHIP:'Internship', VOC:'Vocational Course',
                  };
                  const catColors = {
                    MAJOR:'#4c51bf', MIC:'#057a55', MDC:'#dd6b20', SEC:'#e53e3e',
                    VAC:'#d69e2e', AEC:'#805ad5', ELECTIVE:'#2b6cb0', ELECTIVE_FINANCE:'#276749',
                    ELECTIVE_HR:'#702459', ELECTIVE_MARKETING:'#744210',
                    OEC:'#1a365d', SEMINAR:'#553c9a', INTERNSHIP:'#234e52', VOC:'#2c7a7b',
                  };
                  const catOrder = ['MAJOR','MIC','MDC','SEC','VAC','AEC','ELECTIVE','ELECTIVE_FINANCE','ELECTIVE_HR','ELECTIVE_MARKETING','OEC','SEMINAR','INTERNSHIP','VOC'];
                  const grouped = {};
                  enrollmentDetail.forEach(s => {
                    if (!grouped[s.category]) grouped[s.category] = [];
                    grouped[s.category].push(s);
                  });
                  const allCats = [...catOrder, ...Object.keys(grouped).filter(c => !catOrder.includes(c))];
                  return allCats.filter(cat => grouped[cat]).map(cat => {
                    const subjects = grouped[cat];
                    const acceptedCount = subjects.filter(s => s.status === 'ACCEPTED').length;
                    return (
                      <div key={cat} style={{marginBottom:'1.5rem',borderRadius:'10px',overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
                        <div style={{background:catColors[cat]||'#667eea',padding:'0.65rem 1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center',color:'#fff'}}>
                          <span style={{fontWeight:'700',fontSize:'0.95rem'}}>{catLabels[cat]||cat}</span>
                          <div style={{display:'flex',gap:'0.75rem',alignItems:'center',fontSize:'0.82rem'}}>
                            <span style={{background:'rgba(255,255,255,0.25)',padding:'0.15rem 0.6rem',borderRadius:'999px'}}>{subjects.length} subjects</span>
                            <span style={{background:'rgba(255,255,255,0.25)',padding:'0.15rem 0.6rem',borderRadius:'999px'}}>✅ {acceptedCount} accepted</span>
                          </div>
                        </div>
                        <table style={{...styles.table,boxShadow:'none',borderRadius:0}}>
                          <thead>
                            <tr>{['Code','Subject','Discipline','Credits','Current Status','Change Status'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr>
                          </thead>
                          <tbody>{subjects
                            .filter(s => s.pair_type !== 'PRACTICAL')
                            .map(s => {
                            const practicalSub = s.pair_code
                              ? subjects.find(s2 => s2.subject_code.trim() === s.pair_code.trim())
                              : null;
                            const bgColor = s.status==='ACCEPTED'?'#f0fff4':s.status==='REJECTED'?'#fff5f5':!s.status?'#f7fafc':'#fff';
                            return (
                            <tr key={s.subject_id} style={{background:bgColor}}>
                              <td style={{...styles.td,fontFamily:'monospace',fontWeight:'600',fontSize:'0.8rem'}}>
                                <div>{s.subject_code} {s.pair_type==='THEORY' && <span style={{background:'#ebf8ff',color:'#2b6cb0',padding:'0.1rem 0.4rem',borderRadius:'4px',fontSize:'0.7rem'}}>📚T</span>}</div>
                                {practicalSub && <div style={{color:'#718096',marginTop:'0.2rem'}}>{practicalSub.subject_code} <span style={{background:'#e6fffa',color:'#234e52',padding:'0.1rem 0.4rem',borderRadius:'4px',fontSize:'0.7rem'}}>🔬P</span></div>}
                              </td>
                              <td style={styles.td}>
                                <div>{s.subject_name}</div>
                                {practicalSub && <div style={{fontSize:'0.78rem',color:'#718096',marginTop:'0.2rem'}}>🔗 {practicalSub.subject_name} <span style={{color:'#2b6cb0'}}>(auto-paired)</span></div>}
                              </td>
                              <td style={styles.td}>
                                {s.discipline_name
                                  ? <span style={{background:'#ebf8ff',color:'#2b6cb0',padding:'0.15rem 0.5rem',borderRadius:'999px',fontSize:'0.75rem',fontWeight:'600'}}>{s.discipline_name}</span>
                                  : <span style={{color:'#a0aec0',fontSize:'0.75rem'}}>—</span>}
                              </td>
                              <td style={{...styles.td,textAlign:'center'}}>
                                {practicalSub
                                  ? <span title="Theory+Practical">{Number(s.credits)+Number(practicalSub.credits)}<span style={{fontSize:'0.7rem',color:'#a0aec0'}}> ({s.credits}+{practicalSub.credits})</span></span>
                                  : s.credits}
                              </td>
                              <td style={styles.td}>
                                <div>
                                  <span style={{...styles.badge,background:s.status==='ACCEPTED'?'#48bb78':s.status==='REJECTED'?'#e53e3e':s.status==='PENDING'?'#ed8936':'#a0aec0'}}>
                                    {s.status||'NOT SET'}
                                  </span>
                                  {s.admin_modified ? <span style={{...styles.badge,background:'#9f7aea',marginLeft:'0.4rem',fontSize:'0.7rem'}}>✏️ Admin</span> : null}
                                </div>
                                {practicalSub && (
                                  <div style={{marginTop:'0.2rem'}}>
                                    <span style={{...styles.badge,fontSize:'0.7rem',background:practicalSub.status==='ACCEPTED'?'#48bb78':practicalSub.status==='REJECTED'?'#e53e3e':practicalSub.status==='PENDING'?'#ed8936':'#a0aec0'}}>
                                      P: {practicalSub.status||'NOT SET'}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td style={styles.td}>
                                <div style={{display:'flex',gap:'0.4rem',flexWrap:'wrap'}}>
                                  {['ACCEPTED','REJECTED','PENDING'].map(st=>(
                                    <button key={st} onClick={()=>{
                                        handleEnrollStatusChange(s.subject_id, st);
                                        if (practicalSub) handleEnrollStatusChange(practicalSub.subject_id, st);
                                      }}
                                      style={{padding:'0.25rem 0.6rem',fontSize:'0.75rem',border:'none',borderRadius:'5px',cursor:'pointer',fontWeight:'600',
                                        background:s.status===st?(st==='ACCEPTED'?'#48bb78':st==='REJECTED'?'#e53e3e':'#ed8936'):'#e2e8f0',
                                        color:s.status===st?'#fff':'#4a5568',opacity:s.status===st?1:0.7}}>
                                      {st==='ACCEPTED'?'✅':st==='REJECTED'?'❌':'⏳'} {st.charAt(0)+st.slice(1).toLowerCase()}
                                    </button>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )})}</tbody>
                        </table>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        )}

        {/* ATTENDANCE */}
        {activeTab === 'attendance' && (
          <div>
            <div style={{...styles.readonlyBanner, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'0.75rem'}}>
              <span>👁️ Attendance is marked by Teachers only</span>
              <div style={{display:'flex', gap:'0.5rem', flexWrap:'wrap'}}>
                <button style={{...styles.templateBtn,whiteSpace:'nowrap'}} onClick={exportAttendanceProgrammeWise}>📥 Programme-wise (Excel)</button>
                <button style={{...styles.templateBtn,whiteSpace:'nowrap',background:'#744210',color:'#fff'}} onClick={exportAttendanceSubjectWise}>📄 Subject-wise (Excel + PDF)</button>
              </div>
            </div>
            <h3>All Attendance Records ({attendance.length})</h3>
            <table style={styles.table} className="erp-table">
              <thead><tr>{['ID','Student','Subject','Date','Status'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>{attendance.map(a=>(
                <tr key={a.attendance_id}>
                  <td style={styles.td}>{a.attendance_id}</td>
                  <td style={styles.td}>{a.student_name}</td>
                  <td style={styles.td}>{a.subject_name}</td>
                  <td style={styles.td}>{new Date(a.date).toLocaleDateString()}</td>
                  <td style={styles.td}><span style={{...styles.badge,background:a.status==='PRESENT'?'#48bb78':a.status==='LATE'?'#ed8936':'#e53e3e'}}>{a.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* FEES */}
        {activeTab === 'fees' && (
          <div>

            {/* Summary Cards */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
              {[
                {label:'Total Records', value:fees.length, bg:'#ebf8ff', color:'#2b6cb0'},
                {label:'Total Amount', value:`₹${fees.reduce((s,f)=>s+Number(f.amount),0).toLocaleString()}`, bg:'#f7fafc', color:'#2d3748'},
                {label:'Paid', value:`₹${fees.filter(f=>f.status==='PAID').reduce((s,f)=>s+Number(f.amount),0).toLocaleString()}`, bg:'#f0fff4', color:'#276749'},
                {label:'Pending', value:`₹${fees.filter(f=>f.status==='PENDING').reduce((s,f)=>s+Number(f.amount),0).toLocaleString()}`, bg:'#fffbeb', color:'#92400e'},
                {label:'Overdue', value:`₹${fees.filter(f=>f.status==='OVERDUE').reduce((s,f)=>s+Number(f.amount),0).toLocaleString()}`, bg:'#fff5f5', color:'#c53030'},
              ].map(item=>(
                <div key={item.label} style={{background:item.bg,borderRadius:'10px',padding:'1rem',textAlign:'center',boxShadow:'0 2px 6px rgba(0,0,0,0.06)'}}>
                  <p style={{fontSize:'1.4rem',fontWeight:'700',margin:0,color:item.color}}>{item.value}</p>
                  <p style={{fontSize:'0.8rem',color:'#718096',margin:'0.25rem 0 0'}}>{item.label}</p>
                </div>
              ))}
            </div>

            {/* Programme Summary */}
            {feeSummary.length > 0 && (
              <div style={{background:'#fff',borderRadius:'12px',padding:'1.25rem',marginBottom:'1.5rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
                <h3 style={{margin:'0 0 1rem',color:'#2d3748'}}>📊 Fee Summary by Programme</h3>
                <table style={{...styles.table,boxShadow:'none'}}>
                  <thead><tr>{['Programme','Level','Students','Total Amount','Paid','Pending','Overdue','Collection %'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                  <tbody>{feeSummary.map((s,i)=>{
                    const pct = s.total_amount > 0 ? ((s.paid_amount/s.total_amount)*100).toFixed(1) : 0;
                    return (
                      <tr key={i}>
                        <td style={styles.td}><strong>{s.programme_name}</strong></td>
                        <td style={styles.td}><span style={{background:s.level_name==='PG'?'#805ad5':'#4c51bf',color:'#fff',padding:'0.15rem 0.5rem',borderRadius:'999px',fontSize:'0.75rem'}}>{s.level_name}</span></td>
                        <td style={{...styles.td,textAlign:'center'}}>{s.total_students}</td>
                        <td style={styles.td}><strong>₹{Number(s.total_amount).toLocaleString()}</strong></td>
                        <td style={styles.td}><span style={{color:'#276749',fontWeight:'600'}}>₹{Number(s.paid_amount).toLocaleString()}</span></td>
                        <td style={styles.td}><span style={{color:'#92400e',fontWeight:'600'}}>₹{Number(s.pending_amount).toLocaleString()}</span></td>
                        <td style={styles.td}><span style={{color:'#c53030',fontWeight:'600'}}>₹{Number(s.overdue_amount).toLocaleString()}</span></td>
                        <td style={styles.td}>
                          <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
                            <div style={{flex:1,height:'8px',background:'#e2e8f0',borderRadius:'999px',overflow:'hidden'}}>
                              <div style={{width:`${pct}%`,height:'100%',background:pct>=75?'#48bb78':pct>=50?'#ed8936':'#e53e3e',borderRadius:'999px'}}/>
                            </div>
                            <span style={{fontSize:'0.8rem',fontWeight:'600',minWidth:'36px'}}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}

            {/* Bulk Fee Generation */}
            <div style={{background:'#fff',borderRadius:'12px',padding:'1.25rem',marginBottom:'1.5rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
              <h3 style={{margin:'0 0 1rem',color:'#2d3748'}}>⚡ Bulk Fee Generation</h3>
              <form onSubmit={handleBulkFee} style={{display:'flex',gap:'0.75rem',flexWrap:'wrap',alignItems:'flex-end'}}>
                <div style={{display:'flex',flexDirection:'column',gap:'0.3rem'}}>
                  <label style={{fontSize:'0.8rem',color:'#4a5568',fontWeight:'600'}}>Programme (optional)</label>
                  <select style={{...styles.input,margin:0,minWidth:'180px'}} value={bulkFeeForm.programme_id||''} onChange={e=>setBulkFeeForm({...bulkFeeForm,programme_id:e.target.value||undefined})}>
                    <option value="">All Students</option>
                    {programmes.map(p=><option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>)}
                  </select>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'0.3rem'}}>
                  <label style={{fontSize:'0.8rem',color:'#4a5568',fontWeight:'600'}}>Fee Type</label>
                  <select style={{...styles.input,margin:0}} value={bulkFeeForm.fee_type||''} onChange={e=>setBulkFeeForm({...bulkFeeForm,fee_type:e.target.value})} required>
                    <option value="">Select Type</option>
                    <option value="Tuition Fee">Tuition Fee</option>
                    <option value="Exam Fee">Exam Fee</option>
                    <option value="Library Fee">Library Fee</option>
                    <option value="Sports Fee">Sports Fee</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'0.3rem'}}>
                  <label style={{fontSize:'0.8rem',color:'#4a5568',fontWeight:'600'}}>Amount (₹)</label>
                  <input style={{...styles.input,margin:0}} type="number" placeholder="e.g. 15000" value={bulkFeeForm.amount||''} onChange={e=>setBulkFeeForm({...bulkFeeForm,amount:e.target.value})} required />
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'0.3rem'}}>
                  <label style={{fontSize:'0.8rem',color:'#4a5568',fontWeight:'600'}}>Due Date</label>
                  <input style={{...styles.input,margin:0}} type="date" value={bulkFeeForm.due_date||''} onChange={e=>setBulkFeeForm({...bulkFeeForm,due_date:e.target.value})} required />
                </div>
                <button style={{...styles.addBtn,whiteSpace:'nowrap'}} type="submit">⚡ Generate Fees</button>
              </form>
            </div>

            {/* Add Fee + Import */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem',marginBottom:'1.5rem'}}>
              <div style={{background:'#fff',borderRadius:'12px',padding:'1.25rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
                <h3 style={{margin:'0 0 1rem',color:'#2d3748'}}>➕ Add Fee Manually</h3>
                <form onSubmit={handleAddFee} style={{display:'flex',flexDirection:'column',gap:'0.75rem'}}>
                  <select style={{...styles.input,margin:0}} value={form.student_id||''} onChange={e=>setForm({...form,student_id:e.target.value})} required>
                    <option value="">Select Student</option>
                    {students.map(s=><option key={s.student_id} value={s.student_id}>{s.roll_no} - {s.name}</option>)}
                  </select>
                  <select style={{...styles.input,margin:0}} value={form.fee_type||''} onChange={e=>setForm({...form,fee_type:e.target.value})} required>
                    <option value="">Select Fee Type</option>
                    <option value="Tuition Fee">Tuition Fee</option>
                    <option value="Exam Fee">Exam Fee</option>
                    <option value="Library Fee">Library Fee</option>
                    <option value="Sports Fee">Sports Fee</option>
                    <option value="Other">Other</option>
                  </select>
                  <input style={{...styles.input,margin:0}} type="number" placeholder="Amount (₹)" value={form.amount||''} onChange={e=>setForm({...form,amount:e.target.value})} required />
                  <input style={{...styles.input,margin:0}} type="date" value={form.due_date||''} onChange={e=>setForm({...form,due_date:e.target.value})} required />
                  <button style={styles.addBtn} type="submit">Add Fee</button>
                </form>
              </div>
              <div style={{background:'#fff',borderRadius:'12px',padding:'1.25rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
                <h3 style={{margin:'0 0 1rem',color:'#2d3748'}}>📥 Import from Excel</h3>
                <div style={styles.importActions}>
                  <button style={styles.templateBtn} onClick={()=>downloadTemplate('fees')}>⬇️ Download Template</button>
                  <label style={{...styles.importBtn,opacity:importing?0.6:1}}>
                    {importing?'⏳ Importing...':'📂 Choose Excel File'}
                    <input ref={feeFileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImportFees} disabled={importing} />
                  </label>
                </div>
                <p style={styles.importHint}>📋 Required: <strong>roll_no, amount, fee_type, due_date</strong></p>
                <div style={{marginTop:'1rem',padding:'0.75rem',background:'#fffbeb',borderRadius:'8px',border:'1px solid #fcd34d'}}>
                  <p style={{margin:0,fontSize:'0.82rem',color:'#92400e',fontWeight:'600'}}>⚡ Auto Mark Overdue</p>
                  <p style={{margin:'0.25rem 0 0.5rem',fontSize:'0.8rem',color:'#718096'}}>Fees past due date are auto-marked overdue when you open this tab.</p>
                </div>
              </div>
            </div>

            {/* Fee Records Table */}
            <div style={{background:'#fff',borderRadius:'12px',overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
              <div style={{padding:'1rem 1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #e2e8f0'}}>
                <h3 style={{margin:0}}>All Fee Records ({fees.length})</h3>
                <input style={{...styles.input,margin:0,minWidth:'220px'}} placeholder="🔍 Search student..."
                  value={feeFilter} onChange={e=>setFeeFilter(e.target.value)} />
              </div>
              <table style={{...styles.table,boxShadow:'none'}}>
                <thead><tr>{['Student','Roll No','Programme','Fee Type','Amount','Due Date','Paid Date','Status','Action'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>{fees
                  .filter(f => !feeFilter || f.student_name?.toLowerCase().includes(feeFilter.toLowerCase()) || f.roll_no?.toLowerCase().includes(feeFilter.toLowerCase()))
                  .map(f=>(
                  <tr key={f.fee_id} style={{background:f.status==='OVERDUE'?'#fff5f5':f.status==='PAID'?'#f0fff4':'#fff'}}>
                    <td style={styles.td}><strong>{f.student_name}</strong></td>
                    <td style={{...styles.td,fontFamily:'monospace',fontWeight:'700'}}>{f.roll_no}</td>
                    <td style={styles.td}>{f.programme_name||'—'}</td>
                    <td style={styles.td}>{f.fee_type}</td>
                    <td style={{...styles.td,fontWeight:'700'}}>₹{Number(f.amount).toLocaleString()}</td>
                    <td style={styles.td}>{f.due_date ? new Date(f.due_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'}</td>
                    <td style={styles.td}>{f.paid_date ? new Date(f.paid_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'}</td>
                    <td style={styles.td}>
                      <span style={{...styles.badge,background:f.status==='PAID'?'#48bb78':f.status==='OVERDUE'?'#e53e3e':'#ed8936'}}>
                        {f.status==='PAID'?'✅ Paid':f.status==='OVERDUE'?'🔴 Overdue':'⏳ Pending'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {f.status!=='PAID'
                        ? <button style={styles.payBtn} onClick={()=>handleMarkPaid(f.fee_id)}>💰 Mark Paid</button>
                        : <span style={{color:'#48bb78',fontWeight:'600',fontSize:'0.82rem'}}>{f.transaction_ref}</span>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* MARKS */}
        {activeTab === 'marks' && (
          <div>
            <div style={{...styles.readonlyBanner, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'0.75rem'}}>
              <span>👁️ Marks are entered by Teachers only</span>
              <div style={{display:'flex', gap:'0.5rem', flexWrap:'wrap'}}>
                <button style={{...styles.templateBtn,whiteSpace:'nowrap'}} onClick={exportMarksProgrammeWise}>📥 Programme-wise</button>
                <button style={{...styles.templateBtn,whiteSpace:'nowrap'}} onClick={exportMarksSemesterWise}>📅 Semester-wise</button>
                <button style={{...styles.templateBtn,whiteSpace:'nowrap'}} onClick={exportMarksOddSem}>📋 Odd Sem</button>
                <button style={{...styles.templateBtn,whiteSpace:'nowrap'}} onClick={exportMarksEvenSem}>📋 Even Sem</button>
                <button style={{...styles.templateBtn,whiteSpace:'nowrap',background:'#744210',color:'#fff'}} onClick={exportSubjectMarks}>📄 Subject-wise (Excel + PDF)</button>
              </div>
            </div>
            <h3>All Marks Records ({marks.length})</h3>
            <table style={styles.table} className="erp-table">
              <thead><tr>{['ID','Student','Subject','Exam Type','Marks','Max','Percentage','Semester'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
              <tbody>{marks.map(m=>(
                <tr key={m.mark_id}>
                  <td style={styles.td}>{m.mark_id}</td><td style={styles.td}>{m.student_name}</td>
                  <td style={styles.td}>{m.subject_name}</td>
                  <td style={styles.td}><span style={{...styles.badge,background:'#9f7aea'}}>{m.exam_type}</span></td>
                  <td style={styles.td}><strong>{m.marks_obtained}</strong></td>
                  <td style={styles.td}>{m.max_marks}</td>
                  <td style={styles.td}><span style={{...styles.badge,background:(m.marks_obtained/m.max_marks*100)>=60?'#48bb78':'#e53e3e'}}>{((m.marks_obtained/m.max_marks)*100).toFixed(1)}%</span></td>
                  <td style={styles.td}>{m.semester}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <div>
            {/* Send notification form */}
            <div style={{ background:'#fff', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', marginBottom:'1.5rem' }}>
              <h3 style={{ margin:'0 0 1rem', color:'#2d3748', borderBottom:'2px solid #e2e8f0', paddingBottom:'0.5rem' }}>
                📢 Send New Notification
              </h3>
              <div style={{ display:'grid', gridTemplateColumns: notifForm.target === 'class' ? '1fr 1fr 1fr' : '1fr', gap:'12px', marginBottom:'0.75rem' }}>
                <div>
                  <label style={{ display:'block', fontSize:'0.85rem', fontWeight:'600', color:'#4a5568', marginBottom:'4px' }}>Send To *</label>
                  <select style={{ ...styles.input, width:'100%', boxSizing:'border-box' }}
                    value={notifForm.target} onChange={e => setNotifForm(p => ({ ...p, target: e.target.value, programme_id: '', target_semester: '' }))}>
                    <option value="all">All Students</option>
                    <option value="class">Class-wise (Programme + Semester)</option>
                  </select>
                </div>
                {notifForm.target === 'class' && (
                  <>
                    <div>
                      <label style={{ display:'block', fontSize:'0.85rem', fontWeight:'600', color:'#4a5568', marginBottom:'4px' }}>Programme *</label>
                      <select style={{ ...styles.input, width:'100%', boxSizing:'border-box' }}
                        value={notifForm.programme_id} onChange={e => setNotifForm(p => ({ ...p, programme_id: e.target.value }))}>
                        <option value="">Select programme...</option>
                        {programmes.map(p => <option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'0.85rem', fontWeight:'600', color:'#4a5568', marginBottom:'4px' }}>Semester *</label>
                      <select style={{ ...styles.input, width:'100%', boxSizing:'border-box' }}
                        value={notifForm.target_semester} onChange={e => setNotifForm(p => ({ ...p, target_semester: e.target.value }))}>
                        <option value="">Select semester...</option>
                        {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>
              <div style={{ marginBottom:'0.75rem' }}>
                <label style={{ display:'block', fontSize:'0.85rem', fontWeight:'600', color:'#4a5568', marginBottom:'4px' }}>Title *</label>
                <input style={{ ...styles.input, width:'100%', boxSizing:'border-box' }}
                  placeholder="Notification title..."
                  value={notifForm.title}
                  onChange={e => setNotifForm(p => ({ ...p, title: e.target.value }))}
                  maxLength={200}
                />
              </div>
              <div style={{ marginBottom:'0.75rem' }}>
                <label style={{ display:'block', fontSize:'0.85rem', fontWeight:'600', color:'#4a5568', marginBottom:'4px' }}>Message *</label>
                <textarea
                  style={{ ...styles.input, width:'100%', boxSizing:'border-box', minHeight:'120px', resize:'vertical', fontFamily:'inherit' }}
                  placeholder="Type your notification message here..."
                  value={notifForm.message}
                  onChange={e => setNotifForm(p => ({ ...p, message: e.target.value }))}
                  maxLength={5000}
                />
                <span style={{ fontSize:'0.75rem', color:'#a0aec0' }}>{notifForm.message.length}/5000</span>
              </div>
              <div style={{ marginBottom:'1rem' }}>
                <label style={{ display:'block', fontSize:'0.85rem', fontWeight:'600', color:'#4a5568', marginBottom:'4px' }}>
                  Attachment (Image or PDF, max 5MB)
                </label>
                <input type="file" ref={notifFileRef}
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                  onChange={e => setNotifFile(e.target.files[0] || null)}
                  style={{ fontSize:'0.9rem' }}
                />
                {notifFile && (
                  <div style={{ marginTop:'8px', display:'flex', alignItems:'center', gap:'8px' }}>
                    <span style={{ fontSize:'0.85rem', color:'#4a5568' }}>
                      {notifFile.type === 'application/pdf' ? '📄' : '🖼️'} {notifFile.name} ({(notifFile.size / 1024).toFixed(1)} KB)
                    </span>
                    <button style={{ background:'none', border:'none', color:'#e53e3e', cursor:'pointer', fontWeight:'700' }}
                      onClick={() => { setNotifFile(null); if (notifFileRef.current) notifFileRef.current.value = ''; }}>
                      ✕ Remove
                    </button>
                  </div>
                )}
              </div>
              <button
                style={{ ...styles.addBtn, opacity: notifSending ? 0.6 : 1, padding:'0.7rem 2rem', fontSize:'0.95rem' }}
                onClick={sendNotification}
                disabled={notifSending}
              >
                {notifSending ? '⏳ Sending...' : notifForm.target === 'all' ? '🔔 Send to All Students' : '🔔 Send to Class'}
              </button>
            </div>

            {/* Notifications list */}
            <h3 style={{ color:'#2d3748' }}>Sent Notifications ({notifications.length})</h3>
            {notifications.length === 0 ? (
              <div style={{ background:'#fff', padding:'3rem', textAlign:'center', borderRadius:'12px', color:'#718096' }}>
                No notifications sent yet.
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.notification_id} style={{ background:'#fff', borderRadius:'10px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', marginBottom:'1rem', overflow:'hidden' }}>
                  <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                        <h4 style={{ margin:0, color:'#2d3748' }}>{n.title}</h4>
                        <span style={{ fontSize:'0.7rem', fontWeight:'600', padding:'2px 8px', borderRadius:'999px', color:'#fff',
                          background: n.target === 'all' ? '#4c51bf' : '#d97706' }}>
                          {n.target === 'all' ? 'All Students' : `${n.programme_name} — Sem ${n.target_semester}`}
                        </span>
                      </div>
                      <span style={{ fontSize:'0.8rem', color:'#a0aec0' }}>
                        by {n.admin_name || 'Admin'} · {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                    <button style={styles.delBtn} onClick={() => deleteNotification(n.notification_id)}>Delete</button>
                  </div>
                  <div style={{ padding:'1rem 1.25rem' }}>
                    <p style={{ margin:0, color:'#4a5568', whiteSpace:'pre-wrap', lineHeight:'1.6' }}>{n.message}</p>
                    {n.attachment_url && (
                      <div style={{ marginTop:'0.75rem', padding:'0.75rem', background:'#f7fafc', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
                        {n.attachment_type === 'image' ? (
                          <div>
                            <img src={`${API_BASE}${n.attachment_url}`} alt="attachment"
                              style={{ maxWidth:'100%', maxHeight:'300px', borderRadius:'6px', cursor:'pointer' }}
                              onClick={() => window.open(`${API_BASE}${n.attachment_url}`, '_blank')}
                            />
                            <div style={{ fontSize:'0.8rem', color:'#718096', marginTop:'4px' }}>{n.attachment_name}</div>
                          </div>
                        ) : (
                          <a href={`${API_BASE}${n.attachment_url}`} target="_blank" rel="noopener noreferrer"
                            style={{ display:'inline-flex', alignItems:'center', gap:'6px', color:'#2b6cb0', fontWeight:'600', textDecoration:'none' }}>
                            📄 {n.attachment_name || 'Download PDF'}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Import Errors Modal — shown after teacher CSV import */}
      {importErrorsOpen && (
        <div
          onClick={() => setImportErrorsOpen(false)}
          style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999,
            display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background:'#fff', borderRadius:'12px', maxWidth:'900px', width:'100%',
              maxHeight:'80vh', display:'flex', flexDirection:'column',
              boxShadow:'0 20px 40px rgba(0,0,0,0.25)'
            }}
          >
            <div style={{
              padding:'1rem 1.5rem', borderBottom:'2px solid #e2e8f0',
              display:'flex', justifyContent:'space-between', alignItems:'center',
              background:'#fffaf0', borderRadius:'12px 12px 0 0'
            }}>
              <h3 style={{margin:0, color:'#744210'}}>
                &#9888;&#65039;&nbsp; Import Issues ({importErrors.length})
              </h3>
              <button
                onClick={() => setImportErrorsOpen(false)}
                style={{background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer', color:'#718096'}}
              >&times;</button>
            </div>
            <div style={{overflow:'auto', flex:1, padding:'1rem 1.5rem'}}>
              <p style={{margin:'0 0 1rem', color:'#4a5568', fontSize:'0.9rem'}}>
                <strong style={{color:'#e53e3e'}}>&#10060; Errors</strong> caused the row to fail.{' '}
                <strong style={{color:'#d69e2e'}}>&#9888;&#65039; Warnings</strong> imported the teacher but dropped a discipline/department link.
              </p>
              <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.85rem'}}>
                <thead>
                  <tr style={{background:'#2d3748', color:'#fff'}}>
                    <th style={{padding:'0.6rem 0.8rem', textAlign:'left'}}>Row</th>
                    <th style={{padding:'0.6rem 0.8rem', textAlign:'left'}}>Name</th>
                    <th style={{padding:'0.6rem 0.8rem', textAlign:'left'}}>Email</th>
                    <th style={{padding:'0.6rem 0.8rem', textAlign:'left'}}>Severity</th>
                    <th style={{padding:'0.6rem 0.8rem', textAlign:'left'}}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {importErrors.map((e, i) => (
                    <tr key={i} style={{borderBottom:'1px solid #e2e8f0', background: e.severity==='error'?'#fff5f5':'#fffbeb'}}>
                      <td style={{padding:'0.6rem 0.8rem', fontWeight:'600'}}>{e.row}</td>
                      <td style={{padding:'0.6rem 0.8rem'}}>{e.name}</td>
                      <td style={{padding:'0.6rem 0.8rem', color:'#4a5568'}}>{e.email}</td>
                      <td style={{padding:'0.6rem 0.8rem'}}>
                        {e.severity==='error'
                          ? <span style={{color:'#e53e3e', fontWeight:'600'}}>&#10060; Error</span>
                          : <span style={{color:'#d69e2e', fontWeight:'600'}}>&#9888;&#65039; Warning</span>}
                      </td>
                      <td style={{padding:'0.6rem 0.8rem', color:'#2d3748'}}>{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{
              padding:'1rem 1.5rem', borderTop:'2px solid #e2e8f0',
              display:'flex', justifyContent:'flex-end', gap:'0.75rem',
              background:'#f7fafc', borderRadius:'0 0 12px 12px'
            }}>
              <button
                onClick={downloadImportErrorsCSV}
                style={{padding:'0.6rem 1.2rem', background:'#4c51bf', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'600'}}
              >&#128229; Download CSV</button>
              <button
                onClick={() => setImportErrorsOpen(false)}
                style={{padding:'0.6rem 1.2rem', background:'#a0aec0', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'600'}}
              >Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const facultyColors = { 'Arts':'#9f7aea', 'Science':'#48bb78', 'Commerce':'#ed8936' };

const styles = {
  container: { minHeight:'100vh', background:'#f0f4f8' },
  nav: { background:'#2d3748', padding:'1rem 2rem', display:'flex', justifyContent:'space-between', alignItems:'center' },
  navTitle: { color:'#fff', margin:0 },
  navRight: { display:'flex', alignItems:'center', gap:'1rem' },
  adminName: { color:'#a0aec0' },
  logoutBtn: { background:'#e53e3e', color:'#fff', border:'none', padding:'0.5rem 1rem', borderRadius:'6px', cursor:'pointer' },
  tabs: { display:'flex', background:'#fff', borderBottom:'2px solid #e2e8f0', padding:'0 2rem', flexWrap:'wrap' },
  tab: { padding:'1rem 1.2rem', border:'none', background:'none', cursor:'pointer', fontSize:'0.9rem', color:'#718096', textTransform:'capitalize' },
  activeTab: { color:'#4c51bf', borderBottom:'2px solid #4c51bf', fontWeight:'600' },
  content: { padding:'2rem' },
  msg: { padding:'0.75rem 2rem', fontWeight:'600' },
  threeCol: { display:'grid', gridTemplateColumns:'1fr 1fr 1.6fr', gap:'1.5rem' },
  section: { background:'#fff', padding:'1.5rem', borderRadius:'12px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)' },
  sectionTitle: { margin:'0 0 1rem', color:'#2d3748', borderBottom:'2px solid #e2e8f0', paddingBottom:'0.5rem' },
  readonlyBanner: { background:'#ebf8ff', color:'#2b6cb0', border:'1px solid #90cdf4', borderRadius:'8px', padding:'0.75rem 1.25rem', marginBottom:'1.5rem', fontWeight:'600' },
  importBox: { background:'#fff', border:'2px dashed #4c51bf', borderRadius:'12px', padding:'1.5rem', marginBottom:'2rem' },
  importTitle: { color:'#4c51bf', marginTop:0 },
  importActions: { display:'flex', gap:'1rem', marginBottom:'0.75rem', flexWrap:'wrap' },
  templateBtn: { padding:'0.6rem 1.2rem', background:'#ebf8ff', color:'#2b6cb0', border:'1px solid #90cdf4', borderRadius:'6px', cursor:'pointer', fontWeight:'600' },
  importBtn: { padding:'0.6rem 1.2rem', background:'#4c51bf', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'600' },
  importHint: { color:'#718096', fontSize:'0.85rem', margin:0 },
  form: { display:'flex', flexWrap:'wrap', gap:'0.75rem', marginBottom:'1rem', padding:'1rem', background:'#f7fafc', borderRadius:'8px' },
  input: { padding:'0.6rem 0.9rem', borderRadius:'6px', border:'1px solid #cbd5e0', fontSize:'0.95rem', minWidth:'160px' },
  addBtn: { padding:'0.6rem 1.5rem', background:'#4c51bf', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'600' },
  payBtn: { padding:'0.3rem 0.75rem', background:'#48bb78', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer', fontWeight:'600' },
  table: { width:'100%', borderCollapse:'collapse', background:'#fff', borderRadius:'10px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)' },
  th: { background:'#2d3748', color:'#fff', padding:'0.75rem 1rem', textAlign:'left', fontSize:'0.85rem' },
  td: { padding:'0.65rem 1rem', borderBottom:'1px solid #e2e8f0', fontSize:'0.85rem' },
  delBtn: { background:'#e53e3e', color:'#fff', border:'none', padding:'0.3rem 0.75rem', borderRadius:'4px', cursor:'pointer' },
  badge: { padding:'0.2rem 0.6rem', borderRadius:'999px', color:'#fff', fontSize:'0.75rem', fontWeight:'600' },
};
