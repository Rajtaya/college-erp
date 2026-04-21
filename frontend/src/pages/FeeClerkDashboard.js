import React, { useState, useEffect } from 'react';
import API from '../api';

const FEE_TYPES = ['Tuition Fee','Exam Fee','Library Fee','Hostel Fee','Transport Fee','Registration Fee','Development Fee','Lab Fee','Other'];

export default function FeeClerkDashboard({ feeClerk, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState({});
  const [fees, setFees] = useState([]);
  const [structure, setStructure] = useState([]);
  const [defaulters, setDefaulters] = useState([]);
  const [progReport, setProgReport] = useState([]);
  const [typeReport, setTypeReport] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProg, setFilterProg] = useState('');

  // Add structure form
  const [showStructureForm, setShowStructureForm] = useState(false);
  const [structureForm, setStructureForm] = useState({ academic_year_id:'', programme_id:'', level_id:'', fee_type:'', amount:'', due_date:'' });

  // Collect payment modal
  const [collectModal, setCollectModal] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [referenceDetails, setReferenceDetails] = useState('');

  // Waive modal
  const [waiveModal, setWaiveModal] = useState(null);
  const [waiveReason, setWaiveReason] = useState('');

  // Cashier session
  const [session, setSession] = useState(null);
  const [openingNotes, setOpeningNotes] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  // Search student
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentFees, setStudentFees] = useState([]);

  // Add individual fee
  const [showAddFee, setShowAddFee] = useState(false);
  const [addFeeForm, setAddFeeForm] = useState({ student_id:'', amount:'', fee_type:'', due_date:'', academic_year_id:'' });

  const showMsg = (m, t='success') => { setMsg(m); setMsgType(t); setTimeout(() => setMsg(''), 4000); };

  useEffect(() => {
    fetchProgrammes();
    fetchAcademicYears();
    fetchSession();
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') fetchStats();
    if (activeTab === 'fees') fetchFees();
    if (activeTab === 'structure') fetchStructure();
    if (activeTab === 'defaulters') fetchDefaulters();
    if (activeTab === 'reports') { fetchProgReport(); fetchTypeReport(); }
  }, [activeTab]);

  const fetchStats = async () => { try { const r = await API.get('/fee-clerks/stats'); setStats(r.data); } catch(e){} };
  const fetchFees = async () => { setLoading(true); try { const params = new URLSearchParams(); if(filterStatus) params.set('status',filterStatus); if(filterProg) params.set('programme_id',filterProg); const r = await API.get('/fee-clerks/fees?'+params); setFees(r.data); } catch(e){} finally { setLoading(false); } };
  const fetchStructure = async () => { setLoading(true); try { const r = await API.get('/fee-clerks/structure'); setStructure(r.data); } catch(e){} finally { setLoading(false); } };
  const fetchDefaulters = async () => { setLoading(true); try { const r = await API.get('/fee-clerks/defaulters'); setDefaulters(r.data); } catch(e){} finally { setLoading(false); } };
  const fetchProgReport = async () => { try { const r = await API.get('/fee-clerks/reports/programme'); setProgReport(r.data); } catch(e){} };
  const fetchTypeReport = async () => { try { const r = await API.get('/fee-clerks/reports/fee-type'); setTypeReport(r.data); } catch(e){} };
  const fetchProgrammes = async () => { try { const r = await API.get('/fee-clerks/programmes'); setProgrammes(r.data); } catch(e){} };
  const fetchAcademicYears = async () => { try { const r = await API.get('/fee-clerks/academic-years'); setAcademicYears(r.data); } catch(e){} };
  const fetchSession = async () => { try { const r = await API.get('/fee-clerks/session/current'); setSession(r.data.session); } catch(e){} };

  const openSession = async () => {
    try {
      await API.post('/fee-clerks/session/open', { opening_notes: openingNotes || undefined });
      setOpeningNotes(''); showMsg('Session opened'); fetchSession();
    } catch(e) { showMsg(e.response?.data?.error || 'Failed to open session', 'error'); }
  };

  const closeSession = async () => {
    if (!window.confirm('Close session? Make sure you have handed over cash and tallied totals.')) return;
    try {
      const r = await API.post('/fee-clerks/session/close', { closing_notes: closingNotes || undefined });
      setClosingNotes('');
      showMsg(`Session closed. Cash: ₹${r.data.summary.total_cash}, UPI: ₹${r.data.summary.total_upi}, Receipts: ${r.data.summary.receipt_count}`);
      fetchSession();
    } catch(e) { showMsg(e.response?.data?.error || 'Failed to close session', 'error'); }
  };
  useEffect(() => { if(activeTab === 'fees') fetchFees(); }, [filterStatus, filterProg]);

  // Search student
  const handleStudentSearch = async () => {
    if (!studentSearch.trim()) return;
    try { const r = await API.get('/fee-clerks/search?q=' + encodeURIComponent(studentSearch)); setStudentResults(r.data); } catch(e){}
  };

  const selectStudent = async (s) => {
    setSelectedStudent(s); setStudentResults([]);
    try {
      const r = await API.get('/fee-clerks/student/' + s.student_id);
      // Attach student name/roll so Collect/Waive modals can show them
      const feesWithInfo = r.data.map(f => ({
        ...f,
        roll_no: s.roll_no,
        student_name: s.student_name
      }));
      setStudentFees(feesWithInfo);
    } catch(e){}
  };

  // Collect payment
