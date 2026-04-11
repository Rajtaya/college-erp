import React, { useState, useEffect } from 'react';
import API from '../api';
import * as XLSX from 'xlsx';

export default function ClerkDashboard({ clerk, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState({});
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [marks, setMarks] = useState([]);
  
  const [enrollment, setEnrollment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [popup, setPopup] = useState(null);

  const facultyName = clerk.faculty_name || 'Faculty';
  const facultyColors = { Arts:'#e53e3e', Science:'#2b6cb0', Commerce:'#276749' };
  const accentColor = facultyColors[facultyName] || '#4c51bf';

  const showMsg = (text, type='success') => { setPopup({text,type}); setTimeout(()=>setPopup(null),3000); };

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => {
    setSearch('');
    if (activeTab === 'students') fetchStudents();
    if (activeTab === 'attendance') fetchAttendance();
    if (activeTab === 'marks') fetchMarks();
    
    if (activeTab === 'enrollment') fetchEnrollment();
  }, [activeTab]);

  const fetchStats = async () => { try { const r = await API.get('/clerks/stats'); setStats(r.data); } catch(e){} };
  const fetchStudents = async () => { setLoading(true); try { const r = await API.get('/clerks/students'); setStudents(r.data); } catch(e){} finally { setLoading(false); } };
  const fetchAttendance = async () => { setLoading(true); try { const r = await API.get('/clerks/attendance/summary'); setAttendance(r.data); } catch(e){} finally { setLoading(false); } };
  const fetchMarks = async () => { setLoading(true); try { const r = await API.get('/clerks/marks'); setMarks(r.data); } catch(e){} finally { setLoading(false); } };
  
  const fetchEnrollment = async () => { setLoading(true); try { const r = await API.get('/clerks/enrollment'); setEnrollment(r.data); } catch(e){} finally { setLoading(false); } };

  // ── Export helpers ──────────────────────────────────────────────────────────
  const exportExcel = (data, filename, sheetName='Data') => {
    if (!data.length) { showMsg('No data to export','error'); return; }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}_${facultyName}_${new Date().toLocaleDateString('en-IN').replace(/\//g,'-')}.xlsx`);
    showMsg(`✅ Exported ${data.length} records`);
  };

  const exportCSV = (data, filename) => {
    if (!data.length) { showMsg('No data to export','error'); return; }
    const headers = Object.keys(data[0]);
    const csv = [headers.join(','), ...data.map(r => headers.map(h => `"${(r[h]??'').toString().replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${filename}_${facultyName}_${new Date().toLocaleDateString('en-IN').replace(/\//g,'-')}.csv`;
    a.click(); showMsg(`✅ Exported ${data.length} records`);
  };

  // ── Filter helper ─────────────────────────────────────────────────────────
  const filterData = (data) => {
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(s)));
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderTable = (data, columns) => {
    const filtered = filterData(data);
    return (
      <div style={{overflowX:'auto'}} className="erp-table-wrap">
        <table style={st.table}>
          <thead><tr>{columns.map(c => <th key={c.key} style={st.th}>{c.label}</th>)}</tr></thead>
          <tbody>{filtered.length === 0
            ? <tr><td colSpan={columns.length} style={{...st.td,textAlign:'center',color:'#a0aec0',padding:'2rem'}}>No records found</td></tr>
            : filtered.map((row, i) => (
              <tr key={i} style={{background: i%2===0?'#fff':'#f7fafc'}}>
                {columns.map(c => <td key={c.key} style={{...st.td, ...(c.style?c.style(row):{})}}>{c.render ? c.render(row) : row[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{color:'#718096',fontSize:'0.8rem',marginTop:'0.5rem'}}>{filtered.length} of {data.length} records</div>
      </div>
    );
  };

  const tabs = [
    { id:'overview', label:'📊 Overview' },
    { id:'students', label:'👨‍🎓 Students' },
    { id:'attendance', label:'📅 Attendance' },
    { id:'marks', label:'📝 Marks' },
    { id:'enrollment', label:'📚 Enrollment' },
  ];

  return (
    <div style={st.container}>
      {/* Popup */}
      {popup && <div style={{...st.popup, background: popup.type==='error'?'#fed7d7':'#c6f6d5', color: popup.type==='error'?'#c53030':'#276749'}}>{popup.text}</div>}

      {/* Header */}
      <div style={{...st.header, background:`linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`}} className="erp-gradient-header">
        <div>
          <h1 style={st.headerTitle}>📋 {facultyName} Faculty — Clerk Portal</h1>
          <p style={st.headerSub}>{clerk.first_name} {clerk.last_name} · Read-Only Access</p>
        </div>
        <button style={st.logoutBtn} onClick={onLogout}>🚪 Logout</button>
      </div>

      {/* Tabs */}
      <div style={st.tabs} className="erp-tabs">
        {tabs.map(t => (
          <button key={t.id}
            style={{...st.tab, ...(activeTab===t.id ? {...st.activeTab, borderBottomColor:accentColor, color:accentColor} : {})}}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div style={st.content} className="erp-content">
        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div>
            <div style={st.statsGrid} className="erp-stats-grid">
              {[
                { label:'Students', value:stats.totalStudents||0, icon:'👨‍🎓', color:'#4c51bf' },
                { label:'Teachers', value:stats.totalTeachers||0, icon:'👨‍🏫', color:'#2b6cb0' },
                { label:'Programmes', value:stats.totalProgrammes||0, icon:'📚', color:'#276749' },
              ].map((s,i) => (
                <div key={i} style={{...st.statCard, borderLeft:`4px solid ${s.color}`}}>
                  <div style={{fontSize:'2rem'}}>{s.icon}</div>
                  <div>
                    <div style={{fontSize:'1.5rem',fontWeight:'700',color:s.color}}>{s.value}</div>
                    <div style={{fontSize:'0.85rem',color:'#718096'}}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={st.card} className="erp-card">
              <h3 style={st.cardTitle}>ℹ️ About This Portal</h3>
              <p style={{color:'#4a5568',lineHeight:'1.6'}}>
                This is a <strong>read-only</strong> portal for the {facultyName} faculty clerk.
                You can view student records, attendance, marks, and enrollment data for all programmes under the {facultyName} faculty.
                Use the export buttons to download data as Excel or CSV files for further processing.
              </p>
            </div>
          </div>
        )}

        {/* STUDENTS */}
        {activeTab === 'students' && (
          <div style={st.card} className="erp-card">
            <div style={st.cardHeader} className="erp-card-header">
              <h3 style={st.cardTitle}>👨‍🎓 Students — {facultyName} Faculty</h3>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <input style={st.search} placeholder="🔍 Search..." value={search} onChange={e=>setSearch(e.target.value)} />
                <button style={{...st.exportBtn,background:'#276749'}} onClick={()=>exportExcel(filterData(students),'Students','Students')}>📥 Excel</button>
                <button style={st.exportBtn} onClick={()=>exportCSV(filterData(students),'Students')}>📄 CSV</button>
              </div>
            </div>
            {loading ? <p style={st.loading}>Loading...</p> : renderTable(students, [
              { key:'roll_no', label:'Roll No', style:()=>({fontFamily:'monospace',fontWeight:'700'}) },
              { key:'name', label:'Name' },
              { key:'programme_name', label:'Programme' },
              { key:'semester', label:'Semester', style:()=>({textAlign:'center'}) },
              { key:'email', label:'Email' },
              { key:'phone', label:'Phone' },
            ])}
          </div>
        )}

        {/* ATTENDANCE */}
        {activeTab === 'attendance' && (
          <div style={st.card} className="erp-card">
            <div style={st.cardHeader} className="erp-card-header">
              <h3 style={st.cardTitle}>📅 Attendance Summary — {facultyName} Faculty</h3>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <input style={st.search} placeholder="🔍 Search..." value={search} onChange={e=>setSearch(e.target.value)} />
                <button style={{...st.exportBtn,background:'#276749'}} onClick={()=>exportExcel(filterData(attendance),'Attendance','Attendance')}>📥 Excel</button>
                <button style={st.exportBtn} onClick={()=>exportCSV(filterData(attendance),'Attendance')}>📄 CSV</button>
              </div>
            </div>
            {loading ? <p style={st.loading}>Loading...</p> : renderTable(attendance, [
              { key:'roll_no', label:'Roll No', style:()=>({fontFamily:'monospace',fontWeight:'700'}) },
              { key:'student_name', label:'Name' },
              { key:'programme_name', label:'Programme' },
              { key:'semester', label:'Sem', style:()=>({textAlign:'center'}) },
              { key:'total_classes', label:'Total', style:()=>({textAlign:'center'}) },
              { key:'present', label:'Present', style:()=>({textAlign:'center',color:'#276749',fontWeight:'600'}) },
              { key:'absent', label:'Absent', style:()=>({textAlign:'center',color:'#c53030',fontWeight:'600'}) },
              { key:'on_leave', label:'Leave', style:()=>({textAlign:'center',color:'#92400e'}) },
              { key:'percentage', label:'%', style:(r)=>({textAlign:'center',fontWeight:'700',color:r.percentage>=75?'#276749':r.percentage>=60?'#92400e':'#c53030'}),
                render:(r)=>`${r.percentage}%` },
            ])}
          </div>
        )}

        {/* MARKS */}
        {activeTab === 'marks' && (
          <div style={st.card} className="erp-card">
            <div style={st.cardHeader} className="erp-card-header">
              <h3 style={st.cardTitle}>📝 Marks — {facultyName} Faculty</h3>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <input style={st.search} placeholder="🔍 Search..." value={search} onChange={e=>setSearch(e.target.value)} />
                <button style={{...st.exportBtn,background:'#276749'}} onClick={()=>exportExcel(filterData(marks),'Marks','Marks')}>📥 Excel</button>
                <button style={st.exportBtn} onClick={()=>exportCSV(filterData(marks),'Marks')}>📄 CSV</button>
              </div>
            </div>
            {loading ? <p style={st.loading}>Loading...</p> : renderTable(marks, [
              { key:'roll_no', label:'Roll No', style:()=>({fontFamily:'monospace',fontWeight:'700'}) },
              { key:'student_name', label:'Name' },
              { key:'programme_name', label:'Programme' },
              { key:'subject_code', label:'Subject Code' },
              { key:'subject_name', label:'Subject' },
              { key:'exam_type', label:'Exam Type' },
              { key:'marks_obtained', label:'Obtained', style:()=>({textAlign:'center',fontWeight:'600'}) },
              { key:'max_marks', label:'Max', style:()=>({textAlign:'center'}) },
              { key:'percentage', label:'%', render:(r)=> r.max_marks>0 ? `${((r.marks_obtained/r.max_marks)*100).toFixed(1)}%` : '—',
                style:(r)=>({textAlign:'center',fontWeight:'700',color: r.max_marks>0 ? ((r.marks_obtained/r.max_marks)*100>=60?'#276749':(r.marks_obtained/r.max_marks)*100>=40?'#92400e':'#c53030') : '#a0aec0'}) },
            ])}
          </div>
        )}

        {/* FEES */}

        {/* ENROLLMENT */}
        {activeTab === 'enrollment' && (
          <div style={st.card} className="erp-card">
            <div style={st.cardHeader} className="erp-card-header">
              <h3 style={st.cardTitle}>📚 Enrollment — {facultyName} Faculty</h3>
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <input style={st.search} placeholder="🔍 Search..." value={search} onChange={e=>setSearch(e.target.value)} />
                <button style={{...st.exportBtn,background:'#276749'}} onClick={()=>exportExcel(filterData(enrollment),'Enrollment','Enrollment')}>📥 Excel</button>
                <button style={st.exportBtn} onClick={()=>exportCSV(filterData(enrollment),'Enrollment')}>📄 CSV</button>
              </div>
            </div>
            {loading ? <p style={st.loading}>Loading...</p> : (() => {
              const maxSub = enrollment.length > 0 ? Math.max(...enrollment.map(r => r.total_subjects || 0)) : 0;
              const subCols = Array.from({length: Math.min(maxSub, 12)}, (_, i) => ({
                key: 'Subject_' + (i+1), label: 'Sub ' + (i+1), style:()=>({fontSize:'0.8rem',fontFamily:'monospace'})
              }));
              return renderTable(enrollment, [
                { key:'roll_no', label:'Roll No', style:()=>({fontFamily:'monospace',fontWeight:'700'}) },
                { key:'student_name', label:'Name' },
                { key:'programme_name', label:'Programme' },
                { key:'semester', label:'Sem', style:()=>({textAlign:'center'}) },
                { key:'total_subjects', label:'Total', style:()=>({textAlign:'center',fontWeight:'600'}) },
                ...subCols,
              ]);
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

const st = {
  container: { minHeight:'100vh', background:'#f0f2f5', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' },
  popup: { position:'fixed', top:'1rem', right:'1rem', padding:'0.75rem 1.5rem', borderRadius:'8px', fontWeight:'600', fontSize:'0.9rem', zIndex:9999, boxShadow:'0 4px 12px rgba(0,0,0,0.15)' },
  header: { padding:'1.5rem 2rem', color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center' },
  headerTitle: { margin:0, fontSize:'1.4rem', fontWeight:'700' },
  headerSub: { margin:'0.25rem 0 0', opacity:0.9, fontSize:'0.9rem' },
  logoutBtn: { background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', padding:'0.5rem 1.25rem', borderRadius:'8px', cursor:'pointer', fontWeight:'600', fontSize:'0.85rem' },
  tabs: { display:'flex', background:'#fff', borderBottom:'2px solid #e2e8f0', padding:'0 2rem', overflowX:'auto' },
  tab: { padding:'0.75rem 1.25rem', border:'none', background:'none', cursor:'pointer', fontSize:'0.9rem', color:'#718096', borderBottom:'2px solid transparent', marginBottom:'-2px', whiteSpace:'nowrap', fontWeight:'500' },
  activeTab: { fontWeight:'600', borderBottom:'2px solid' },
  content: { padding:'1.5rem 2rem', maxWidth:'1400px', margin:'0 auto' },
  statsGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'1rem', marginBottom:'1.5rem' },
  statCard: { background:'#fff', borderRadius:'12px', padding:'1.25rem', display:'flex', alignItems:'center', gap:'1rem', boxShadow:'0 1px 3px rgba(0,0,0,0.08)' },
  card: { background:'#fff', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.08)', marginBottom:'1.5rem' },
  cardHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.75rem' },
  cardTitle: { margin:0, color:'#2d3748', fontSize:'1.1rem' },
  search: { padding:'0.5rem 0.75rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.85rem', width:'200px', outline:'none' },
  exportBtn: { padding:'0.5rem 1rem', background:'#2b6cb0', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'600', fontSize:'0.8rem', whiteSpace:'nowrap' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' },
  th: { textAlign:'left', padding:'0.6rem 0.75rem', background:'#f7fafc', borderBottom:'2px solid #e2e8f0', color:'#4a5568', fontWeight:'700', fontSize:'0.8rem', whiteSpace:'nowrap' },
  td: { padding:'0.5rem 0.75rem', borderBottom:'1px solid #edf2f7', color:'#2d3748' },
  loading: { textAlign:'center', padding:'2rem', color:'#718096' },
};
