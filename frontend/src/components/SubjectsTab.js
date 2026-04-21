import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import API from '../api';

const categoryColors = {
  MAJOR:'#4c51bf', MINOR:'#38a169', VAC:'#d69e2e',
  SEC:'#e53e3e', MDC:'#dd6b20', AEC:'#805ad5',
  DSC:'#0694a2', MIC:'#057a55'
};

const categoryLabels = {
  MAJOR: 'Discipline Specific Course (DSC)',
  MIC:   'Minor Course / Vocational',
  MDC:   'Multidisciplinary Course',
  SEC:   'Skill Enhancement Course',
  VAC:   'Value Added Course',
  AEC:   'Ability Enhancement Course',
  MINOR: 'Minor Course',
  DSC:   'Discipline Specific Course',
};

export default function SubjectsTab({ levels, faculties, programmes, showMsg }) {
  const [subjects, setSubjects] = useState([]);
  const [disciplines, setDisciplines] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [form, setForm] = useState({});
  const [subjectLevel, setSubjectLevel] = useState('');
  const [subjectFaculty, setSubjectFaculty] = useState('');
  const [subjectProgrammes, setSubjectProgrammes] = useState([]);
  const [filterLevel, setFilterLevel] = useState('');
  const [filterFaculty, setFilterFaculty] = useState('');
  const [filterProgramme, setFilterProgramme] = useState('');
  const [filterSemester, setFilterSemester] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterProgrammes, setFilterProgrammes] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef();

  useEffect(() => { fetchSubjects(); fetchDisciplines(); fetchTeachers(); }, []);

  useEffect(() => {
    if (subjectLevel && subjectFaculty) {
      setSubjectProgrammes(programmes.filter(p =>
        String(p.level_id) === String(subjectLevel) &&
        String(p.faculty_id) === String(subjectFaculty)
      ));
    } else { setSubjectProgrammes([]); }
  }, [subjectLevel, subjectFaculty, programmes]);

  useEffect(() => {
    if (filterLevel && filterFaculty) {
      setFilterProgrammes(programmes.filter(p =>
        String(p.level_id) === String(filterLevel) &&
        String(p.faculty_id) === String(filterFaculty)
      ));
    } else if (filterLevel) {
      setFilterProgrammes(programmes.filter(p => String(p.level_id) === String(filterLevel)));
    } else { setFilterProgrammes([]); setFilterProgramme(''); }
  }, [filterLevel, filterFaculty, programmes]);

  const fetchSubjects = async () => {
    try { const r = await API.get('/subjects'); setSubjects(r.data); } catch(e){}
  };

  const fetchDisciplines = async () => {
    try { const r = await API.get('/disciplines'); setDisciplines(r.data); } catch(e){}
  };

  const fetchTeachers = async () => {
    try { const r = await API.get('/admin/teachers'); setTeachers(r.data); } catch(e){}
  };

  const [subjectTeachers, setSubjectTeachers] = useState({}); // subject_id -> [teachers]

  const fetchAllSubjectTeachers = async () => {
    try {
      const r = await API.get('/subjects/all-teachers');
      setSubjectTeachers(r.data);
    } catch(e) {}
  };

  useEffect(() => {
    if (subjects.length) fetchAllSubjectTeachers();
  }, [subjects]);

  const handleAssignTeacher = async (subject_id, teacher_id) => {
    if (!teacher_id) return;
    try {
      await API.post(`/subjects/${subject_id}/teachers`, { teacher_id, section: 'A' });
      showMsg('Teacher assigned!');
      fetchAllSubjectTeachers();
    } catch(e) { showMsg('Failed to assign teacher', 'error'); }
  };

  const handleRemoveTeacher = async (subject_id, teacher_id) => {
    try {
      await API.delete(`/subjects/${subject_id}/teachers/${teacher_id}`);
      showMsg('Teacher removed!');
      fetchAllSubjectTeachers();
    } catch(e) { showMsg('Failed to remove teacher', 'error'); }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await API.post('/subjects', { ...form, level_id: subjectLevel, faculty_id: subjectFaculty });
      showMsg('Subject added!');
      setForm({}); setSubjectLevel(''); setSubjectFaculty(''); setShowForm(false);
      fetchSubjects();
    } catch(err) { showMsg(err.response?.data?.error||'Error','error'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this subject?')) return;
    try { await API.delete(`/admin/subjects/${id}`); showMsg('Deleted!'); fetchSubjects(); }
    catch(e) { showMsg('Delete failed!','error'); }
  };

  const downloadTemplate = () => {
    const data = [
      {
        subject_code: 'C24CAP101T',
        subject_name: 'Computer Fundamentals and Problem Solving through C',
        category: 'MAJOR',
        discipline_name: 'Computer Science',
        semester: 1, credits: 3, contact_hours: 3,
        internal_marks: 20, end_term_marks: 50, total_marks: 70,
        exam_duration: 2.5,
        level_name: 'UG',
        faculty_name: 'Science',
        programme_name: 'BCA'
      },
      {
        subject_code: 'C24MDC101T',
        subject_name: 'Applied Biology',
        category: 'MDC',
        discipline_name: 'Botany',
        semester: 1, credits: 2, contact_hours: 2,
        internal_marks: 15, end_term_marks: 35, total_marks: 50,
        exam_duration: 2.5,
        level_name: 'UG',
        faculty_name: '',
        programme_name: ''
      },
      {
        subject_code: 'C24MDC132T',
        subject_name: 'Foundations of Computer Science',
        category: 'MDC',
        discipline_name: 'Computer Science',
        semester: 1, credits: 2, contact_hours: 2,
        internal_marks: 15, end_term_marks: 35, total_marks: 50,
        exam_duration: 2.5,
        level_name: 'UG',
        faculty_name: '',
        programme_name: ''
      },
      {
        subject_code: 'C24MIC112T',
        subject_name: 'Indian National Movement',
        category: 'MIC',
        discipline_name: 'History',
        semester: 1, credits: 2, contact_hours: 2,
        internal_marks: 15, end_term_marks: 35, total_marks: 50,
        exam_duration: 2.5,
        level_name: 'UG',
        faculty_name: '',
        programme_name: ''
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'subjects');
    XLSX.writeFile(wb, 'subjects_template.xlsx');
  };

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImporting(true); setImportResult(null);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type:'array', cellFormula:false, cellNF:false, cellText:false });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw:true, defval:'' });
      if (!rows.length) { showMsg('No data found!','error'); return; }

      const validCats = ['MAJOR','MINOR','VAC','SEC','MDC','AEC','DSC','MIC'];
      const levelMap = {}; levels.forEach(l => { levelMap[l.level_name.toUpperCase()] = l.level_id; });
      const progMap = {}; programmes.forEach(p => { progMap[p.programme_name.toLowerCase().trim()] = p.programme_id; });
      const facMap = {}; faculties.forEach(f => { facMap[f.faculty_name.toLowerCase().trim()] = f.faculty_id; });

      let success = 0, failed = 0, errors = [];

      for (const row of rows) {
        try {
          const category = String(row.category||'').toUpperCase().trim();
          if (!validCats.includes(category)) {
            failed++;
            errors.push(`${row.subject_code}: Invalid category "${row.category}"`);
            continue;
          }

          // Handle total_marks formula
          let total_marks = row.total_marks;
          if (typeof total_marks === 'string' && total_marks.startsWith('=')) {
            total_marks = Number(row.internal_marks||0) + Number(row.end_term_marks||0);
          } else {
            total_marks = Number(total_marks||0);
          }

          const isCommon = ['MDC','MIC','SEC','VAC','AEC'].includes(category);
          const progName = String(row.programme_name||'').toLowerCase().trim();
          const facName = String(row.faculty_name||'').toLowerCase().trim();
          const discName = String(row.discipline_name||'').trim();

          await API.post('/subjects', {
            subject_code: String(row.subject_code||'').trim(),
            subject_name: String(row.subject_name||'').trim(),
            category,
            discipline_name: discName || null,
            semester: Number(row.semester||1),
            credits: Number(row.credits||0),
            contact_hours: Number(row.contact_hours||0),
            internal_marks: Number(row.internal_marks||0),
            end_term_marks: Number(row.end_term_marks||0),
            total_marks,
            
            level_id: levelMap[String(row.level_name||'').toUpperCase().trim()] || null,
            faculty_id: facName ? (facMap[facName] || null) : null,
            programme_id: (!isCommon && progName) ? (progMap[progName] || null) : null,
            is_common: isCommon,
          });
          success++;
        } catch(err) {
          failed++;
          errors.push(`${row.subject_code}: ${err.response?.data?.error||'Error'}`);
        }
      }

      setImportResult({ success, failed, errors });
      showMsg(`✅ Imported ${success}${failed?`, ❌ ${failed} failed`:''}`, failed?'warning':'success');
      fetchSubjects(); fetchDisciplines();
    } catch { showMsg('Failed to read file!','error'); }
    finally { setImporting(false); e.target.value=''; }
  };

  const filteredSubjects = subjects.filter(s => {
    const matchLevel = !filterLevel || String(s.level_id) === String(filterLevel);
    // If a programme is selected, match by programme_id (ignore faculty for MAJOR subjects)
    // If only faculty is selected (no programme), match by faculty_id
    const matchFaculty = !filterFaculty || filterProgramme
      ? true
      : String(s.faculty_id) === String(filterFaculty);
    const matchProgramme = !filterProgramme || String(s.programme_id) === String(filterProgramme);
    const matchSemester = !filterSemester || String(s.semester) === String(filterSemester);
    const matchCategory = !filterCategory || s.category === filterCategory;
    return matchLevel && matchFaculty && matchProgramme && matchSemester && matchCategory;
  });

  const groupedBySemester = {};
  filteredSubjects.forEach(s => {
    const sem = s.semester || 0;
    if (!groupedBySemester[sem]) groupedBySemester[sem] = {};
    const cat = s.category || 'OTHER';
    if (!groupedBySemester[sem][cat]) groupedBySemester[sem][cat] = [];
    groupedBySemester[sem][cat].push(s);
  });

  return (
    <div>
      {/* Import Box */}
      <div style={st.importBox}>
        <h3 style={st.importTitle}>📥 Import Subjects from Excel</h3>
        <div style={st.importActions}>
          <button style={st.templateBtn} onClick={downloadTemplate}>⬇️ Download Template</button>
          <label style={{...st.importBtn, opacity: importing?0.6:1}}>
            {importing ? '⏳ Importing...' : '📂 Choose Excel File'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImport} disabled={importing} />
          </label>
        </div>

        <div style={st.hintBox}>
          <p style={st.hint}><strong>Required columns:</strong> subject_code, subject_name, category, <strong>discipline_name</strong>, semester, credits, contact_hours, internal_marks, end_term_marks, total_marks, exam_duration, level_name</p>
          <p style={st.hint}><strong>discipline_name</strong> — e.g. Computer Science, Mathematics, English, History, Commerce, Botany, Zoology etc. This prevents ambiguity in MDC/MIC selection.</p>
          <p style={st.hint}><strong>For MAJOR subjects</strong> → fill faculty_name + programme_name (e.g. Science, BCA)</p>
          <p style={st.hint}><strong>For MDC/MIC/SEC/VAC/AEC</strong> → leave faculty_name and programme_name empty (common for all UG). Only fill discipline_name.</p>
          <p style={st.hint}><strong>Conflict rule:</strong> If student selects Computer Science as MAJOR → cannot select Computer Science MDC/MIC</p>
        </div>

        {importResult && (
          <div style={st.importResult}>
            <p style={{margin:'0 0 0.5rem',fontWeight:'600'}}>
              ✅ Imported: <strong>{importResult.success}</strong>
              {importResult.failed > 0 && <span style={{color:'#c53030'}}> &nbsp;|&nbsp; ❌ Failed: <strong>{importResult.failed}</strong></span>}
            </p>
            {importResult.errors.length > 0 && (
              <details>
                <summary style={{cursor:'pointer',color:'#c53030',fontSize:'0.85rem'}}>View {importResult.errors.length} errors</summary>
                <ul style={{fontSize:'0.8rem',color:'#c53030',marginTop:'0.5rem',maxHeight:'150px',overflowY:'auto'}}>
                  {importResult.errors.map((err,i)=><li key={i}>{err}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Add Form Toggle */}
      <button style={st.toggleBtn} onClick={() => setShowForm(!showForm)}>
        {showForm ? '✕ Close Form' : '➕ Add Subject Manually'}
      </button>

      {showForm && (
        <div style={st.formBox}>
          <h3 style={{margin:'0 0 1rem',color:'#2d3748'}}>➕ Add New Subject</h3>
          <form onSubmit={handleAdd}>
            {/* Programme Section */}
            <div style={st.formSection}>
              <h4 style={st.formSectionTitle}>📚 Programme & Classification</h4>
              <div style={st.formRow}>
                <div style={st.formField}>
                  <label style={st.label}>① Level *</label>
                  <select style={st.input} value={subjectLevel} onChange={e=>{setSubjectLevel(e.target.value);setSubjectFaculty('');setForm({...form,programme_id:''});}} required>
                    <option value="">Select Level</option>
                    {levels.map(l=><option key={l.level_id} value={l.level_id}>{l.level_name}</option>)}
                  </select>
                </div>
                <div style={st.formField}>
                  <label style={st.label}>② Faculty (MAJOR only)</label>
                  <select style={st.input} value={subjectFaculty} onChange={e=>{setSubjectFaculty(e.target.value);setForm({...form,programme_id:'',faculty_id:e.target.value});}} disabled={!subjectLevel}>
                    <option value="">Optional for common subjects</option>
                    {faculties.map(f=><option key={f.faculty_id} value={f.faculty_id}>{f.faculty_name}</option>)}
                  </select>
                </div>
                <div style={st.formField}>
                  <label style={st.label}>③ Programme (MAJOR only)</label>
                  <select style={st.input} value={form.programme_id||''} onChange={e=>setForm({...form,programme_id:e.target.value})} disabled={!subjectFaculty}>
                    <option value="">Leave empty for MDC/MIC/SEC/VAC/AEC</option>
                    {subjectProgrammes.map(p=><option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>)}
                  </select>
                </div>
                <div style={st.formField}>
                  <label style={st.label}>Discipline * (prevents conflict)</label>
                  <select style={st.input} value={form.discipline_id||''} onChange={e=>setForm({...form,discipline_id:e.target.value})} required>
                    <option value="">Select Discipline</option>
                    {disciplines.map(d=><option key={d.discipline_id} value={d.discipline_id}>{d.discipline_name} ({d.faculty_name})</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Subject Details */}
            <div style={st.formSection}>
              <h4 style={st.formSectionTitle}>📝 Subject Details</h4>
              <div style={st.formRow}>
                <div style={st.formField}>
                  <label style={st.label}>Course Code *</label>
                  <input style={st.input} placeholder="e.g. C24CAP101T" value={form.subject_code||''} onChange={e=>setForm({...form,subject_code:e.target.value})} required />
                </div>
                <div style={{...st.formField,flex:2}}>
                  <label style={st.label}>Paper Name *</label>
                  <input style={st.input} placeholder="e.g. Computer Fundamentals" value={form.subject_name||''} onChange={e=>setForm({...form,subject_name:e.target.value})} required />
                </div>
                <div style={st.formField}>
                  <label style={st.label}>Course Type *</label>
                  <select style={st.input} value={form.category||''} onChange={e=>setForm({...form,category:e.target.value})} required>
                    <option value="">Select Type</option>
                    <option value="MAJOR">Discipline Specific (DSC/MAJOR)</option>
                    <option value="MIC">Minor / Vocational (MIC)</option>
                    <option value="MDC">Multidisciplinary (MDC)</option>
                    <option value="SEC">Skill Enhancement (SEC)</option>
                    <option value="VAC">Value Added (VAC)</option>
                    <option value="AEC">Ability Enhancement (AEC)</option>
                  </select>
                </div>
                <div style={st.formField}>
                  <label style={st.label}>Semester *</label>
                  <select style={st.input} value={form.semester||''} onChange={e=>setForm({...form,semester:e.target.value})} required>
                    <option value="">Select</option>
                    {[1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>Sem {n}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Marks */}
            <div style={st.formSection}>
              <h4 style={st.formSectionTitle}>📊 Marks & Hours</h4>
              <div style={st.formRow}>
                {[
                  {label:'Credits *', key:'credits', ph:'3'},
                  {label:'Contact Hours', key:'contact_hours', ph:'3'},
                  {label:'Internal Marks', key:'internal_marks', ph:'20'},
                  {label:'End Term Marks', key:'end_term_marks', ph:'50'},
                  {label:'Total Marks', key:'total_marks', ph:'70'},
                  {label:'Exam Duration (hrs)', key:'exam_duration', ph:'2.5', step:'0.5'},
                ].map(f=>(
                  <div key={f.key} style={st.formField}>
                    <label style={st.label}>{f.label}</label>
                    <input style={st.input} type="number" step={f.step||'1'} placeholder={f.ph}
                      value={form[f.key]||''} onChange={e=>setForm({...form,[f.key]:e.target.value})}
                      required={f.label.includes('*')} />
                  </div>
                ))}
              </div>
            </div>

            <button style={st.addBtn} type="submit">✅ Add Subject</button>
          </form>
        </div>
      )}

      {/* Filter */}
      <div style={st.filterBox}>
        <h3 style={st.filterTitle}>🔍 Filter Subjects</h3>
        <div style={st.filterRow}>
          {[
            {label:'Level', val:filterLevel, set:setFilterLevel, opts:levels.map(l=>({v:l.level_id,l:l.level_name})), all:'All Levels', onChange:(v)=>{setFilterLevel(v);setFilterFaculty('');setFilterProgramme('');}},
            {label:'Faculty', val:filterFaculty, set:setFilterFaculty, opts:faculties.map(f=>({v:f.faculty_id,l:f.faculty_name})), all:filterLevel?'All Faculties':'Select Level', disabled:!filterLevel, onChange:(v)=>{setFilterFaculty(v);setFilterProgramme('');}},
            {label:'Programme', val:filterProgramme, set:setFilterProgramme, opts:filterProgrammes.map(p=>({v:p.programme_id,l:p.programme_name})), all:filterFaculty?'All Programmes':'Select Faculty', disabled:!filterFaculty},
            {label:'Semester', val:filterSemester, set:setFilterSemester, opts:[1,2,3,4,5,6,7,8].map(n=>({v:n,l:`Semester ${n}`})), all:'All Semesters'},
            {label:'Course Type', val:filterCategory, set:setFilterCategory, opts:[
              {v:'MAJOR',l:'DSC/Major'},{v:'MIC',l:'Minor/Vocational'},{v:'MDC',l:'Multidisciplinary'},
              {v:'SEC',l:'Skill Enhancement'},{v:'VAC',l:'Value Added'},{v:'AEC',l:'Ability Enhancement'}
            ], all:'All Types'},
          ].map(f=>(
            <div key={f.label} style={st.filterField}>
              <label style={st.filterLabel}>{f.label}</label>
              <select style={st.filterInput} value={f.val} disabled={f.disabled}
                onChange={e=>{ if(f.onChange) f.onChange(e.target.value); else f.set(e.target.value); }}>
                <option value="">{f.all}</option>
                {f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          ))}
          <div style={st.filterField}>
            <label style={st.filterLabel}>&nbsp;</label>
            <button style={st.clearBtn} onClick={()=>{setFilterLevel('');setFilterFaculty('');setFilterProgramme('');setFilterSemester('');setFilterCategory('');}}>✖ Clear</button>
          </div>
        </div>
        <p style={st.filterCount}>Showing <strong>{filteredSubjects.length}</strong> of <strong>{subjects.length}</strong> subjects</p>
      </div>

      {/* Subject Tables */}
      {Object.keys(groupedBySemester).sort((a,b)=>Number(a)-Number(b)).map(sem => (
        <div key={sem} style={st.semesterBlock}>
          <h3 style={st.semesterTitle}>📅 SEMESTER - {sem}</h3>
          <table style={st.table}>
            <thead>
              <tr>
                {['Course Type','Course Code','Paper Name','Discipline','Credits','Contact Hrs','Internal','End Term','Total','Duration','Teacher','Action'].map(h=>(
                  <th key={h} style={st.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(groupedBySemester[sem]).map(cat =>
                groupedBySemester[sem][cat].map((sub, idx) => (
                  <tr key={sub.subject_id} style={{background:idx%2===0?'#fff':'#f9fafb'}}>
                    {idx === 0 ? (
                      <td style={{...st.td, background:(categoryColors[cat]||'#667eea')+'22', color:categoryColors[cat]||'#667eea', fontWeight:'700', borderRight:'2px solid #e2e8f0', textAlign:'center', verticalAlign:'middle'}}
                        rowSpan={groupedBySemester[sem][cat].length}>
                        {categoryLabels[cat]||cat}
                      </td>
                    ) : null}
                    <td style={{...st.td, fontFamily:'monospace', fontWeight:'600', fontSize:'0.78rem'}}>{sub.subject_code}</td>
                    <td style={st.td}>{sub.subject_name}</td>
                    <td style={st.td}>
                      {sub.discipline_name
                        ? <span style={{padding:'0.15rem 0.5rem', borderRadius:'999px', background:'#ebf8ff', color:'#2b6cb0', fontSize:'0.75rem', fontWeight:'600'}}>{sub.discipline_name}</span>
                        : <span style={{color:'#e53e3e', fontSize:'0.75rem'}}>⚠️ Not set</span>
                      }
                    </td>
                    <td style={{...st.td, textAlign:'center'}}>{sub.credits}</td>
                    <td style={{...st.td, textAlign:'center'}}>{sub.contact_hours||'-'}</td>
                    <td style={{...st.td, textAlign:'center'}}>{sub.internal_marks||'-'}</td>
                    <td style={{...st.td, textAlign:'center'}}>{sub.end_term_marks||'-'}</td>
                    <td style={{...st.td, textAlign:'center', fontWeight:'700'}}>{sub.total_marks||'-'}</td>
                    <td style={{...st.td, textAlign:'center'}}>{sub.exam_duration?`${sub.exam_duration}h`:'-'}</td>
                    <td style={st.td}>
                      <div style={{display:'flex', flexWrap:'wrap', gap:'0.3rem', marginBottom:'0.3rem'}}>
                        {(subjectTeachers[sub.subject_id] || []).map(t => (
                          <span key={t.teacher_id} style={{display:'inline-flex', alignItems:'center', gap:'0.25rem', background:'#ebf8ff', color:'#2b6cb0', borderRadius:'999px', padding:'0.15rem 0.5rem', fontSize:'0.72rem', fontWeight:'600'}}>
                            {t.name}{t.section && t.section !== 'A' ? ` (${t.section})` : ''}
                            <button onClick={() => handleRemoveTeacher(sub.subject_id, t.teacher_id)}
                              style={{background:'none', border:'none', color:'#e53e3e', cursor:'pointer', fontSize:'0.7rem', padding:0, lineHeight:1}}>✕</button>
                          </span>
                        ))}
                      </div>
                      <select
                        style={{...st.input, padding:'0.25rem 0.4rem', fontSize:'0.75rem'}}
                        value=""
                        onChange={e => handleAssignTeacher(sub.subject_id, e.target.value)}
                      >
                        <option value="">+ Add teacher…</option>
                        {teachers
                          .filter(t => !(subjectTeachers[sub.subject_id] || []).some(st => st.teacher_id === t.teacher_id))
                          .map(t => <option key={t.teacher_id} value={t.teacher_id}>{t.name}</option>)}
                      </select>
                    </td>
                    <td style={st.td}>
                      <button style={st.delBtn} onClick={()=>handleDelete(sub.subject_id)}>✕</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ))}

      {filteredSubjects.length === 0 && (
        <div style={st.emptyState}>📭 No subjects found. Import from Excel or add manually.</div>
      )}
    </div>
  );
}

const st = {
  importBox: { background:'#fff', border:'2px dashed #4c51bf', borderRadius:'12px', padding:'1.5rem', marginBottom:'1.5rem' },
  importTitle: { color:'#4c51bf', marginTop:0, marginBottom:'1rem' },
  importActions: { display:'flex', gap:'1rem', marginBottom:'0.75rem', flexWrap:'wrap' },
  templateBtn: { padding:'0.6rem 1.2rem', background:'#ebf8ff', color:'#2b6cb0', border:'1px solid #90cdf4', borderRadius:'6px', cursor:'pointer', fontWeight:'600' },
  importBtn: { padding:'0.6rem 1.2rem', background:'#4c51bf', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'600' },
  hintBox: { background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:'8px', padding:'0.75rem 1rem', marginTop:'0.5rem' },
  hint: { color:'#78350f', fontSize:'0.82rem', margin:'0.2rem 0' },
  importResult: { marginTop:'1rem', background:'#f0fff4', padding:'0.75rem 1rem', borderRadius:'8px', border:'1px solid #9ae6b4' },
  toggleBtn: { padding:'0.7rem 1.5rem', background:'#4c51bf', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'600', marginBottom:'1rem' },
  formBox: { background:'#fff', padding:'1.5rem', borderRadius:'12px', marginBottom:'1.5rem', boxShadow:'0 2px 8px rgba(0,0,0,0.08)' },
  formSection: { marginBottom:'1rem', padding:'1rem', background:'#f7fafc', borderRadius:'8px' },
  formSectionTitle: { margin:'0 0 0.75rem', color:'#4a5568', fontSize:'0.82rem', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.05em' },
  formRow: { display:'flex', flexWrap:'wrap', gap:'0.75rem' },
  formField: { display:'flex', flexDirection:'column', gap:'0.3rem', flex:1, minWidth:'150px' },
  label: { fontSize:'0.78rem', fontWeight:'600', color:'#4a5568' },
  input: { padding:'0.6rem 0.9rem', borderRadius:'6px', border:'1px solid #cbd5e0', fontSize:'0.9rem', width:'100%', boxSizing:'border-box' },
  addBtn: { padding:'0.75rem 2rem', background:'#48bb78', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'700', fontSize:'1rem', marginTop:'0.5rem' },
  filterBox: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', padding:'1.5rem', marginBottom:'1.5rem', boxShadow:'0 2px 8px rgba(0,0,0,0.05)' },
  filterTitle: { color:'#2d3748', marginTop:0, marginBottom:'1rem' },
  filterRow: { display:'flex', gap:'0.75rem', flexWrap:'wrap', alignItems:'flex-end' },
  filterField: { display:'flex', flexDirection:'column', gap:'0.3rem', minWidth:'140px' },
  filterLabel: { fontSize:'0.78rem', fontWeight:'600', color:'#4a5568' },
  filterInput: { padding:'0.6rem 0.9rem', borderRadius:'6px', border:'1px solid #cbd5e0', fontSize:'0.85rem', background:'#f7fafc' },
  filterCount: { margin:'0.75rem 0 0', fontSize:'0.85rem', color:'#4a5568' },
  clearBtn: { padding:'0.6rem 1rem', background:'#fed7d7', color:'#c53030', border:'1px solid #fc8181', borderRadius:'6px', cursor:'pointer', fontWeight:'600' },
  semesterBlock: { marginBottom:'2rem' },
  semesterTitle: { background:'#2d3748', color:'#fff', padding:'0.75rem 1.5rem', borderRadius:'8px 8px 0 0', margin:0, fontSize:'1rem' },
  table: { width:'100%', borderCollapse:'collapse', background:'#fff', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', borderRadius:'0 0 8px 8px', overflow:'hidden' },
  th: { background:'#4a5568', color:'#fff', padding:'0.65rem 0.75rem', textAlign:'left', fontSize:'0.78rem', fontWeight:'600', borderRight:'1px solid #718096' },
  td: { padding:'0.6rem 0.75rem', borderBottom:'1px solid #e2e8f0', fontSize:'0.82rem', borderRight:'1px solid #f0f4f8', verticalAlign:'middle' },
  delBtn: { background:'#e53e3e', color:'#fff', border:'none', padding:'0.25rem 0.5rem', borderRadius:'4px', cursor:'pointer', fontSize:'0.8rem' },
  emptyState: { background:'#fff', padding:'3rem', textAlign:'center', borderRadius:'12px', color:'#718096', fontSize:'1.1rem' },
};