// Collect payment
  const handleCollect = async () => {
    if (!collectModal) return;
    if (!session) return showMsg('Open a cashier session first', 'error');
    try {
      await API.put('/fee-clerks/collect/' + collectModal.fee_id, {
        payment_method: paymentMethod,
        reference_details: referenceDetails || undefined
      });
      showMsg(`Payment collected via ${paymentMethod}`);
      setCollectModal(null); setPaymentMethod('CASH'); setReferenceDetails('');
      fetchFees(); fetchStats(); fetchSession();
      if (selectedStudent) selectStudent(selectedStudent);
    } catch(e) { showMsg(e.response?.data?.error || 'Failed', 'error'); }
  };

  // Waive fee
// Open waive modal
  const handleWaive = (fee) => {
    if (!session) return showMsg('Open a cashier session first', 'error');
    setWaiveModal(fee); setWaiveReason('');
  };

  // Confirm waive
  const confirmWaive = async () => {
    if (!waiveModal) return;
    if (waiveReason.trim().length < 10) return showMsg('Reason must be at least 10 characters', 'error');
    try {
      await API.put('/fee-clerks/waive/' + waiveModal.fee_id, { reason: waiveReason.trim() });
      showMsg('Fee waived');
      setWaiveModal(null); setWaiveReason('');
      fetchFees(); fetchStats(); fetchSession();
      if (selectedStudent) selectStudent(selectedStudent);
    } catch(e) { showMsg(e.response?.data?.error || 'Failed', 'error'); }
  };

  // Add structure
  const handleAddStructure = async () => {
    const { academic_year_id, programme_id, fee_type, amount } = structureForm;
    if (!academic_year_id || !programme_id || !fee_type || !amount) return showMsg('All fields required', 'error');
    const prog = programmes.find(p => p.programme_id === Number(programme_id));
    try {
      await API.post('/fee-clerks/structure', { ...structureForm, level_id: prog?.level_id || 1 });
      showMsg('Structure added'); setShowStructureForm(false);
      setStructureForm({ academic_year_id:'', programme_id:'', level_id:'', fee_type:'', amount:'', due_date:'' });
      fetchStructure();
    } catch(e) { showMsg(e.response?.data?.error || 'Failed', 'error'); }
  };

  // Delete structure
  const handleDeleteStructure = async (id) => {
    if (!window.confirm('Delete this fee structure?')) return;
    try { await API.delete('/fee-clerks/structure/' + id); showMsg('Deleted'); fetchStructure(); }
    catch(e) { showMsg('Failed', 'error'); }
  };

  // Generate fees from structure
  const handleGenerate = async (id) => {
    if (!window.confirm('Generate fee records for all students in this programme?')) return;
    try { const r = await API.post('/fee-clerks/generate', { fee_structure_id: id }); showMsg(`${r.data.message} (Generated: ${r.data.generated}, Skipped: ${r.data.skipped})`); fetchFees(); fetchStats(); }
    catch(e) { showMsg(e.response?.data?.error || 'Failed', 'error'); }
  };

  // Add individual fee
  const handleAddFee = async () => {
    const { student_id, amount, fee_type, due_date } = addFeeForm;
    if (!student_id || !amount || !fee_type || !due_date) return showMsg('All fields required', 'error');
    try { await API.post('/fee-clerks/fees', addFeeForm); showMsg('Fee added'); setShowAddFee(false); setAddFeeForm({ student_id:'', amount:'', fee_type:'', due_date:'', academic_year_id:'' }); fetchFees(); fetchStats(); if(selectedStudent) selectStudent(selectedStudent); }
    catch(e) { showMsg(e.response?.data?.error || 'Failed', 'error'); }
  };

  const filterData = (data) => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
  };

  const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

  const tabs = [
    { id:'overview', label:'📊 Overview' },
    { id:'fees', label:'💰 All Fees' },
    { id:'structure', label:'📋 Fee Structure' },
    { id:'collect', label:'🔍 Collect / Search' },
    { id:'defaulters', label:'⚠️ Defaulters' },
    { id:'reports', label:'📈 Reports' },
  ];

  return (
    <div style={st.container}>
      {msg && <div style={{...st.popup, background: msgType==='error'?'#fed7d7':msgType==='warning'?'#fefcbf':'#c6f6d5', color: msgType==='error'?'#c53030':msgType==='warning'?'#92400e':'#276749'}}>{msg}</div>}

      <header style={{...st.header, background:'linear-gradient(135deg, #d69e2e, #975a16)'}} className="erp-gradient-header">
        <div>
          <h1 style={st.headerTitle}>💰 Fee Management</h1>
          <p style={st.headerSub}>{feeClerk.first_name} {feeClerk.last_name} · {feeClerk.scope === 'FACULTY' ? feeClerk.faculty_name : 'All Faculties'}</p>
        </div>
        <button style={st.logoutBtn} onClick={onLogout}>Logout</button>
      </header>

      <div style={st.tabs} className="erp-tabs">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{...st.tab, ...(activeTab===t.id ? {...st.activeTab, color:'#d69e2e', borderBottomColor:'#d69e2e'} : {})}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CASHIER SESSION BAR ──────────────────────────────── */}
      <div style={{
        padding:'0.75rem 2rem', background: session ? '#c6f6d5' : '#fed7d7',
        borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center',
        justifyContent:'space-between', gap:'1rem', flexWrap:'wrap'
      }}>
        {session ? (
          <>
            <div style={{fontSize:'0.85rem', color:'#276749'}}>
              <strong>✅ Session OPEN</strong> · Opened: {new Date(session.opened_at).toLocaleString()}
              {' · '}Cash ₹{fmt(session.total_cash)} · UPI ₹{fmt(session.total_upi)} ·
              {' '}NEFT ₹{fmt(session.total_neft_rtgs)} · Card ₹{fmt(session.total_card)} ·
              {' '}<strong>Total ₹{fmt(session.total_collected)}</strong> ({session.receipt_count} receipts)
              {Number(session.total_waived) > 0 && <> · Waived ₹{fmt(session.total_waived)}</>}
            </div>
            <div style={{display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap'}}>
              <input style={{...st.searchInput, fontSize:'0.8rem'}}
                placeholder="Closing notes (optional)"
                value={closingNotes} onChange={e => setClosingNotes(e.target.value)} />
              <button style={{...st.actionBtn, background:'#c53030'}} onClick={closeSession}>🔒 Close Session</button>
            </div>
          </>
        ) : (
          <>
            <div style={{fontSize:'0.85rem', color:'#c53030'}}>
              <strong>🔴 No active session.</strong> Open a session to collect payments or waive fees.
            </div>
            <div style={{display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap'}}>
              <input style={{...st.searchInput, fontSize:'0.8rem'}}
                placeholder="Opening notes (optional)"
                value={openingNotes} onChange={e => setOpeningNotes(e.target.value)} />
              <button style={{...st.actionBtn, background:'#38a169'}} onClick={openSession}>🔓 Open Session</button>
            </div>
          </>
        )}
      </div>

      <div style={st.content} className="erp-content">

        {/* ── OVERVIEW ─────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            <div style={st.statsGrid} className="erp-stats-grid">
              {[
                { label:'Total Students', value:stats.totalStudents, icon:'👥', bg:'#ebf8ff', color:'#2b6cb0' },
                { label:'Total Fees', value:`₹${fmt(stats.totalAmount)}`, icon:'💰', bg:'#fefcbf', color:'#975a16' },
                { label:'Collected', value:`₹${fmt(stats.paidAmount)}`, icon:'✅', bg:'#c6f6d5', color:'#276749' },
                { label:'Pending', value:`₹${fmt(stats.pendingAmount)}`, icon:'⏳', bg:'#feebc8', color:'#c05621' },
                { label:'Overdue', value:`₹${fmt(stats.overdueAmount)}`, icon:'🚨', bg:'#fed7d7', color:'#c53030' },
              ].map((c, i) => (
                <div key={i} style={{...st.statCard, background:c.bg}}>
                  <span style={{fontSize:'2rem'}}>{c.icon}</span>
                  <div>
                    <div style={{fontSize:'0.8rem', color:'#718096'}}>{c.label}</div>
                    <div style={{fontSize:'1.4rem', fontWeight:'700', color:c.color}}>{c.value}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={st.statsGrid} className="erp-stats-grid">
              {[
                { label:'Paid Records', value:stats.paidCount || 0, color:'#276749' },
                { label:'Pending Records', value:stats.pendingCount || 0, color:'#c05621' },
                { label:'Overdue Records', value:stats.overdueCount || 0, color:'#c53030' },
                { label:'Collection %', value: stats.totalAmount > 0 ? `${((stats.paidAmount/stats.totalAmount)*100).toFixed(1)}%` : '—', color:'#2b6cb0' },
              ].map((c, i) => (
                <div key={i} style={st.statCard}>
                  <div>
                    <div style={{fontSize:'0.8rem', color:'#718096'}}>{c.label}</div>
                    <div style={{fontSize:'1.3rem', fontWeight:'700', color:c.color}}>{c.value}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={st.card} className="erp-card">
              <h3 style={{margin:'0 0 0.5rem'}}>Quick Actions</h3>
              <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
                <button style={{...st.actionBtn, background:'#d69e2e'}} onClick={() => setActiveTab('collect')}>🔍 Search & Collect</button>
                <button style={{...st.actionBtn, background:'#e53e3e'}} onClick={() => setActiveTab('defaulters')}>⚠️ View Defaulters</button>
                <button style={{...st.actionBtn, background:'#4c51bf'}} onClick={() => setActiveTab('structure')}>📋 Manage Structure</button>
                <button style={{...st.actionBtn, background:'#38a169'}} onClick={() => setActiveTab('reports')}>📈 Reports</button>
              </div>
            </div>
          </>
        )}

        {/* ── ALL FEES ─────────────────────────────────────────── */}
        {activeTab === 'fees' && (
          <div style={st.card} className="erp-card">
            <div style={st.cardHeader} className="erp-card-header">
              <h3 style={{margin:0}}>💰 All Fee Records</h3>
              <div style={{display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap'}}>
                <select style={st.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">All Status</option>
                  <option value="PAID">Paid</option>
                  <option value="PENDING">Pending</option>
                  <option value="OVERDUE">Overdue</option>
                </select>
                <select style={st.select} value={filterProg} onChange={e => setFilterProg(e.target.value)}>
                  <option value="">All Programmes</option>
                  {programmes.map(p => <option key={p.programme_id} value={p.programme_id}>{p.programme_name}</option>)}
                </select>
                <input style={st.searchInput} placeholder="🔍 Search..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            {loading ? <p>Loading...</p> : (
              <div style={st.tableWrap} className="erp-table-wrap">
                <table style={st.table}>
                  <thead>
                    <tr>{['Roll No','Name','Programme','Sem','Fee Type','Amount','Status','Due Date','Paid Date','Txn Ref','Action'].map(h =>
                      <th key={h} style={st.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filterData(fees).length === 0 ? <tr><td colSpan={11} style={{textAlign:'center',padding:'2rem',color:'#a0aec0'}}>No records</td></tr> :
                    filterData(fees).map(f => (
                      <tr key={f.fee_id} style={st.tr}>
                        <td style={{...st.td, fontFamily:'monospace', fontWeight:'700'}}>{f.roll_no}</td>
                        <td style={st.td}>{f.student_name}</td>
                        <td style={st.td}>{f.programme_name}</td>
                        <td style={{...st.td, textAlign:'center'}}>{f.semester}</td>
                        <td style={st.td}>{f.fee_type}</td>
                        <td style={{...st.td, textAlign:'right', fontWeight:'600'}}>₹{fmt(f.amount)}</td>
                        <td style={{...st.td, textAlign:'center'}}>
                          <span style={{...st.badge, background: f.status==='PAID'?'#c6f6d5':f.status==='OVERDUE'?'#fed7d7':'#fefcbf',
                            color: f.status==='PAID'?'#276749':f.status==='OVERDUE'?'#c53030':'#92400e'}}>
                            {f.status}
                          </span>
                        </td>
                        <td style={st.td}>{f.due_date?.split('T')[0]}</td>
                        <td style={st.td}>{f.paid_date?.split('T')[0] || '—'}</td>
                        <td style={{...st.td, fontFamily:'monospace', fontSize:'0.75rem'}}>{f.transaction_ref || '—'}</td>
                        <td style={st.td}>
                          {f.status !== 'PAID' && (
                            <div style={{display:'flex', gap:'4px'}}>
                              <button style={{...st.smallBtn, background:'#38a169'}} onClick={() => { setCollectModal(f); setTxnRef(''); }}>Collect</button>
                              <button style={{...st.smallBtn, background:'#e53e3e'}} onClick={() => handleWaive(f)}>Waive</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── FEE STRUCTURE ────────────────────────────────────── */}
        {activeTab === 'structure' && (
          <div style={st.card} className="erp-card">
            <div style={st.cardHeader} className="erp-card-header">
              <h3 style={{margin:0}}>📋 Fee Structure</h3>
              <button style={{...st.actionBtn, background:'#4c51bf'}} onClick={() => setShowStructureForm(!showStructureForm)}>
                {showStructureForm ? '✕ Cancel' : '+ Add Structure'}
              </button>
            </div>

            {showStructureForm && (
              <div style={st.formGrid} className="erp-form-grid erp-form-grid-3">
                <select style={st.formInput} value={structureForm.academic_year_id} onChange={e => setStructureForm({...structureForm, academic_year_id: e.target.value})}>
                  <option value="">Academic Year</option>
                  {academicYears.map(a => <option key={a.academic_year_id} value={a.academic_year_id}>{a.year_label}{a.is_current?' (Current)':''}</option>)}
                </select>
                <select style={st.formInput} value={structureForm.programme_id} onChange={e => setStructureForm({...structureForm, programme_id: e.target.value})}>
                  <option value="">Programme</option>
                  {programmes.map(p => <option key={p.programme_id} value={p.programme_id}>{p.programme_name} ({p.level_name})</option>)}
                </select>
                <select style={st.formInput} value={structureForm.fee_type} onChange={e => setStructureForm({...structureForm, fee_type: e.target.value})}>
                  <option value="">Fee Type</option>
                  {FEE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input style={st.formInput} type="number" placeholder="Amount (₹)" value={structureForm.amount} onChange={e => setStructureForm({...structureForm, amount: e.target.value})} />
                <input style={st.formInput} type="date" value={structureForm.due_date} onChange={e => setStructureForm({...structureForm, due_date: e.target.value})} />
                <button style={{...st.actionBtn, background:'#38a169'}} onClick={handleAddStructure}>✅ Save</button>
              </div>
            )}

            {loading ? <p>Loading...</p> : (
              <div style={st.tableWrap} className="erp-table-wrap">
                <table style={st.table}>
                  <thead>
                    <tr>{['Year','Programme','Level','Fee Type','Amount','Due Date','Actions'].map(h => <th key={h} style={st.th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {structure.length === 0 ? <tr><td colSpan={7} style={{textAlign:'center',padding:'2rem',color:'#a0aec0'}}>No fee structures defined</td></tr> :
                    structure.map(s => (
                      <tr key={s.fee_structure_id} style={st.tr}>
                        <td style={st.td}>{s.year_label}</td>
                        <td style={st.td}>{s.programme_name}</td>
                        <td style={st.td}>{s.level_name}</td>
                        <td style={st.td}>{s.fee_type}</td>
                        <td style={{...st.td, textAlign:'right', fontWeight:'600'}}>₹{fmt(s.amount)}</td>
                        <td style={st.td}>{s.due_date?.split('T')[0] || '—'}</td>
                        <td style={st.td}>
                          <div style={{display:'flex', gap:'4px'}}>
                            <button style={{...st.smallBtn, background:'#38a169'}} onClick={() => handleGenerate(s.fee_structure_id)}>⚡ Generate</button>
                            <button style={{...st.smallBtn, background:'#e53e3e'}} onClick={() => handleDeleteStructure(s.fee_structure_id)}>🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── COLLECT / SEARCH ─────────────────────────────────── */}
        {activeTab === 'collect' && (
          <>
            <div style={st.card} className="erp-card">
              <h3 style={{margin:'0 0 1rem'}}>🔍 Search Student</h3>
              <div style={{display:'flex', gap:'8px', marginBottom:'1rem'}}>
                <input style={{...st.searchInput, flex:1}} placeholder="Search by roll no, name, or email..."
                  value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleStudentSearch()} />
                <button style={{...st.actionBtn, background:'#d69e2e'}} onClick={handleStudentSearch}>Search</button>
                <button style={{...st.actionBtn, background:'#4c51bf'}} onClick={() => { setShowAddFee(!showAddFee); }}>
                  {showAddFee ? '✕ Cancel' : '+ Add Fee'}
                </button>
              </div>

              {showAddFee && (
                <div style={{...st.formGrid, marginBottom:'1rem', padding:'1rem', background:'#f7fafc', borderRadius:'8px'}}>
                  <input style={st.formInput} placeholder="Student ID" value={addFeeForm.student_id}
                    onChange={e => setAddFeeForm({...addFeeForm, student_id: e.target.value})} />
                  <select style={st.formInput} value={addFeeForm.fee_type} onChange={e => setAddFeeForm({...addFeeForm, fee_type: e.target.value})}>
                    <option value="">Fee Type</option>
                    {FEE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input style={st.formInput} type="number" placeholder="Amount (₹)" value={addFeeForm.amount}
                    onChange={e => setAddFeeForm({...addFeeForm, amount: e.target.value})} />
                  <input style={st.formInput} type="date" value={addFeeForm.due_date}
                    onChange={e => setAddFeeForm({...addFeeForm, due_date: e.target.value})} />
                  <select style={st.formInput} value={addFeeForm.academic_year_id} onChange={e => setAddFeeForm({...addFeeForm, academic_year_id: e.target.value})}>
                    <option value="">Academic Year</option>
                    {academicYears.map(a => <option key={a.academic_year_id} value={a.academic_year_id}>{a.year_label}</option>)}
                  </select>
                  <button style={{...st.actionBtn, background:'#38a169'}} onClick={handleAddFee}>✅ Add Fee</button>
                </div>
              )}

              {studentResults.length > 0 && (
                <div style={st.tableWrap} className="erp-table-wrap">
                  <table style={st.table}>
                    <thead><tr>{['Roll No','Name','Programme','Sem','Phone','Email',''].map(h => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {studentResults.map(s => (
                        <tr key={s.student_id} style={{...st.tr, cursor:'pointer'}} onClick={() => { selectStudent(s); setAddFeeForm({...addFeeForm, student_id: s.student_id}); }}>
                          <td style={{...st.td, fontFamily:'monospace', fontWeight:'700'}}>{s.roll_no}</td>
                          <td style={st.td}>{s.student_name}</td>
                          <td style={st.td}>{s.programme_name}</td>
                          <td style={{...st.td, textAlign:'center'}}>{s.semester}</td>
                          <td style={st.td}>{s.phone || '—'}</td>
                          <td style={st.td}>{s.email || '—'}</td>
                          <td style={st.td}><button style={{...st.smallBtn, background:'#d69e2e'}}>Select</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedStudent && (
              <div style={st.card} className="erp-card">
                <div style={st.cardHeader} className="erp-card-header">
                  <div>
                    <h3 style={{margin:0}}>{selectedStudent.student_name}</h3>
                    <p style={{margin:'0.25rem 0 0', color:'#718096', fontSize:'0.85rem'}}>
                      {selectedStudent.roll_no} · {selectedStudent.programme_name} · Sem {selectedStudent.semester}
                    </p>
                  </div>
                  <button style={{...st.smallBtn, background:'#a0aec0'}} onClick={() => { setSelectedStudent(null); setStudentFees([]); }}>✕ Close</button>
                </div>
                <div style={st.tableWrap} className="erp-table-wrap">
                  <table style={st.table}>
                    <thead><tr>{['Fee Type','Amount','Status','Due Date','Paid Date','Txn Ref','Year','Action'].map(h => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {studentFees.length === 0 ? <tr><td colSpan={8} style={{textAlign:'center', padding:'1.5rem', color:'#a0aec0'}}>No fees</td></tr> :
                      studentFees.map(f => (
                        <tr key={f.fee_id} style={st.tr}>
                          <td style={st.td}>{f.fee_type}</td>
                          <td style={{...st.td, textAlign:'right', fontWeight:'600'}}>₹{fmt(f.amount)}</td>
                          <td style={{...st.td, textAlign:'center'}}>
                            <span style={{...st.badge, background: f.status==='PAID'?'#c6f6d5':f.status==='OVERDUE'?'#fed7d7':'#fefcbf',
                              color: f.status==='PAID'?'#276749':f.status==='OVERDUE'?'#c53030':'#92400e'}}>{f.status}</span>
                          </td>
                          <td style={st.td}>{f.due_date?.split('T')[0]}</td>
                          <td style={st.td}>{f.paid_date?.split('T')[0] || '—'}</td>
                          <td style={{...st.td, fontFamily:'monospace', fontSize:'0.75rem'}}>{f.transaction_ref || '—'}</td>
                          <td style={st.td}>{f.year_label || '—'}</td>
                          <td style={st.td}>
                            {f.status !== 'PAID' && (
                              <div style={{display:'flex', gap:'4px'}}>
                                <button style={{...st.smallBtn, background:'#38a169'}} onClick={() => { setCollectModal(f); setTxnRef(''); }}>Collect</button>
                                <button style={{...st.smallBtn, background:'#e53e3e'}} onClick={() => handleWaive(f)}>Waive</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── DEFAULTERS ───────────────────────────────────────── */}
        {activeTab === 'defaulters' && (
          <div style={st.card} className="erp-card">
            <div style={st.cardHeader} className="erp-card-header">
              <h3 style={{margin:0}}>⚠️ Defaulters ({defaulters.length})</h3>
              <input style={st.searchInput} placeholder="🔍 Search..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {loading ? <p>Loading...</p> : (
              <div style={st.tableWrap} className="erp-table-wrap">
                <table style={st.table}>
                  <thead><tr>{['Roll No','Name','Programme','Sem','Unpaid Fees','Total Due','Phone','Email'].map(h => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filterData(defaulters).length === 0 ? <tr><td colSpan={8} style={{textAlign:'center', padding:'2rem', color:'#a0aec0'}}>No defaulters 🎉</td></tr> :
                    filterData(defaulters).map((d, i) => (
                      <tr key={i} style={st.tr}>
                        <td style={{...st.td, fontFamily:'monospace', fontWeight:'700'}}>{d.roll_no}</td>
                        <td style={st.td}>{d.student_name}</td>
                        <td style={st.td}>{d.programme_name}</td>
                        <td style={{...st.td, textAlign:'center'}}>{d.semester}</td>
                        <td style={{...st.td, textAlign:'center', fontWeight:'600', color:'#c53030'}}>{d.unpaid_count}</td>
                        <td style={{...st.td, textAlign:'right', fontWeight:'700', color:'#c53030'}}>₹{fmt(d.total_due)}</td>
                        <td style={st.td}>{d.phone || '—'}</td>
                        <td style={st.td}>{d.email || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── REPORTS ──────────────────────────────────────────── */}
        {activeTab === 'reports' && (
          <>
            <div style={st.card} className="erp-card">
              <h3 style={{margin:'0 0 1rem'}}>📈 Programme-wise Collection</h3>
              <div style={st.tableWrap} className="erp-table-wrap">
                <table style={st.table}>
                  <thead><tr>{['Programme','Students','Total','Collected','Pending','Collection %'].map(h => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {progReport.map((r, i) => (
                      <tr key={i} style={st.tr}>
                        <td style={{...st.td, fontWeight:'600'}}>{r.programme_name}</td>
                        <td style={{...st.td, textAlign:'center'}}>{r.students}</td>
                        <td style={{...st.td, textAlign:'right'}}>₹{fmt(r.total)}</td>
                        <td style={{...st.td, textAlign:'right', color:'#276749', fontWeight:'600'}}>₹{fmt(r.collected)}</td>
                        <td style={{...st.td, textAlign:'right', color:'#c53030', fontWeight:'600'}}>₹{fmt(r.pending)}</td>
                        <td style={{...st.td, textAlign:'center', fontWeight:'700',
                          color: r.total > 0 ? ((r.collected/r.total)*100 >= 80 ? '#276749' : (r.collected/r.total)*100 >= 50 ? '#92400e' : '#c53030') : '#a0aec0'}}>
                          {r.total > 0 ? `${((r.collected/r.total)*100).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={st.card} className="erp-card">
              <h3 style={{margin:'0 0 1rem'}}>📊 Fee Type Summary</h3>
              <div style={st.tableWrap} className="erp-table-wrap">
                <table style={st.table}>
                  <thead><tr>{['Fee Type','Records','Total','Collected','Pending','Collection %'].map(h => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {typeReport.map((r, i) => (
                      <tr key={i} style={st.tr}>
                        <td style={{...st.td, fontWeight:'600'}}>{r.fee_type}</td>
                        <td style={{...st.td, textAlign:'center'}}>{r.total_records}</td>
                        <td style={{...st.td, textAlign:'right'}}>₹{fmt(r.total)}</td>
                        <td style={{...st.td, textAlign:'right', color:'#276749', fontWeight:'600'}}>₹{fmt(r.collected)}</td>
                        <td style={{...st.td, textAlign:'right', color:'#c53030', fontWeight:'600'}}>₹{fmt(r.pending)}</td>
                        <td style={{...st.td, textAlign:'center', fontWeight:'700',
                          color: r.total > 0 ? ((r.collected/r.total)*100 >= 80 ? '#276749' : '#c53030') : '#a0aec0'}}>
                          {r.total > 0 ? `${((r.collected/r.total)*100).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── COLLECT PAYMENT MODAL ──────────────────────────────── */}
      {collectModal && (
        <div style={st.modalOverlay} onClick={() => setCollectModal(null)}>
          <div style={st.modal} className="erp-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{margin:'0 0 1rem'}}>💰 Collect Payment</h3>
            <p><strong>{collectModal.roll_no}</strong> — {collectModal.student_name}</p>
            <p>{collectModal.fee_type} · <strong>₹{fmt(collectModal.amount)}</strong></p>
            <div style={{margin:'1rem 0'}}>
              <label style={{display:'block', marginBottom:'0.35rem', fontWeight:'600', fontSize:'0.85rem'}}>Payment Method *</label>
              <select style={st.formInput} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option value="CASH">💵 Cash</option>
                <option value="UPI">📱 UPI</option>
                <option value="NEFT_RTGS">🏦 NEFT / RTGS</option>
                <option value="CARD">💳 Card (POS)</option>
              </select>
            </div>
            <div style={{margin:'1rem 0'}}>
              <label style={{display:'block', marginBottom:'0.35rem', fontWeight:'600', fontSize:'0.85rem'}}>Reference (optional)</label>
              <input style={st.formInput}
                placeholder={
                  paymentMethod === 'UPI' ? 'UPI ref no.' :
                  paymentMethod === 'NEFT_RTGS' ? 'UTR no.' :
                  paymentMethod === 'CARD' ? 'Last 4 digits / approval code' :
                  'Counter receipt no.'
                }
                value={referenceDetails} onChange={e => setReferenceDetails(e.target.value)} />
            </div>
            <div style={{display:'flex', gap:'8px', justifyContent:'flex-end'}}>
              <button style={{...st.actionBtn, background:'#a0aec0'}} onClick={() => setCollectModal(null)}>Cancel</button>
              <button style={{...st.actionBtn, background:'#38a169'}} onClick={handleCollect}>✅ Confirm Payment</button>
            </div>
          </div>
        </div>
      )}

      {/* ── WAIVE FEE MODAL ────────────────────────────────────── */}
      {waiveModal && (
        <div style={st.modalOverlay} onClick={() => setWaiveModal(null)}>
          <div style={st.modal} className="erp-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{margin:'0 0 1rem', color:'#c53030'}}>⚠️ Waive Fee</h3>
            <p><strong>{waiveModal.roll_no}</strong> — {waiveModal.student_name}</p>
            <p>{waiveModal.fee_type} · <strong>₹{fmt(waiveModal.amount)}</strong></p>
            <div style={{margin:'1rem 0'}}>
              <label style={{display:'block', marginBottom:'0.35rem', fontWeight:'600', fontSize:'0.85rem'}}>
                Reason for waiver * <span style={{color:'#718096', fontWeight:'400'}}>(min 10 characters — will be logged)</span>
              </label>
              <textarea style={{...st.formInput, minHeight:'80px', resize:'vertical'}}
                placeholder="e.g. Financial hardship, approved by principal on DD/MM/YYYY"
                value={waiveReason} onChange={e => setWaiveReason(e.target.value)} />
              <small style={{color: waiveReason.trim().length < 10 ? '#c53030' : '#276749'}}>
                {waiveReason.trim().length}/10 characters
              </small>
            </div>
            <div style={{display:'flex', gap:'8px', justifyContent:'flex-end'}}>
              <button style={{...st.actionBtn, background:'#a0aec0'}} onClick={() => setWaiveModal(null)}>Cancel</button>
              <button style={{...st.actionBtn, background:'#e53e3e'}} onClick={confirmWaive}>Confirm Waiver</button>
            </div>
          </div>
        </div>
      )}
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
  statsGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:'1rem', marginBottom:'1rem' },
  statCard: { background:'#fff', borderRadius:'12px', padding:'1.25rem', display:'flex', alignItems:'center', gap:'1rem', boxShadow:'0 1px 3px rgba(0,0,0,0.08)' },
  card: { background:'#fff', borderRadius:'12px', padding:'1.5rem', boxShadow:'0 1px 3px rgba(0,0,0,0.08)', marginBottom:'1.5rem' },
  cardHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'8px' },
  tableWrap: { overflowX:'auto' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' },
  th: { background:'#f7fafc', padding:'0.6rem 0.75rem', textAlign:'left', fontWeight:'600', color:'#4a5568', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' },
  td: { padding:'0.5rem 0.75rem', borderBottom:'1px solid #edf2f7', color:'#2d3748' },
  tr: { transition:'background 0.15s' },
  badge: { padding:'0.2rem 0.6rem', borderRadius:'12px', fontSize:'0.75rem', fontWeight:'700' },
  actionBtn: { color:'#fff', border:'none', padding:'0.5rem 1rem', borderRadius:'8px', cursor:'pointer', fontWeight:'600', fontSize:'0.85rem', whiteSpace:'nowrap' },
  smallBtn: { color:'#fff', border:'none', padding:'0.3rem 0.6rem', borderRadius:'6px', cursor:'pointer', fontSize:'0.75rem', fontWeight:'600' },
  searchInput: { padding:'0.5rem 0.75rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.85rem', outline:'none' },
  select: { padding:'0.5rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.85rem', outline:'none', background:'#fff' },
  formGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:'8px', marginBottom:'1rem' },
  formInput: { padding:'0.5rem 0.75rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.85rem', outline:'none', width:'100%', boxSizing:'border-box' },
  modalOverlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 },
  modal: { background:'#fff', padding:'2rem', borderRadius:'16px', width:'420px', maxWidth:'90vw', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' },
};
