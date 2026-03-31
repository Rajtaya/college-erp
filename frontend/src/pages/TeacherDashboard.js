import React, { useState, useEffect, useRef } from 'react';
import API, { SERVER_BASE } from '../api';

export default function TeacherDashboard({ teacher, onLogout }) {
  const [activeTab, setActiveTab] = useState('subjects');
  const [subjects, setSubjects] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success');

  // Add subject assignment form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ subject_id: '', section: 'A', programme_id: '', class_name: '' });

  // Attendance state
  const [attSubject, setAttSubject] = useState('');
  const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0]);
  const [attStudents, setAttStudents] = useState([]);
  const [attLoading, setAttLoading] = useState(false);

  // Marks state
  const [marksSubject, setMarksSubject] = useState('');
  const [marksLoading, setMarksLoading] = useState(false);
  const [classMarks, setClassMarks] = useState([]);
  const [examType, setExamType] = useState('INTERNAL');
  const [viewMarksSubject, setViewMarksSubject] = useState('');
  const [viewMarks, setViewMarks] = useState([]);

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [notifForm, setNotifForm] = useState({ title: '', message: '', subject_id: '', target: 'subject', programme_id: '', target_semester: '' });
  const [notifFile, setNotifFile] = useState(null);
  const [notifSending, setNotifSending] = useState(false);
  const notifFileRef = useRef();

  useEffect(() => { fetchSubjects(); fetchAllSubjects(); fetchProgrammes(); }, []);

  const [popup, setPopup] = useState(null);
  const showMsg = (text, type = 'success') => { setMsg(text); setMsgType(type); setPopup({text,type}); setTimeout(()=>{setMsg('');setPopup(null);},4000); };

  const fetchSubjects = async () => {
    try {
      const r = await API.get(`/subjects/teacher/${teacher.teacher_id}`);
      setSubjects(r.data);
    } catch(e) { showMsg('Failed to load subjects', 'error'); }
  };

  const fetchAllSubjects = async () => {
    try {
      const r = await API.get('/subjects');
      setAllSubjects(r.data);
    } catch(e) {}
  };

  const fetchProgrammes = async () => {
    try {
      const r = await API.get('/programmes');
      setProgrammes(r.data);
    } catch(e) {}
  };

  const handleAddAssignment = async () => {
    if (!addForm.subject_id) { showMsg('Please select a subject', 'error'); return; }
    if (!addForm.section) { showMsg('Please enter a section', 'error'); return; }
    try {
      await API.post(`/subjects/${addForm.subject_id}/teachers`, {
        teacher_id: teacher.teacher_id,
        section: addForm.section,
        programme_id: addForm.programme_id || null,
        class_name: addForm.class_name || null
      });
      showMsg('Subject assigned successfully!');
      setShowAddForm(false);
      setAddForm({ subject_id: '', section: 'A', programme_id: '', class_name: '' });
      fetchSubjects();
    } catch(e) { showMsg(e.response?.data?.error || 'Failed to assign', 'error'); }
  };

  const handleRemoveAssignment = async (assignment_id) => {
    if (!window.confirm('Remove this assignment?')) return;
    try {
      await API.delete(`/subjects/assignments/${assignment_id}`);
      showMsg('Assignment removed');
      fetchSubjects();
    } catch(e) { showMsg('Failed to remove', 'error'); }
  };

  const loadAttStudents = async () => {
    if (!attSubject) return;
    setAttLoading(true);
    try {
      const r = await API.get(`/enrollment/students/${attSubject}`);
      const existing = await API.get(`/attendance/subject/${attSubject}/date/${attDate}`).catch(() => ({ data: [] }));
      const existingMap = {};
      existing.data.forEach(a => { existingMap[a.student_id] = a.status; });
      setAttStudents(r.data.map(s => ({ ...s, status: existingMap[s.student_id] || 'PRESENT' })));
    } catch(e) { showMsg('Failed to load students', 'error'); }
    setAttLoading(false);
  };

  const handleAttendanceChange = (student_id, status) => {
    setAttStudents(prev => prev.map(s => s.student_id === student_id ? { ...s, status } : s));
  };

  const submitAttendance = async () => {
    try {
      await API.post('/attendance/bulk', { subject_id: attSubject, date: attDate, records: attStudents.map(s => ({ student_id: s.student_id, status: s.status })) });
      showMsg('Attendance saved!');
    } catch(e) { showMsg(e.response?.data?.error || 'Failed to save', 'error'); }
  };

  const loadClassMarks = async () => {
    if (!marksSubject) return;
    setMarksLoading(true);
    try {
      const [studRes, marksRes] = await Promise.all([
        API.get(`/enrollment/students/${marksSubject}`),
        API.get(`/marks/subject/${marksSubject}`)
      ]);
      const existingMap = {};
      marksRes.data.filter(m => m.exam_type === examType).forEach(m => { existingMap[m.student_id] = m.marks_obtained; });
      setClassMarks(studRes.data.map(s => ({ ...s, marks: existingMap[s.student_id] ?? '' })));
    } catch(e) { showMsg('Failed to load', 'error'); }
    setMarksLoading(false);
  };

  const getMaxMarks = (type, sub) => {
    if (type === 'INTERNAL') return sub?.internal_marks || 30;
    if (type === 'ASSIGNMENT') return 10;
    if (type === 'PRACTICAL_INTERNAL') return 20;
    return 30;
  };

  const submitMarks = async () => {
    const toSave = classMarks.filter(s => s.marks !== '' && s.marks !== null && s.marks !== undefined);
    if (!toSave.length) { showMsg('No marks to save', 'error'); return; }
    try {
      const sub = allSubjects.find(s => String(s.subject_id) === String(marksSubject));
      await API.post('/marks/bulk', {
        subject_id: marksSubject,
        exam_type: examType,
        max_marks: getMaxMarks(examType, sub),
        semester: sub?.semester || 1,
        entries: toSave.map(s => ({ student_id: s.student_id, marks_obtained: Number(s.marks) }))
      });
      showMsg(`✅ Marks saved for ${toSave.length} students!`);
      loadClassMarks();
    } catch(e) { showMsg(e.response?.data?.error || 'Failed', 'error'); }
  };

  const loadViewMarks = async () => {
    if (!viewMarksSubject) return;
    try {
      const r = await API.get(`/marks/subject/${viewMarksSubject}`);
      setViewMarks(r.data);
    } catch(e) { showMsg('Failed to load marks', 'error'); }
  };

  // Notifications
  const NOTIF_API_BASE = SERVER_BASE;

  const fetchNotifications = async () => {
    try { const r = await API.get('/notifications/teacher/my'); setNotifications(r.data); }
    catch(e) {}
  };

  const sendNotification = async () => {
    if (!notifForm.title.trim() || !notifForm.message.trim()) { showMsg('Title and message are required', 'error'); return; }
    if (notifForm.target === 'subject' && !notifForm.subject_id) { showMsg('Please select a subject', 'error'); return; }
    if (notifForm.target === 'class' && (!notifForm.programme_id || !notifForm.target_semester)) {
      showMsg('Select programme and semester for class-wise notice', 'error'); return;
    }
    setNotifSending(true);
    try {
      const fd = new FormData();
      fd.append('title', notifForm.title);
      fd.append('message', notifForm.message);
      fd.append('target', notifForm.target);
      if (notifForm.target === 'subject') fd.append('subject_id', notifForm.subject_id);
      if (notifForm.target === 'class') {
        fd.append('programme_id', notifForm.programme_id);
        fd.append('target_semester', notifForm.target_semester);
      }
      if (notifFile) fd.append('attachment', notifFile);
      await API.post('/notifications', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      showMsg('Notice sent to students!');
      setNotifForm({ title: '', message: '', subject_id: '', target: 'subject', programme_id: '', target_semester: '' });
      setNotifFile(null);
      if (notifFileRef.current) notifFileRef.current.value = '';
      fetchNotifications();
    } catch (e) { showMsg(e.response?.data?.error || 'Failed to send', 'error'); }
    setNotifSending(false);
  };

  const deleteNotification = async (id) => {
    if (!window.confirm('Delete this notice?')) return;
    try {
      await API.delete(`/notifications/${id}`);
      showMsg('Notice deleted');
      fetchNotifications();
    } catch (e) { showMsg('Failed to delete', 'error'); }
  };

  // CSV export helper
  const downloadCSV = (filename, headers, rows) => {
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [...(headers ? [headers.map(escape).join(',')] : []), ...rows.map(r => r.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportAttendance = () => {
    if (!attStudents.length) { showMsg('No attendance data to export', 'error'); return; }
    const sub = subjects.find(s => String(s.subject_id) === String(attSubject));
    const className = sub ? `${sub.subject_code} — ${sub.subject_name} (Sec ${sub.section})` : '';
    const rows = [
      ['Class', className, ''],
      ['Date', attDate, ''],
      ['Roll No', 'Student Name', 'Status'],
      ...attStudents.map(s => [s.roll_no, s.name, s.status])
    ];
    downloadCSV(`attendance_${sub?.subject_code || attSubject}_${attDate}.csv`, null, rows);
    showMsg(`Exported attendance for ${attStudents.length} students`);
  };

  const exportMarks = () => {
    if (!viewMarks.length) { showMsg('No marks data to export', 'error'); return; }
    const sub = subjects.find(s => String(s.subject_id) === String(viewMarksSubject));
    const studentMap = {};
    viewMarks.forEach(m => {
      if (!studentMap[m.student_id]) studentMap[m.student_id] = { name: m.name, roll_no: m.roll_no, marks: {} };
      studentMap[m.student_id].marks[m.exam_type] = { obtained: m.marks_obtained, max: m.max_marks };
    });
    const className = sub ? `${sub.subject_code} — ${sub.subject_name} (Sec ${sub.section})` : '';
    const titleRow = ['Class', className, '', ''];
    const headers = ['Roll No', 'Name', 'Internal', 'Out of'];
    const rows = [
      titleRow,
      headers,
      ...Object.values(studentMap).map(stu => [
        stu.roll_no,
        stu.name,
        stu.marks.INTERNAL ? stu.marks.INTERNAL.obtained : '',
        stu.marks.INTERNAL ? stu.marks.INTERNAL.max : ''
      ])
    ];
    downloadCSV(`marks_${sub?.subject_code || viewMarksSubject}.csv`, null, rows);
    showMsg(`Exported marks for ${Object.keys(studentMap).length} students`);
  };

  // Group assignments by subject
  const groupedSubjects = subjects.reduce((acc, s) => {
    const key = s.subject_id;
    if (!acc[key]) acc[key] = { ...s, assignments: [] };
    acc[key].assignments.push({ assignment_id: s.assignment_id, section: s.section, programme_id: s.programme_id, programme_name: s.programme_name, class_name: s.class_name });
    return acc;
  }, {});

  return (
    <div style={st.container}>
      {popup && (
        <div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,pointerEvents:'none'}}>
          <div style={{background:popup.type==='error'?'#e53e3e':popup.type==='warning'?'#ed8936':'#38a169',color:'#fff',padding:'1.25rem 2rem',borderRadius:'14px',boxShadow:'0 8px 32px rgba(0,0,0,0.25)',fontSize:'1rem',fontWeight:'700',maxWidth:'420px',textAlign:'center',animation:'popupFade 0.3s ease'}}>
            {popup.text}
          </div>
        </div>
      )}
      <style>{'@keyframes popupFade { from { opacity:0; transform:scale(0.85); } to { opacity:1; transform:scale(1); } }'}</style>
      <nav style={st.nav}>
        <h2 style={st.navTitle}>🎓 College ERP — Teacher</h2>
        <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
          <span style={{ color:'#a0aec0' }}>👨‍🏫 {teacher.name}</span>
          <button style={st.logoutBtn} onClick={onLogout}>Logout</button>
        </div>
      </nav>

      <div style={st.tabs}>
        {['subjects','attendance','marks','notices'].map(tab => (
          <button key={tab} style={{ ...st.tab, ...(activeTab===tab?st.activeTab:{}) }} onClick={() => { setActiveTab(tab); if (tab==='notices') fetchNotifications(); }}>
            {tab==='subjects'?'📚 My Subjects':tab==='attendance'?'📅 Attendance':tab==='marks'?'📊 Marks':'🔔 Notices'}
          </button>
        ))}
      </div>

      {msg && <div style={{ ...st.msg, background: msgType==='error'?'#fff5f5':'#f0fff4', color: msgType==='error'?'#c53030':'#276749' }}>{msg}</div>}

      <div style={st.content}>

        {/* SUBJECTS TAB */}
        {activeTab === 'subjects' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <div>
                <h2 style={{ margin:0 }}>📚 My Subject Assignments</h2>
                <p style={{ color:'#718096', margin:'0.25rem 0 0' }}>{Object.keys(groupedSubjects).length} subjects · {subjects.length} total assignments</p>
              </div>
              <button style={st.addBtn} onClick={() => setShowAddForm(!showAddForm)}>
                {showAddForm ? '✕ Cancel' : '+ Add Assignment'}
              </button>
            </div>

            {/* ADD FORM */}
            {showAddForm && (
              <div style={st.addForm}>
                <h4 style={{ margin:'0 0 1rem', color:'#2d3748' }}>➕ Add New Subject Assignment</h4>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'12px', marginBottom:'12px' }}>
                  <div>
                    <label style={st.label}>Subject *</label>
                    <select style={st.select} value={addForm.subject_id} onChange={e => setAddForm(p => ({...p, subject_id: e.target.value}))}>
                      <option value="">Select subject...</option>
                      {allSubjects.map(s => (
                        <option key={s.subject_id} value={s.subject_id}>
                          {s.subject_code} — {s.subject_name.substring(0,30)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={st.label}>Section *</label>
                    <input style={st.input} placeholder="e.g. A, B, C" value={addForm.section} onChange={e => setAddForm(p => ({...p, section: e.target.value}))} />
                  </div>
                  <div>
                    <label style={st.label}>Programme</label>
                    <select style={st.select} value={addForm.programme_id} onChange={e => setAddForm(p => ({...p, programme_id: e.target.value}))}>
                      <option value="">All / Common</option>
                      {programmes.map(p => <option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={st.label}>Class Name</label>
                    <input style={st.input} placeholder="e.g. BCA-2026-A" value={addForm.class_name} onChange={e => setAddForm(p => ({...p, class_name: e.target.value}))} />
                  </div>
                </div>
                <button style={st.saveBtn} onClick={handleAddAssignment}>✅ Add Assignment</button>
              </div>
            )}

            {/* SUBJECTS LIST */}
            {Object.keys(groupedSubjects).length === 0 ? (
              <div style={st.empty}>No subjects assigned yet. Click "+ Add Assignment" to get started.</div>
            ) : (
              Object.values(groupedSubjects).map(sub => (
                <div key={sub.subject_id} style={st.subjectCard}>
                  <div style={st.subjectHeader}>
                    <div>
                      <span style={st.subCode}>{sub.subject_code}</span>
                      <span style={st.subName}>{sub.subject_name}</span>
                      <span style={{ ...st.catBadge, background: sub.category==='MAJOR'?'#4c51bf':'#057a55' }}>{sub.category}</span>
                    </div>
                    <div style={{ fontSize:'13px', color:'#718096' }}>Sem {sub.semester} · {sub.credits} credits</div>
                  </div>
                  <div style={{ padding:'12px 16px', display:'flex', gap:'8px', flexWrap:'wrap' }}>
                    {sub.assignments.map((a, i) => (
                      <div key={i} style={st.assignBadge}>
                        <span style={{ fontWeight:600 }}>Section {a.section}</span>
                        {a.programme_name && <span style={{ color:'#4c51bf', marginLeft:'6px' }}>· {a.programme_name}</span>}
                        {a.class_name && <span style={{ color:'#718096', marginLeft:'6px' }}>· {a.class_name}</span>}
                        <button style={st.removeBtn} onClick={() => handleRemoveAssignment(a.assignment_id)}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ATTENDANCE TAB */}
        {activeTab === 'attendance' && (
          <div style={st.card}>
            <h3 style={st.cardTitle}>📅 Mark Attendance</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:'12px', marginBottom:'1rem', alignItems:'end' }}>
              <div>
                <label style={st.label}>Subject</label>
                <select style={st.select} value={attSubject} onChange={e => setAttSubject(e.target.value)}>
                  <option value="">Select subject...</option>
                  {subjects.map(s => <option key={s.assignment_id} value={s.subject_id}>{s.subject_code} — {s.subject_name} (Sec {s.section})</option>)}
                </select>
              </div>
              <div>
                <label style={st.label}>Date</label>
                <input type="date" style={st.input} value={attDate} onChange={e => setAttDate(e.target.value)} />
              </div>
              <button style={st.loadBtn} onClick={loadAttStudents}>Load Students</button>
            </div>

            {attLoading ? <p>Loading...</p> : attStudents.length > 0 && (
              <div>
                <table style={st.table}>
                  <thead><tr>
                    <th style={st.th}>Roll No</th><th style={st.th}>Name</th><th style={st.th}>Status</th>
                  </tr></thead>
                  <tbody>{attStudents.map(s => (
                    <tr key={s.student_id}>
                      <td style={st.td}>{s.roll_no}</td>
                      <td style={st.td}>{s.name}</td>
                      <td style={st.td}>
                        {['PRESENT','ABSENT','LEAVE'].map(status => (
                          <label key={status} style={{ marginRight:'12px', cursor:'pointer' }}>
                            <input type="radio" name={`att_${s.student_id}`} value={status}
                              checked={s.status===status} onChange={() => handleAttendanceChange(s.student_id, status)} />
                            <span style={{ marginLeft:'4px', color: status==='PRESENT'?'#276749':status==='ABSENT'?'#c53030':'#92400e' }}>{status}</span>
                          </label>
                        ))}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
                <div style={{ display:'flex', gap:'12px', marginTop:'1rem' }}>
                  <button style={st.saveBtn} onClick={submitAttendance}>💾 Save Attendance</button>
                  <button style={{ ...st.saveBtn, background:'#2b6cb0' }} onClick={exportAttendance}>📥 Export CSV</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MARKS TAB */}
        {activeTab === 'marks' && (
          <div>
            {/* Enter Marks */}
            <div style={st.card}>
              <h3 style={st.cardTitle}>✏️ Enter Marks</h3>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:'12px', marginBottom:'1rem', alignItems:'end'}}>
                <div>
                  <label style={st.label}>Subject</label>
                  <select style={st.select} value={marksSubject} onChange={e=>setMarksSubject(e.target.value)}>
                    <option value="">Select subject...</option>
                    {subjects.map(s=><option key={s.assignment_id} value={s.subject_id}>{s.subject_code} — {s.subject_name} (Sec {s.section})</option>)}
                  </select>
                </div>
                <div>
                  <label style={st.label}>Exam Type</label>
                  <select style={st.select} value={examType} onChange={e=>setExamType(e.target.value)}>
                    <option value="INTERNAL">📝 Internal Exam</option>
                    <option value="ASSIGNMENT">📋 Assignment</option>
                    <option value="PRACTICAL_INTERNAL">🔬 Practical Internal</option>
                  </select>
                </div>
                <button style={st.loadBtn} onClick={loadClassMarks} disabled={marksLoading}>
                  {marksLoading ? '⏳' : '🔄 Load'}
                </button>
              </div>

              {/* Max marks info */}
              {marksSubject && (
                <div style={{background:'#ebf8ff',borderRadius:'8px',padding:'0.6rem 1rem',marginBottom:'1rem',fontSize:'0.85rem',color:'#2b6cb0',fontWeight:'600'}}>
                  ℹ️ Max Marks for {examType==='INTERNAL'?'Internal Exam':examType==='ASSIGNMENT'?'Assignment':examType==='PRACTICAL_INTERNAL'?'Practical Internal':'External Exam'}:
                  <strong style={{marginLeft:'0.4rem'}}>
                    {examType==='INTERNAL' ? (allSubjects.find(s=>String(s.subject_id)===String(marksSubject))?.internal_marks||30)
                     : examType==='ASSIGNMENT' ? 10
                     : examType==='PRACTICAL_INTERNAL' ? 20
                     : (allSubjects.find(s=>String(s.subject_id)===String(marksSubject))?.end_term_marks||70)}
                  </strong>
                  {['INTERNAL','ASSIGNMENT','PRACTICAL_INTERNAL'].includes(examType)
                    ? <span style={{marginLeft:'0.75rem',color:'#276749'}}>✅ Visible to students</span>
                    : <span style={{marginLeft:'0.75rem',color:'#c53030'}}>🔒 Hidden from students</span>}
                </div>
              )}

              {classMarks.length > 0 && (
                <div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
                    <span style={{fontSize:'0.85rem',color:'#718096',fontWeight:'600'}}>{classMarks.length} students loaded</span>
                    <button style={{...st.saveBtn,margin:0,padding:'0.5rem 1.25rem'}} onClick={submitMarks}>💾 Save All Marks</button>
                  </div>
                  <table style={st.table}>
                    <thead>
                      <tr>
                        <th style={st.th}>Roll No</th>
                        <th style={st.th}>Student Name</th>
                        <th style={st.th}>Marks / {
                          examType==='INTERNAL' ? (allSubjects.find(s=>String(s.subject_id)===String(marksSubject))?.internal_marks||30)
                          : examType==='ASSIGNMENT' ? 10
                          : examType==='PRACTICAL_INTERNAL' ? 20
                          : 70
                        }</th>
                        <th style={st.th}>%</th>
                      </tr>
                    </thead>
                    <tbody>{classMarks.map((s,i) => {
                      const maxM = examType==='INTERNAL' ? (allSubjects.find(sub=>String(sub.subject_id)===String(marksSubject))?.internal_marks||30)
                                 : examType==='ASSIGNMENT' ? 10
                                 : examType==='PRACTICAL_INTERNAL' ? 20 : 70;
                      const pct = s.marks !== '' && s.marks !== null ? ((Number(s.marks)/maxM)*100).toFixed(1) : '—';
                      return (
                        <tr key={s.student_id} style={{background: s.marks!==''&&s.marks!==null ? '#f0fff4' : '#fff'}}>
                          <td style={{...st.td,fontFamily:'monospace',fontWeight:'700'}}>{s.roll_no}</td>
                          <td style={st.td}>{s.name}</td>
                          <td style={st.td}>
                            <input type="number" style={{...st.input, width:'90px'}} min="0" max={maxM}
                              value={s.marks} placeholder="—"
                              onChange={e => { const u=[...classMarks]; u[i].marks=e.target.value; setClassMarks(u); }} />
                          </td>
                          <td style={{...st.td, fontWeight:'600', color: pct>=60?'#276749':pct>=40?'#92400e':'#c53030'}}>
                            {pct !== '—' ? `${pct}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              )}
              {classMarks.length === 0 && marksSubject && !marksLoading && (
                <div style={{textAlign:'center',padding:'2rem',color:'#718096'}}>
                  ⚠️ No enrolled students found for this subject. Make sure students have completed enrollment.
                </div>
              )}
            </div>

            {/* View Marks */}
            <div style={st.card}>
              <h3 style={st.cardTitle}>📊 View Class Marks</h3>
              <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:'12px', marginBottom:'1rem', alignItems:'end'}}>
                <div>
                  <label style={st.label}>Subject</label>
                  <select style={st.select} value={viewMarksSubject} onChange={e=>setViewMarksSubject(e.target.value)}>
                    <option value="">Select subject...</option>
                    {subjects.map(s=><option key={s.assignment_id} value={s.subject_id}>{s.subject_code} — {s.subject_name}</option>)}
                  </select>
                </div>
                <div style={{ display:'flex', gap:'8px' }}>
                  <button style={st.loadBtn} onClick={loadViewMarks}>🔄 Load</button>
                  {viewMarks.length > 0 && <button style={{ ...st.loadBtn, background:'#2b6cb0' }} onClick={exportMarks}>📥 Export CSV</button>}
                </div>
              </div>

              {viewMarks.length > 0 && (() => {
                // Group by student
                const studentMap = {};
                viewMarks.forEach(m => {
                  if (!studentMap[m.student_id]) studentMap[m.student_id] = { name:m.name, roll_no:m.roll_no, marks:{} };
                  studentMap[m.student_id].marks[m.exam_type] = { obtained: m.marks_obtained, max: m.max_marks };
                });
                const examTypes = ['INTERNAL','ASSIGNMENT','PRACTICAL_INTERNAL'];
                const presentTypes = examTypes.filter(t => viewMarks.some(m => m.exam_type === t));
                return (
                  <table style={st.table}>
                    <thead>
                      <tr>
                        <th style={st.th}>Roll No</th>
                        <th style={st.th}>Student</th>
                        {presentTypes.map(t=>(
                          <th key={t} style={st.th}>
                            {t==='INTERNAL'?'Internal':t==='ASSIGNMENT'?'Assignment':t==='PRACTICAL_INTERNAL'?'Practical':t}
                          </th>
                        ))}
                        <th style={st.th}>Total %</th>
                      </tr>
                    </thead>
                    <tbody>{Object.values(studentMap).map((stu,i) => {
                      let totalObt = 0, totalMax = 0;
                      presentTypes.forEach(t => {
                        if (stu.marks[t]) { totalObt += Number(stu.marks[t].obtained); totalMax += Number(stu.marks[t].max); }
                      });
                      const totalPct = totalMax > 0 ? ((totalObt/totalMax)*100).toFixed(1) : '—';
                      return (
                        <tr key={i} style={{background: i%2===0?'#fff':'#f7fafc'}}>
                          <td style={{...st.td,fontFamily:'monospace',fontWeight:'700'}}>{stu.roll_no}</td>
                          <td style={st.td}>{stu.name}</td>
                          {presentTypes.map(t=>(
                            <td key={t} style={st.td}>
                              {stu.marks[t]
                                ? <span style={{fontWeight:'600'}}>{stu.marks[t].obtained}/{stu.marks[t].max}</span>
                                : <span style={{color:'#a0aec0'}}>—</span>}
                            </td>
                          ))}
                          <td style={{...st.td, fontWeight:'700', color: totalPct>=60?'#276749':totalPct>=40?'#92400e':'#c53030'}}>
                            {totalPct !== '—' ? `${totalPct}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        )}

        {/* NOTICES TAB */}
        {activeTab === 'notices' && (
          <div>
            {/* Send notice form */}
            <div style={st.card}>
              <h3 style={st.cardTitle}>📢 Send Notice to Students</h3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'0.75rem' }}>
                <div>
                  <label style={st.label}>Send To *</label>
                  <select style={st.select} value={notifForm.target}
                    onChange={e => setNotifForm(p => ({ ...p, target: e.target.value, subject_id: '', programme_id: '', target_semester: '' }))}>
                    <option value="subject">Subject-wise (Enrolled Students)</option>
                    <option value="class">Class-wise (Programme + Semester)</option>
                  </select>
                </div>
                <div>
                  <label style={st.label}>Title *</label>
                  <input style={st.input} placeholder="Notice title..." value={notifForm.title}
                    onChange={e => setNotifForm(p => ({ ...p, title: e.target.value }))} maxLength={200} />
                </div>
              </div>
              {notifForm.target === 'subject' && (
                <div style={{ marginBottom:'0.75rem' }}>
                  <label style={st.label}>Subject *</label>
                  <select style={st.select} value={notifForm.subject_id} onChange={e => setNotifForm(p => ({ ...p, subject_id: e.target.value }))}>
                    <option value="">Select subject...</option>
                    {subjects.map(s => (
                      <option key={s.assignment_id} value={s.subject_id}>
                        {s.subject_code} — {s.subject_name} (Sec {s.section})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {notifForm.target === 'class' && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'0.75rem' }}>
                  <div>
                    <label style={st.label}>Programme *</label>
                    <select style={st.select} value={notifForm.programme_id} onChange={e => setNotifForm(p => ({ ...p, programme_id: e.target.value }))}>
                      <option value="">Select programme...</option>
                      {programmes.map(p => <option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={st.label}>Semester *</label>
                    <select style={st.select} value={notifForm.target_semester} onChange={e => setNotifForm(p => ({ ...p, target_semester: e.target.value }))}>
                      <option value="">Select semester...</option>
                      {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div style={{ marginBottom:'0.75rem' }}>
                <label style={st.label}>Message *</label>
                <textarea style={{ ...st.input, minHeight:'100px', resize:'vertical', fontFamily:'inherit' }}
                  placeholder="Type your notice here..."
                  value={notifForm.message}
                  onChange={e => setNotifForm(p => ({ ...p, message: e.target.value }))}
                  maxLength={5000} />
                <span style={{ fontSize:'0.75rem', color:'#a0aec0' }}>{notifForm.message.length}/5000</span>
              </div>
              <div style={{ marginBottom:'1rem' }}>
                <label style={st.label}>Attachment (Image or PDF, max 5MB)</label>
                <input type="file" ref={notifFileRef}
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                  onChange={e => setNotifFile(e.target.files[0] || null)}
                  style={{ fontSize:'0.9rem' }} />
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
              <button style={{ ...st.saveBtn, opacity: notifSending ? 0.6 : 1 }}
                onClick={sendNotification} disabled={notifSending}>
                {notifSending ? '⏳ Sending...' : '🔔 Send Notice'}
              </button>
            </div>

            {/* Sent notices list */}
            <h3 style={{ color:'#2d3748' }}>My Sent Notices ({notifications.length})</h3>
            {notifications.length === 0 ? (
              <div style={{ background:'#fff', padding:'3rem', textAlign:'center', borderRadius:'12px', color:'#718096' }}>
                No notices sent yet.
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.notification_id} style={{ background:'#fff', borderRadius:'10px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', marginBottom:'1rem', overflow:'hidden' }}>
                  <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                        <h4 style={{ margin:0, color:'#2d3748' }}>{n.title}</h4>
                        <span style={{ fontSize:'0.7rem', fontWeight:'600', padding:'2px 8px', borderRadius:'999px', color:'#fff',
                          background: n.target === 'subject' ? '#38a169' : '#d97706' }}>
                          {n.target === 'subject' ? 'Subject' : 'Class'}
                        </span>
                      </div>
                      <span style={{ fontSize:'0.8rem', color:'#a0aec0' }}>
                        {n.target === 'subject'
                          ? `${n.subject_code} — ${n.subject_name}`
                          : `${n.programme_name} — Sem ${n.target_semester}`}
                        {' · '}{new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                    <button style={{ background:'#e53e3e', color:'#fff', border:'none', padding:'0.3rem 0.75rem', borderRadius:'4px', cursor:'pointer' }}
                      onClick={() => deleteNotification(n.notification_id)}>Delete</button>
                  </div>
                  <div style={{ padding:'1rem 1.25rem' }}>
                    <p style={{ margin:0, color:'#4a5568', whiteSpace:'pre-wrap', lineHeight:'1.6' }}>{n.message}</p>
                    {n.attachment_url && (
                      <div style={{ marginTop:'0.75rem', padding:'0.75rem', background:'#f7fafc', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
                        {n.attachment_type === 'image' ? (
                          <div>
                            <img src={`${NOTIF_API_BASE}${n.attachment_url}`} alt="attachment"
                              style={{ maxWidth:'100%', maxHeight:'300px', borderRadius:'6px', cursor:'pointer' }}
                              onClick={() => window.open(`${NOTIF_API_BASE}${n.attachment_url}`, '_blank')} />
                            <div style={{ fontSize:'0.8rem', color:'#718096', marginTop:'4px' }}>{n.attachment_name}</div>
                          </div>
                        ) : (
                          <a href={`${NOTIF_API_BASE}${n.attachment_url}`} target="_blank" rel="noopener noreferrer"
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
    </div>
  );
}

const st = {
  container: { minHeight:'100vh', background:'#f0f4f8' },
  nav: { background:'#2d3748', padding:'1rem 2rem', display:'flex', justifyContent:'space-between', alignItems:'center' },
  navTitle: { color:'#fff', margin:0, fontSize:'1.1rem' },
  logoutBtn: { background:'#e53e3e', color:'#fff', border:'none', padding:'0.5rem 1rem', borderRadius:'6px', cursor:'pointer' },
  tabs: { display:'flex', background:'#fff', borderBottom:'2px solid #e2e8f0', padding:'0 2rem' },
  tab: { padding:'1rem 1.5rem', border:'none', background:'none', cursor:'pointer', fontSize:'0.95rem', color:'#718096' },
  activeTab: { color:'#4c51bf', borderBottom:'2px solid #4c51bf', fontWeight:'600' },
  msg: { padding:'0.75rem 2rem', fontWeight:'600' },
  content: { padding:'2rem' },
  addBtn: { padding:'0.65rem 1.25rem', background:'#4c51bf', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'600' },
  addForm: { background:'#fff', border:'2px solid #bee3f8', borderRadius:'12px', padding:'1.5rem', marginBottom:'1.5rem' },
  label: { display:'block', fontSize:'12px', fontWeight:'600', color:'#4a5568', marginBottom:'4px' },
  select: { width:'100%', padding:'8px 12px', border:'1.5px solid #e2e8f0', borderRadius:'6px', fontSize:'14px', outline:'none' },
  input: { width:'100%', padding:'8px 12px', border:'1.5px solid #e2e8f0', borderRadius:'6px', fontSize:'14px', outline:'none', boxSizing:'border-box' },
  saveBtn: { padding:'0.65rem 1.5rem', background:'#38a169', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'600', marginTop:'1rem' },
  loadBtn: { padding:'8px 16px', background:'#2980b9', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'600' },
  subjectCard: { background:'#fff', borderRadius:'10px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', marginBottom:'1rem', overflow:'hidden' },
  subjectHeader: { padding:'12px 16px', background:'#f7fafc', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #e2e8f0' },
  subCode: { fontFamily:'monospace', fontWeight:'700', color:'#1e3a5f', marginRight:'8px' },
  subName: { color:'#2d3748', marginRight:'8px' },
  catBadge: { display:'inline-block', padding:'2px 8px', borderRadius:'4px', color:'#fff', fontSize:'11px', fontWeight:'600' },
  assignBadge: { display:'flex', alignItems:'center', gap:'4px', background:'#ebf8ff', border:'1px solid #90cdf4', borderRadius:'20px', padding:'4px 12px', fontSize:'13px' },
  removeBtn: { background:'none', border:'none', color:'#e53e3e', cursor:'pointer', marginLeft:'4px', fontWeight:'700', fontSize:'14px' },
  empty: { background:'#fff', padding:'3rem', textAlign:'center', borderRadius:'12px', color:'#718096' },
  card: { background:'#fff', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', marginBottom:'1.5rem' },
  cardTitle: { margin:'0 0 1rem', color:'#2d3748', borderBottom:'2px solid #e2e8f0', paddingBottom:'0.5rem' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:'14px' },
  th: { background:'#2d3748', color:'#fff', padding:'0.65rem 1rem', textAlign:'left' },
  td: { padding:'0.65rem 1rem', borderBottom:'1px solid #e2e8f0' },
};
