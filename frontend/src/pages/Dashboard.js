import React, { useState, useEffect } from 'react';
import API, { SERVER_BASE } from '../api';
import StudentEnrollment from './StudentEnrollment';

export default function Dashboard({ student, onLogout, onStudentUpdate }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [attendance, setAttendance] = useState([]);
  const [fees, setFees] = useState([]);
  const [marks, setMarks] = useState([]);
  const [popup, setPopup] = useState(null);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success');
  const [profileForm, setProfileForm] = useState({});
  const [profileMsg, setProfileMsg] = useState('');

  const showMsg = (text, type = 'success') => {
    setMsg(text); setMsgType(type);
    setPopup({ text, type });
    setTimeout(() => { setMsg(''); setPopup(null); }, 4000);
  };
  const [enrollmentSummary, setEnrollmentSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (activeTab === 'attendance') fetchAttendance();
    if (activeTab === 'subjects') fetchEnrollmentSummary();
    if (activeTab === 'fees') fetchFees();
    if (activeTab === 'marks') fetchMarks();
    if (activeTab === 'notifications') fetchNotifications();
  }, [activeTab]);

  useEffect(() => { fetchEnrollmentSummary(); }, []);

  const fetchMarks = async () => {
    try { const r = await API.get(`/marks/student/${student.student_id}`); setMarks(r.data); }
    catch(e) {}
  };

  const fetchNotifications = async () => {
    try { const r = await API.get('/notifications/student/all'); setNotifications(r.data); }
    catch(e) {}
  };

  const NOTIF_API_BASE = SERVER_BASE;

  const printFeeReceipt = (fee) => {
    const html = `
      <html><head><title>Fee Receipt</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; margin: 40px; color: #2d3748; }
        .header { text-align: center; border-bottom: 3px double #2d3748; padding-bottom: 16px; margin-bottom: 20px; }
        .header h1 { margin: 0 0 4px; font-size: 22px; } .header p { margin: 2px 0; color: #555; font-size: 12px; }
        .receipt-no { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 12px; color: #555; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        td { padding: 8px 12px; border: 1px solid #e2e8f0; }
        td:first-child { font-weight: 600; background: #f7fafc; width: 35%; }
        .amount-box { background: #f0fff4; border: 2px solid #48bb78; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px; }
        .amount-box h2 { margin: 0; font-size: 28px; color: #276749; }
        .amount-box p { margin: 4px 0 0; color: #555; font-size: 12px; }
        .stamp { display: inline-block; border: 2px solid #48bb78; color: #48bb78; padding: 4px 16px; border-radius: 4px; font-weight: 700; font-size: 14px; transform: rotate(-5deg); margin-top: 8px; }
        .footer { text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #718096; }
        @media print { body { margin: 20px; } }
      </style></head>
      <body>
        <div class="header"><h1>🎓 College ERP</h1><p>Fee Payment Receipt</p></div>
        <div class="receipt-no">
          <span><strong>Receipt No:</strong> ${fee.transaction_ref || 'TXN' + fee.fee_id}</span>
          <span><strong>Date:</strong> ${fee.paid_date ? new Date(fee.paid_date).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}) : new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</span>
        </div>
        <table>
          <tr><td>Student Name</td><td>${student?.name||'—'}</td></tr>
          <tr><td>Roll No</td><td>${student?.roll_no||'—'}</td></tr>
          <tr><td>Fee Type</td><td>${fee.fee_type}</td></tr>
          <tr><td>Due Date</td><td>${fee.due_date ? new Date(fee.due_date).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}) : '—'}</td></tr>
          <tr><td>Payment Date</td><td>${fee.paid_date ? new Date(fee.paid_date).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}) : '—'}</td></tr>
          <tr><td>Status</td><td><strong style="color:#276749">PAID</strong></td></tr>
        </table>
        <div class="amount-box">
          <h2>₹${Number(fee.amount).toLocaleString('en-IN')}</h2>
          <p>Amount Paid</p>
          <div class="stamp">✓ PAID</div>
        </div>
        <div class="footer">
          <p>This is a computer-generated receipt and does not require a signature.</p>
          <p>Generated on ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</p>
        </div>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 500); }
  };

  const fetchFees = async () => {
    try { const r = await API.get(`/fees/student/${student.student_id}`); setFees(r.data); }
    catch(e) {}
  };

  const fetchAttendance = async () => {
    setLoading(true);
    try { const r = await API.get(`/attendance/student/${student.student_id}`); setAttendance(r.data); }
    catch(e){} finally { setLoading(false); }
  };

  const fetchEnrollmentSummary = async () => {
    try {
      const r = await API.get(`/enrollment/status/${student.student_id}`);
      setEnrollmentSummary(r.data);
    } catch(e){}
  };

  const getStats = () => {
    const subjectMap = {};
    attendance.forEach(a => {
      if (!subjectMap[a.subject_name]) subjectMap[a.subject_name] = { present:0, absent:0, late:0, total:0 };
      subjectMap[a.subject_name].total++;
      if (a.status==='PRESENT') subjectMap[a.subject_name].present++;
      else if (a.status==='ABSENT') subjectMap[a.subject_name].absent++;
      else if (a.status==='LEAVE') subjectMap[a.subject_name].late++;
    });
    return subjectMap;
  };

  const stats = getStats();
  const totalClasses = attendance.length;
  const totalPresent = attendance.filter(a => a.status==='PRESENT').length;
  const overallPct = totalClasses ? ((totalPresent/totalClasses)*100).toFixed(1) : 0;

  // Only use live API data — never trust stale localStorage student object
  const isEnrollmentSubmitted = enrollmentSummary !== null
    && enrollmentSummary.some(e => e.is_draft === 0 && e.status !== 'PENDING' && !e.admin_modified);
  const isProfileIncomplete = !student?.email || !student?.phone;
  const missingFields = [!student?.email && 'email', !student?.phone && 'mobile number'].filter(Boolean);
  const acceptedSubjects = enrollmentSummary 
        ? enrollmentSummary.filter(e => e.status === 'ACCEPTED')
    : [];
  const hasDraft = enrollmentSummary && enrollmentSummary.some(e => e.is_draft === 1);
  const adminModified = enrollmentSummary && enrollmentSummary.some(e => e.admin_modified === 1);
  const adminNote = enrollmentSummary && enrollmentSummary.find(e => e.admin_note)?.admin_note;

  if (showEnrollment) {
    return <StudentEnrollment student={student} onBack={() => { setShowEnrollment(false); fetchEnrollmentSummary(); }} />;
  }

  // Detect PG — level_id may come as string or number depending on session age
  const PG_ONLY_CATEGORIES = new Set(['ELECTIVE','ELECTIVE_FINANCE','ELECTIVE_HR','ELECTIVE_MARKETING','OEC','SEMINAR','INTERNSHIP']);
  const isPG = Number(student.level_id) === 2
    || student.level_name === 'PG'
    || String(student.course || '').toUpperCase().startsWith('M.')
    || (enrollmentSummary && enrollmentSummary.some(e => PG_ONLY_CATEGORIES.has(e.category)));

  const categoryLabels = {
    // UG NEP 2020
    MAJOR:               'Discipline Specific Course (DSC)',
    MIC:                 'Minor Course / Vocational',
    MDC:                 'Multidisciplinary Course',
    SEC:                 'Skill Enhancement Course',
    VAC:                 'Value Added Course',
    AEC:                 'Ability Enhancement Course',
    // PG
    ELECTIVE:            'Discipline Elective Course',
    ELECTIVE_FINANCE:    'Discipline Elective — Finance',
    ELECTIVE_HR:         'Discipline Elective — Human Resource',
    ELECTIVE_MARKETING:  'Discipline Elective — Marketing',
    OEC:                 'Open Elective Course',
    SEMINAR:             'Seminar',
    INTERNSHIP:          'Internship',
  };
  const categoryColors = {
    // UG
    MAJOR:'#4c51bf', MIC:'#057a55', MDC:'#dd6b20',
    SEC:'#e53e3e', VAC:'#d69e2e', AEC:'#805ad5',
    // PG
    ELECTIVE:'#2b6cb0', ELECTIVE_FINANCE:'#276749',
    ELECTIVE_HR:'#702459', ELECTIVE_MARKETING:'#744210',
    OEC:'#1a365d', SEMINAR:'#553c9a', INTERNSHIP:'#234e52',
  };

  // Ordered display: UG order first, then PG, then any unknown
  const CATEGORY_ORDER = [
    'MAJOR','MIC','MDC','SEC','VAC','AEC',
    'ELECTIVE','ELECTIVE_FINANCE','ELECTIVE_HR','ELECTIVE_MARKETING',
    'OEC','SEMINAR','INTERNSHIP',
  ];

  const groupedAccepted = acceptedSubjects.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return (
    <div style={styles.container}>
      {popup && (
        <div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,pointerEvents:'none'}}>
          <div style={{background:popup.type==='error'?'#e53e3e':popup.type==='warning'?'#ed8936':'#38a169',color:'#fff',padding:'1.25rem 2rem',borderRadius:'14px',boxShadow:'0 8px 32px rgba(0,0,0,0.25)',fontSize:'1rem',fontWeight:'700',maxWidth:'420px',textAlign:'center',animation:'popupFade 0.3s ease'}}>
            {popup.text}
          </div>
        </div>
      )}
      <style>{'@keyframes popupFade { from { opacity:0; transform:scale(0.85); } to { opacity:1; transform:scale(1); } }'}</style>
      <nav style={styles.nav}>
        <h2 style={styles.navTitle}>🎓 College ERP</h2>
        <div style={styles.navRight}>
          <span style={styles.studentName}>👤 {student.name}</span>
          <button style={styles.logoutBtn} onClick={onLogout}>Logout</button>
        </div>
      </nav>

      <div style={styles.tabs}>
        {/* Profile completion banner */}
        {isProfileIncomplete && (
          <div style={{background:'#fffbeb',border:'2px solid #f6e05e',borderRadius:'10px',padding:'0.85rem 1.25rem',marginBottom:'1rem',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.5rem'}}>
            <div>
              <span style={{fontWeight:'700',color:'#92400e'}}>⚠️ Complete your profile</span>
              <span style={{color:'#92400e',fontSize:'0.85rem',marginLeft:'0.5rem'}}>Please add your {missingFields.join(' and ')}.</span>
            </div>
            <button onClick={()=>setActiveTab('profile')}
              style={{padding:'0.4rem 1rem',background:'#d97706',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontWeight:'600',fontSize:'0.85rem'}}>
              👤 Update Profile
            </button>
          </div>
        )}

        {['overview','subjects','attendance','fees','marks','notifications','profile'].map(tab => (
          <button key={tab} style={{...styles.tab, ...(activeTab===tab?styles.activeTab:{})}}
            onClick={() => setActiveTab(tab)}>
            {tab==='overview'?'🏠 Overview':tab==='subjects'?'📚 My Subjects':tab==='attendance'?'📅 Attendance':tab==='fees'?'💰 Fees':tab==='marks'?'📊 Marks':tab==='notifications'?'🔔 Notices':'👤 Profile'}
          </button>
        ))}
      </div>

      <div style={styles.content}>

        {activeTab === 'overview' && (
          <div>
            {adminModified && (
              <div style={styles.adminNotifBanner}>
                <div style={styles.adminNotifLeft}>
                  <span style={{fontSize:'1.8rem'}}>🔔</span>
                  <div>
                    <strong style={{fontSize:'1rem'}}>Your enrollment has been updated by Admin</strong>
                    {adminNote && <p style={{margin:'0.25rem 0 0',fontSize:'0.9rem',opacity:0.9}}>Note: {adminNote}</p>}
                  </div>
                </div>
                <button style={styles.adminNotifBtn} onClick={() => setActiveTab('subjects')}>
                  View Updated Subjects →
                </button>
              </div>
            )}
            <div style={styles.welcome}>
              <h1>Welcome, {student.name}! 👋</h1>
              <p style={styles.meta}>
                Roll No: <strong>{student.roll_no}</strong> &nbsp;|&nbsp;
                Course: <strong>{student.course}</strong> &nbsp;|&nbsp;
                Semester: <strong>{student.semester}</strong>
              </p>
            </div>
            <div style={styles.cards}>
              <div style={{...styles.card, background:'#4c51bf', position:'relative'}} onClick={() => setActiveTab('subjects')}>
                {adminModified && <span style={styles.notifDot}>!</span>}
                <h3>📚 My Subjects</h3>
                <p>{isEnrollmentSubmitted ? `✅ ${acceptedSubjects.length} subjects enrolled` : '⚠️ Enrollment pending'}</p>
                <p style={styles.cardArrow}>→ Click to view</p>
              </div>
              <div style={{...styles.card, background:'#48bb78'}} onClick={() => setActiveTab('attendance')}>
                <h3>📅 Attendance</h3>
                <p>Overall: {overallPct}%</p>
                <p style={styles.cardArrow}>→ Click to view</p>
              </div>
              <div style={{...styles.card, background:'#9f7aea'}} onClick={() => setActiveTab('marks')}>
                <h3>📊 Marks</h3>
                <p>Internal, Assignment & Practical</p>
                <p style={styles.cardArrow}>→ Click to view</p>
              </div>
              <div style={{...styles.card, background:'#dd6b20'}} onClick={() => setActiveTab('fees')}>
                <h3>💰 Fees</h3>
                <p>{fees.filter(f=>f.status!=='PAID').length > 0 ? `⚠️ ${fees.filter(f=>f.status!=='PAID').length} pending` : '✅ All paid'}</p>
                <p style={styles.cardArrow}>→ Click to view</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'subjects' && (
          <div>
            <div style={styles.subjectHeader}>
              <div>
                <h2 style={{margin:0}}>📚 My Subjects</h2>
                <p style={{color:'#718096', margin:'0.25rem 0 0'}}>Semester {student.semester}</p>
              </div>
              {!isEnrollmentSubmitted ? (
                <button style={styles.enrollBtn} onClick={() => setShowEnrollment(true)}>
                  📋 Go to Enrollment →
                </button>
              ) : (
                <div style={{...styles.submittedTag, background: adminModified?'#ebf8ff':'#c6f6d5', color: adminModified?'#2b6cb0':'#276749'}}>
                  {adminModified ? '✏️ Modified by Admin' : '✅ Enrollment Submitted'}
                </div>
              )}
            </div>

            {adminModified && (
              <div style={styles.adminSubjectBanner}>
                <span style={{fontSize:'1.4rem'}}>🔔</span>
                <div>
                  <strong>Your enrollment was updated by the Admin.</strong>
                  {adminNote && <span style={{marginLeft:'0.5rem',opacity:0.85}}>"{adminNote}"</span>}
                  <p style={{margin:'0.25rem 0 0',fontSize:'0.85rem',opacity:0.8}}>
                    The subjects below reflect your current approved enrollment.
                  </p>
                </div>
              </div>
            )}

            {!isEnrollmentSubmitted && (
              <div style={styles.enrollmentAlert}>
                <h3 style={{margin:'0 0 0.5rem', color:'#92400e'}}>⚠️ Enrollment Pending!</h3>
                <p style={{margin:0}}>You need to review and submit your subject enrollment.</p>
              </div>
            )}

            {isEnrollmentSubmitted && acceptedSubjects.length > 0 && (
              <div>
                <div style={styles.summaryCards}>
                  <div style={{...styles.summaryCard, background:'#f0fff4', border:'2px solid #9ae6b4'}}>
                    <p style={{...styles.summaryNum, color:'#276749'}}>{acceptedSubjects.length}</p>
                    <p style={styles.summaryLabel}>Enrolled Subjects</p>
                  </div>
                  <div style={{...styles.summaryCard, background:'#ebf8ff', border:'2px solid #90cdf4'}}>
                    <p style={styles.summaryNum}>{Object.keys(groupedAccepted).length}</p>
                    <p style={styles.summaryLabel}>Course Types</p>
                  </div>
                  <div style={{...styles.summaryCard, background:'#faf5ff', border:'2px solid #d6bcfa'}}>
                    <p style={{...styles.summaryNum, color:'#553c9a'}}>
                      {acceptedSubjects.reduce((sum, s) => sum + (s.credits || 0), 0)}
                    </p>
                    <p style={styles.summaryLabel}>Total Credits</p>
                  </div>
                </div>

                {[
                  ...CATEGORY_ORDER,
                  ...Object.keys(groupedAccepted).filter(c => !CATEGORY_ORDER.includes(c))
                ].filter(cat => groupedAccepted[cat]).map(category => (
                  <div key={category} style={styles.categoryBlock}>
                    <div style={{...styles.categoryHeader, background: categoryColors[category]||'#667eea'}}>
                      <span style={styles.catTitle}>{categoryLabels[category] || category}</span>
                      <span style={styles.catCount}>{groupedAccepted[category].length} subjects</span>
                    </div>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          {['Course Code','Paper Name','Discipline','Credits','Internal Marks',
                            (!isPG && category === 'MAJOR') ? 'Major?' : ''
                          ].filter(Boolean).map(h=>(
                            <th key={h} style={styles.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groupedAccepted[category].map(sub => (
                          <tr key={sub.enrollment_id} style={{background: sub.admin_modified ? '#fffbeb' : '#fff'}}>
                            <td style={{...styles.td, fontFamily:'monospace', fontWeight:'600', fontSize:'0.82rem'}}>
                              {sub.subject_code}
                              {sub.admin_modified ? <span style={styles.adminTag}>✏️</span> : ''}
                            </td>
                            <td style={styles.td}>{sub.subject_name}</td>
                            <td style={styles.td}>
                              {sub.discipline_name
                                ? <span style={styles.discBadge}>{sub.discipline_name}</span>
                                : <span style={{color:'#a0aec0'}}>-</span>}
                            </td>
                            <td style={{...styles.td, textAlign:'center'}}>{sub.credits}</td>
                            <td style={{...styles.td, textAlign:'center'}}>{sub.internal_marks}</td>
                            {!isPG && category === 'MAJOR' && (
                              <td style={{...styles.td, textAlign:'center'}}>
                                {sub.is_major ? <span style={{color:'#4c51bf', fontWeight:'700'}}>⭐ Major</span> : '-'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'attendance' && (
          <div>
            <div style={styles.summaryBox}>
              <h2 style={{margin:0, marginBottom:'1rem'}}>📅 My Attendance</h2>
              <div style={styles.summaryCards}>
                <div style={{...styles.summaryCard, background:'#ebf8ff', border:'2px solid #90cdf4'}}>
                  <p style={styles.summaryNum}>{totalClasses}</p>
                  <p style={styles.summaryLabel}>Total Classes</p>
                </div>
                <div style={{...styles.summaryCard, background:'#f0fff4', border:'2px solid #9ae6b4'}}>
                  <p style={styles.summaryNum}>{totalPresent}</p>
                  <p style={styles.summaryLabel}>Present</p>
                </div>
                <div style={{...styles.summaryCard, background:'#fff5f5', border:'2px solid #feb2b2'}}>
                  <p style={styles.summaryNum}>{totalClasses-totalPresent}</p>
                  <p style={styles.summaryLabel}>Absent/Late</p>
                </div>
                <div style={{...styles.summaryCard, background: overallPct>=75?'#f0fff4':'#fff5f5', border:`2px solid ${overallPct>=75?'#9ae6b4':'#feb2b2'}`}}>
                  <p style={{...styles.summaryNum, color: overallPct>=75?'#276749':'#c53030'}}>{overallPct}%</p>
                  <p style={styles.summaryLabel}>Overall %</p>
                </div>
              </div>
              {overallPct < 75 && totalClasses > 0 && <div style={styles.warningBanner}>⚠️ Your attendance is below 75%!</div>}
              {overallPct >= 75 && totalClasses > 0 && <div style={styles.goodBanner}>✅ Great! Your attendance is above 75%.</div>}
            </div>

            {Object.keys(stats).length > 0 && (
              <div style={styles.subjectStats}>
                <h3>Subject-wise Attendance</h3>
                <div style={styles.subjectGrid}>
                  {Object.entries(stats).map(([subject, data]) => {
                    const pct = ((data.present/data.total)*100).toFixed(1);
                    return (
                      <div key={subject} style={styles.subjectCard}>
                        <h4 style={styles.subjectName}>{subject}</h4>
                        <div style={styles.progressBar}>
                          <div style={{...styles.progressFill, width:`${pct}%`, background: pct>=75?'#48bb78':'#e53e3e'}} />
                        </div>
                        <div style={styles.subjectMeta}>
                          <span style={{color: pct>=75?'#276749':'#c53030', fontWeight:'700'}}>{pct}%</span>
                          <span style={{color:'#718096'}}>{data.present}/{data.total} classes</span>
                        </div>
                        <div style={styles.subjectBadges}>
                          <span style={{...styles.badge, background:'#48bb78'}}>P: {data.present}</span>
                          <span style={{...styles.badge, background:'#e53e3e'}}>A: {data.absent}</span>
                          {data.late>0 && <span style={{...styles.badge, background:'#ed8936'}}>L: {data.late}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <h3>Attendance Records</h3>
            {loading ? <p>Loading...</p> : attendance.length === 0 ? (
              <div style={styles.emptyState}>📭 No attendance records found.</div>
            ) : (
              <table style={styles.table}>
                <thead><tr>{['Date','Subject','Status'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>{attendance.map(a=>(
                  <tr key={a.attendance_id}>
                    <td style={styles.td}>{new Date(a.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</td>
                    <td style={styles.td}>{a.subject_name}</td>
                    <td style={styles.td}><span style={{...styles.badge, background: a.status==='PRESENT'?'#48bb78':a.status==='LEAVE'?'#ed8936':'#e53e3e'}}>{a.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
        {activeTab === 'marks' && (
          <div>
            <div style={{background:'#fff',borderRadius:'12px',padding:'1.5rem',marginBottom:'1.5rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
              <h2 style={{margin:'0 0 0.25rem'}}>📊 My Marks</h2>
              <p style={{margin:'0 0 1rem',color:'#718096',fontSize:'0.85rem'}}>Internal, Assignment and Practical Internal marks are shown here. External marks are released after results.</p>
              {marks.length === 0 ? (
                <div style={styles.emptyState}>📭 No marks available yet.</div>
              ) : (() => {
                // Group by subject
                const subjectMap = {};
                marks.forEach(m => {
                  if (!subjectMap[m.subject_id]) subjectMap[m.subject_id] = { name:m.subject_name, code:m.subject_code, category:m.category, marks:{} };
                  subjectMap[m.subject_id].marks[m.exam_type] = { obtained: m.marks_obtained, max: m.max_marks };
                });
                const examTypes = ['INTERNAL','ASSIGNMENT','PRACTICAL_INTERNAL'];
                const presentTypes = examTypes.filter(t => marks.some(m => m.exam_type === t));
                const getGrade = (pct) => pct>=90?{g:'O',c:'#276749'}:pct>=80?{g:'A+',c:'#2b6cb0'}:pct>=70?{g:'A',c:'#2b6cb0'}:pct>=60?{g:'B+',c:'#92400e'}:pct>=50?{g:'B',c:'#92400e'}:pct>=40?{g:'C',c:'#c53030'}:{g:'F',c:'#c53030'};
                return (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Course Code</th>
                        <th style={styles.th}>Subject</th>
                        {presentTypes.map(t=>(
                          <th key={t} style={styles.th}>
                            {t==='INTERNAL'?'Internal':t==='ASSIGNMENT'?'Assignment':'Practical'}
                          </th>
                        ))}
                        <th style={styles.th}>Total %</th>
                        <th style={styles.th}>Grade</th>
                      </tr>
                    </thead>
                    <tbody>{Object.values(subjectMap).map((sub,i) => {
                      let totalObt=0, totalMax=0;
                      presentTypes.forEach(t => { if (sub.marks[t]) { totalObt+=Number(sub.marks[t].obtained); totalMax+=Number(sub.marks[t].max); } });
                      const pct = totalMax>0 ? Number(((totalObt/totalMax)*100).toFixed(1)) : null;
                      const grade = pct !== null ? getGrade(pct) : null;
                      return (
                        <tr key={i} style={{background:i%2===0?'#fff':'#f7fafc'}}>
                          <td style={{...styles.td,fontFamily:'monospace',fontWeight:'700',fontSize:'0.82rem'}}>{sub.code}</td>
                          <td style={styles.td}>{sub.name}</td>
                          {presentTypes.map(t=>(
                            <td key={t} style={{...styles.td,textAlign:'center'}}>
                              {sub.marks[t]
                                ? <span style={{fontWeight:'600'}}>{sub.marks[t].obtained}<span style={{color:'#a0aec0',fontWeight:'400'}}>/{sub.marks[t].max}</span></span>
                                : <span style={{color:'#a0aec0'}}>—</span>}
                            </td>
                          ))}
                          <td style={{...styles.td,textAlign:'center',fontWeight:'700',color:pct>=60?'#276749':pct>=40?'#92400e':'#c53030'}}>
                            {pct !== null ? `${pct}%` : '—'}
                          </td>
                          <td style={{...styles.td,textAlign:'center'}}>
                            {grade ? <span style={{background:grade.c,color:'#fff',padding:'0.2rem 0.6rem',borderRadius:'6px',fontWeight:'700',fontSize:'0.85rem'}}>{grade.g}</span> : '—'}
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

        {activeTab === 'profile' && (
          <div>
            <div style={{background:'#fff',borderRadius:'12px',padding:'1.5rem',marginBottom:'1.5rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
              <h2 style={{margin:'0 0 0.25rem'}}>👤 My Profile</h2>
              <p style={{margin:'0 0 1.5rem',color:'#718096',fontSize:'0.85rem'}}>Update your personal information and password</p>

              {profileMsg && (
                <div style={{padding:'0.75rem 1rem',borderRadius:'8px',marginBottom:'1rem',
                  background: profileMsg.includes('✅') ? '#f0fff4' : '#fff5f5',
                  color: profileMsg.includes('✅') ? '#276749' : '#c53030',
                  fontWeight:'600',fontSize:'0.85rem'}}>
                  {profileMsg}
                </div>
              )}

              {/* Basic Info */}
              <div style={{marginBottom:'1.5rem'}}>
                <h3 style={{margin:'0 0 1rem',fontSize:'1rem',color:'#2d3748',borderBottom:'2px solid #e2e8f0',paddingBottom:'0.5rem'}}>Basic Information</h3>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem'}}>
                  {[
                    {label:'Roll No',    value:student?.roll_no,        readonly:true},
                    {label:'Programme',  value:student?.programme_name, readonly:true},
                    {label:'Semester',   value:student?.semester,       readonly:true},
                    {label:'Level',      value:student?.level_name,     readonly:true},
                  ].map(f=>(
                    <div key={f.label}>
                      <label style={{display:'block',fontSize:'0.8rem',fontWeight:'600',color:'#4a5568',marginBottom:'0.3rem'}}>{f.label}</label>
                      <input value={f.value||''} readOnly
                        style={{width:'100%',padding:'0.6rem 0.8rem',border:'1.5px solid #e2e8f0',borderRadius:'6px',fontSize:'0.9rem',background:'#f7fafc',color:'#718096',boxSizing:'border-box'}} />
                    </div>
                  ))}
                  <div>
                    <label style={{display:'block',fontSize:'0.8rem',fontWeight:'600',color:'#4a5568',marginBottom:'0.3rem'}}>Full Name</label>
                    <input value={profileForm.name ?? student?.name ?? ''} onChange={e=>setProfileForm({...profileForm,name:e.target.value})}
                      style={{width:'100%',padding:'0.6rem 0.8rem',border:'1.5px solid #e2e8f0',borderRadius:'6px',fontSize:'0.9rem',boxSizing:'border-box'}} />
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:'0.8rem',fontWeight:'600',color:'#4a5568',marginBottom:'0.3rem'}}>Email</label>
                    <input type="email" value={profileForm.email ?? student?.email ?? ''} onChange={e=>setProfileForm({...profileForm,email:e.target.value})}
                      placeholder="your@email.com"
                      style={{width:'100%',padding:'0.6rem 0.8rem',border:'1.5px solid #e2e8f0',borderRadius:'6px',fontSize:'0.9rem',boxSizing:'border-box'}} />
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:'0.8rem',fontWeight:'600',color:'#4a5568',marginBottom:'0.3rem'}}>Phone</label>
                    <input type="tel" value={profileForm.phone ?? student?.phone ?? ''} onChange={e=>setProfileForm({...profileForm,phone:e.target.value})}
                      placeholder="10-digit mobile number"
                      style={{width:'100%',padding:'0.6rem 0.8rem',border:'1.5px solid #e2e8f0',borderRadius:'6px',fontSize:'0.9rem',boxSizing:'border-box'}} />
                  </div>
                </div>
                <button onClick={async()=>{
                  try {
                    const updated = {
                      name:  profileForm.name  !== undefined ? profileForm.name  : student.name,
                      email: profileForm.email !== undefined ? profileForm.email : student.email,
                      phone: profileForm.phone !== undefined ? profileForm.phone : student.phone,
                    };
                    const res = await API.put(`/students/${student.student_id}/profile`, updated);
                    if (onStudentUpdate) onStudentUpdate(res.data.student);
                    showMsg('✅ Profile updated successfully!');
                    setProfileForm({});
                    
                  } catch(e) { showMsg(e.response?.data?.error||'Update failed', 'error'); }
                }} style={{marginTop:'1rem',padding:'0.65rem 1.5rem',background:'#4c51bf',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:'600'}}>
                  💾 Save Profile
                </button>
              </div>

              {/* Change Password */}
              <div>
                <h3 style={{margin:'0 0 1rem',fontSize:'1rem',color:'#2d3748',borderBottom:'2px solid #e2e8f0',paddingBottom:'0.5rem'}}>🔐 Change Password</h3>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'1rem'}}>
                  {[
                    {label:'Current Password', key:'current_password', placeholder:'Enter current password'},
                    {label:'New Password',      key:'new_password',     placeholder:'Enter new password'},
                    {label:'Confirm Password',  key:'confirm_password', placeholder:'Confirm new password'},
                  ].map(f=>(
                    <div key={f.key}>
                      <label style={{display:'block',fontSize:'0.8rem',fontWeight:'600',color:'#4a5568',marginBottom:'0.3rem'}}>{f.label}</label>
                      <input type="password" value={profileForm[f.key]||''} onChange={e=>setProfileForm({...profileForm,[f.key]:e.target.value})}
                        placeholder={f.placeholder}
                        style={{width:'100%',padding:'0.6rem 0.8rem',border:'1.5px solid #e2e8f0',borderRadius:'6px',fontSize:'0.9rem',boxSizing:'border-box'}} />
                    </div>
                  ))}
                </div>
                <button onClick={async()=>{
                  if (!profileForm.current_password || !profileForm.new_password) { showMsg('Please fill all password fields', 'error'); return; }
                  if (profileForm.new_password !== profileForm.confirm_password) { showMsg('New passwords do not match', 'error'); return; }
                  if (profileForm.new_password.length < 6) { showMsg('Password must be at least 6 characters', 'error'); return; }
                  try {
                    await API.put(`/students/${student.student_id}/profile`, {
                      current_password: profileForm.current_password,
                      new_password: profileForm.new_password
                    });
                    showMsg('✅ Password changed successfully!');
                    setProfileForm({...profileForm, current_password:'', new_password:'', confirm_password:''});
                    
                  } catch(e) { showMsg(e.response?.data?.error||'Password change failed', 'error'); }
                }} style={{marginTop:'1rem',padding:'0.65rem 1.5rem',background:'#e53e3e',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:'600'}}>
                  🔐 Change Password
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fees' && (
          <div>
            <div style={{background:'#fff',borderRadius:'12px',padding:'1.5rem',marginBottom:'1.5rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
              <h2 style={{margin:'0 0 1rem'}}>💰 My Fees</h2>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'1rem',marginBottom:'1rem'}}>
                {[
                  {label:'Total Amount', value:`₹${fees.reduce((s,f)=>s+Number(f.amount),0).toLocaleString()}`, bg:'#ebf8ff', color:'#2b6cb0'},
                  {label:'Paid', value:`₹${fees.filter(f=>f.status==='PAID').reduce((s,f)=>s+Number(f.amount),0).toLocaleString()}`, bg:'#f0fff4', color:'#276749'},
                  {label:'Pending', value:`₹${fees.filter(f=>f.status==='PENDING').reduce((s,f)=>s+Number(f.amount),0).toLocaleString()}`, bg:'#fffbeb', color:'#92400e'},
                  {label:'Overdue', value:`₹${fees.filter(f=>f.status==='OVERDUE').reduce((s,f)=>s+Number(f.amount),0).toLocaleString()}`, bg:'#fff5f5', color:'#c53030'},
                ].map(item=>(
                  <div key={item.label} style={{background:item.bg,borderRadius:'10px',padding:'1rem',textAlign:'center'}}>
                    <p style={{fontSize:'1.3rem',fontWeight:'700',margin:0,color:item.color}}>{item.value}</p>
                    <p style={{fontSize:'0.8rem',color:'#718096',margin:'0.25rem 0 0'}}>{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
            {fees.length === 0 ? (
              <div style={styles.emptyState}>💰 No fee records found.</div>
            ) : (
              <table style={styles.table}>
                <thead><tr>{['Fee Type','Amount','Due Date','Paid Date','Status','Ref No','Receipt'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>{fees.map(f=>(
                  <tr key={f.fee_id} style={{background:f.status==='OVERDUE'?'#fff5f5':f.status==='PAID'?'#f0fff4':'#fff'}}>
                    <td style={styles.td}><strong>{f.fee_type}</strong></td>
                    <td style={{...styles.td,fontWeight:'700'}}>₹{Number(f.amount).toLocaleString()}</td>
                    <td style={styles.td}>{f.due_date ? new Date(f.due_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'}</td>
                    <td style={styles.td}>{f.paid_date ? new Date(f.paid_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—'}</td>
                    <td style={styles.td}>
                      <span style={{padding:'0.25rem 0.75rem',borderRadius:'999px',color:'#fff',fontSize:'0.8rem',fontWeight:'600',
                        background:f.status==='PAID'?'#48bb78':f.status==='OVERDUE'?'#e53e3e':'#ed8936'}}>
                        {f.status==='PAID'?'✅ Paid':f.status==='OVERDUE'?'🔴 Overdue':'⏳ Pending'}
                      </span>
                    </td>
                    <td style={{...styles.td,fontFamily:'monospace',fontSize:'0.8rem',color:'#718096'}}>{f.transaction_ref||'—'}</td>
                    <td style={styles.td}>
                      {f.status==='PAID' && (
                        <button onClick={()=>printFeeReceipt(f)}
                          style={{padding:'0.25rem 0.7rem',background:'#4c51bf',color:'#fff',border:'none',borderRadius:'5px',cursor:'pointer',fontSize:'0.75rem',fontWeight:'600'}}>
                          🧾 Receipt
                        </button>
                      )}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <div>
            <h2 style={{ margin:'0 0 1.5rem', color:'#2d3748' }}>🔔 Notifications</h2>
            {notifications.length === 0 ? (
              <div style={{ background:'#fff', padding:'3rem', textAlign:'center', borderRadius:'12px', color:'#718096' }}>
                No notifications yet.
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.notification_id} style={{ background:'#fff', borderRadius:'10px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', marginBottom:'1rem', overflow:'hidden' }}>
                  <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                        <h4 style={{ margin:0, color:'#2d3748' }}>{n.title}</h4>
                        <span style={{ fontSize:'0.7rem', fontWeight:'600', padding:'2px 8px', borderRadius:'999px', color:'#fff',
                          background: n.sender_role === 'admin' ? '#4c51bf' : '#38a169' }}>
                          {n.sender_role === 'admin' ? 'Admin' : 'Teacher'}
                        </span>
                      </div>
                      <span style={{ fontSize:'0.8rem', color:'#a0aec0' }}>
                        {n.sender_role === 'teacher'
                          ? `${n.teacher_name} · ${n.target === 'subject' ? `${n.subject_code} — ${n.subject_name}` : `${n.programme_name} — Sem ${n.target_semester}`} · `
                          : n.sender_role === 'admin' && n.target === 'class'
                          ? `${n.admin_name || 'Admin'} · ${n.programme_name} — Sem ${n.target_semester} · `
                          : n.admin_name ? `${n.admin_name} · ` : ''}
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div style={{ padding:'1rem 1.25rem' }}>
                    <p style={{ margin:0, color:'#4a5568', whiteSpace:'pre-wrap', lineHeight:'1.6' }}>{n.message}</p>
                    {n.attachment_url && (
                      <div style={{ marginTop:'0.75rem', padding:'0.75rem', background:'#f7fafc', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
                        {n.attachment_type === 'image' ? (
                          <div>
                            <img src={`${NOTIF_API_BASE}${n.attachment_url}`} alt="attachment"
                              style={{ maxWidth:'100%', maxHeight:'300px', borderRadius:'6px', cursor:'pointer' }}
                              onClick={() => window.open(`${NOTIF_API_BASE}${n.attachment_url}`, '_blank')}
                            />
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

const styles = {
  container:{minHeight:'100vh',background:'#f0f4f8'},
  nav:{background:'#2d3748',padding:'1rem 2rem',display:'flex',justifyContent:'space-between',alignItems:'center'},
  navTitle:{color:'#fff',margin:0},
  navRight:{display:'flex',alignItems:'center',gap:'1rem'},
  studentName:{color:'#a0aec0'},
  logoutBtn:{background:'#e53e3e',color:'#fff',border:'none',padding:'0.5rem 1rem',borderRadius:'6px',cursor:'pointer'},
  tabs:{display:'flex',background:'#fff',borderBottom:'2px solid #e2e8f0',padding:'0 2rem'},
  tab:{padding:'1rem 1.5rem',border:'none',background:'none',cursor:'pointer',fontSize:'0.95rem',color:'#718096'},
  activeTab:{color:'#4c51bf',borderBottom:'2px solid #4c51bf',fontWeight:'600'},
  content:{padding:'2rem'},
  adminNotifBanner:{background:'linear-gradient(135deg,#2b6cb0,#4c51bf)',color:'#fff',padding:'1rem 1.5rem',borderRadius:'12px',marginBottom:'1.5rem',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'1rem',boxShadow:'0 4px 12px rgba(76,81,191,0.3)'},
  adminNotifLeft:{display:'flex',alignItems:'center',gap:'1rem'},
  adminNotifBtn:{background:'rgba(255,255,255,0.2)',border:'2px solid rgba(255,255,255,0.5)',color:'#fff',padding:'0.6rem 1.2rem',borderRadius:'8px',cursor:'pointer',fontWeight:'600',whiteSpace:'nowrap'},
  adminSubjectBanner:{background:'#ebf8ff',border:'2px solid #90cdf4',color:'#2b6cb0',padding:'1rem 1.5rem',borderRadius:'10px',marginBottom:'1.5rem',display:'flex',gap:'1rem',alignItems:'flex-start'},
  adminTag:{marginLeft:'0.4rem',fontSize:'0.75rem'},
  notifDot:{position:'absolute',top:'-8px',right:'-8px',background:'#e53e3e',color:'#fff',borderRadius:'999px',width:'22px',height:'22px',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'700',fontSize:'0.85rem'},
  welcome:{background:'#fff',padding:'1.5rem',borderRadius:'12px',marginBottom:'2rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'},
  meta:{color:'#718096',marginTop:'0.5rem'},
  cards:{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:'1.5rem'},
  card:{padding:'1.5rem',borderRadius:'12px',color:'#fff',boxShadow:'0 4px 12px rgba(0,0,0,0.15)',cursor:'pointer'},
  cardArrow:{marginTop:'0.5rem',opacity:0.8,fontSize:'0.9rem'},
  subjectHeader:{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fff',padding:'1.5rem',borderRadius:'12px',marginBottom:'1.5rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'},
  enrollBtn:{padding:'0.75rem 1.5rem',background:'#4c51bf',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontWeight:'600',fontSize:'1rem'},
  submittedTag:{padding:'0.5rem 1.25rem',borderRadius:'999px',fontWeight:'600'},
  enrollmentAlert:{background:'#fffbeb',border:'2px solid #fcd34d',borderRadius:'10px',padding:'1rem 1.5rem',marginBottom:'1.5rem'},
  summaryCards:{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))',gap:'1rem',marginBottom:'1.5rem'},
  summaryCard:{padding:'1rem',borderRadius:'10px',textAlign:'center'},
  summaryNum:{fontSize:'2rem',fontWeight:'700',margin:0},
  summaryLabel:{color:'#718096',margin:'0.25rem 0 0',fontSize:'0.85rem'},
  categoryBlock:{marginBottom:'2rem',borderRadius:'10px',overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'},
  categoryHeader:{padding:'0.75rem 1.5rem',color:'#fff',display:'flex',justifyContent:'space-between',alignItems:'center'},
  catTitle:{fontWeight:'700',fontSize:'1rem'},
  catCount:{background:'rgba(255,255,255,0.3)',padding:'0.2rem 0.75rem',borderRadius:'999px',fontSize:'0.82rem'},
  discBadge:{background:'#ebf8ff',color:'#2b6cb0',padding:'0.15rem 0.5rem',borderRadius:'999px',fontSize:'0.75rem',fontWeight:'600'},
  summaryBox:{background:'#fff',padding:'1.5rem',borderRadius:'12px',marginBottom:'2rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'},
  warningBanner:{background:'#fffbeb',color:'#92400e',border:'1px solid #fcd34d',borderRadius:'8px',padding:'0.75rem 1rem',fontWeight:'600'},
  goodBanner:{background:'#f0fff4',color:'#276749',border:'1px solid #9ae6b4',borderRadius:'8px',padding:'0.75rem 1rem',fontWeight:'600'},
  subjectStats:{background:'#fff',padding:'1.5rem',borderRadius:'12px',marginBottom:'2rem',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'},
  subjectGrid:{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))',gap:'1rem'},
  subjectCard:{background:'#f7fafc',padding:'1rem',borderRadius:'10px',border:'1px solid #e2e8f0'},
  subjectName:{margin:'0 0 0.75rem',color:'#2d3748',fontSize:'0.95rem'},
  progressBar:{height:'8px',background:'#e2e8f0',borderRadius:'999px',overflow:'hidden',marginBottom:'0.5rem'},
  progressFill:{height:'100%',borderRadius:'999px',transition:'width 0.3s ease'},
  subjectMeta:{display:'flex',justifyContent:'space-between',fontSize:'0.85rem',marginBottom:'0.5rem'},
  subjectBadges:{display:'flex',gap:'0.4rem'},
  badge:{padding:'0.2rem 0.6rem',borderRadius:'999px',color:'#fff',fontSize:'0.75rem',fontWeight:'600'},
  table:{width:'100%',borderCollapse:'collapse',background:'#fff',borderRadius:'10px',overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'},
  th:{background:'#2d3748',color:'#fff',padding:'0.75rem 1rem',textAlign:'left',fontSize:'0.85rem'},
  td:{padding:'0.75rem 1rem',borderBottom:'1px solid #e2e8f0',fontSize:'0.85rem'},
  emptyState:{background:'#fff',padding:'3rem',textAlign:'center',borderRadius:'12px',color:'#718096',fontSize:'1.1rem'},
};
