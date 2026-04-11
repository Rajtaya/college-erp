import React, { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import TeacherLogin from './pages/TeacherLogin';
import TeacherDashboard from './pages/TeacherDashboard';
import ClerkLogin from './pages/ClerkLogin';
import ClerkDashboard from './pages/ClerkDashboard';
import FeeClerkLogin from './pages/FeeClerkLogin';
import FeeClerkDashboard from './pages/FeeClerkDashboard';

export default function App() {
  const [student, setStudent] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [teacher, setTeacher] = useState(null);
  const [clerk, setClerk] = useState(null);
  const [feeClerk, setFeeClerk] = useState(null);
  const [mode, setMode] = useState('student');

  useEffect(() => {
    const savedStudent = localStorage.getItem('student');
    const savedAdmin = localStorage.getItem('admin');
    const savedTeacher = localStorage.getItem('teacher');
    const savedClerk = localStorage.getItem('clerk');
    const savedFeeClerk = localStorage.getItem('feeClerk');
    if (savedFeeClerk) { setFeeClerk(JSON.parse(savedFeeClerk)); setMode('feeClerk'); }
    else if (savedClerk) { setClerk(JSON.parse(savedClerk)); setMode('clerk'); }
    else if (savedAdmin) { setAdmin(JSON.parse(savedAdmin)); setMode('admin'); }
    else if (savedTeacher) { setTeacher(JSON.parse(savedTeacher)); setMode('teacher'); }
    else if (savedStudent) { setStudent(JSON.parse(savedStudent)); setMode('student'); }
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    setStudent(null); setAdmin(null); setTeacher(null); setClerk(null); setFeeClerk(null);
  };

  if (mode === 'feeClerk' && feeClerk) return <FeeClerkDashboard feeClerk={feeClerk} onLogout={handleLogout} />;
  if (mode === 'clerk' && clerk) return <ClerkDashboard clerk={clerk} onLogout={handleLogout} />;
  if (mode === 'admin' && admin) return <AdminDashboard admin={admin} onLogout={handleLogout} />;
  if (mode === 'teacher' && teacher) return <TeacherDashboard teacher={teacher} onLogout={handleLogout} />;
  if (mode === 'student' && student) return <Dashboard student={student} onLogout={handleLogout}
    onStudentUpdate={(updated) => {
      const merged = {...student, ...updated};
      setStudent(merged);
      localStorage.setItem('student', JSON.stringify(merged));
    }} />;

  return (
    <div>
      <div style={styles.toggle} className="erp-login-toggle">
        <button style={{...styles.btn, ...(mode==='student' ? styles.activeStudent : {})}} onClick={() => setMode('student')}>🎓 Student</button>
        <button style={{...styles.btn, ...(mode==='teacher' ? styles.activeTeacher : {})}} onClick={() => setMode('teacher')}>👨‍🏫 Teacher</button>
        <button style={{...styles.btn, ...(mode==='admin' ? styles.activeAdmin : {})}} onClick={() => setMode('admin')}>⚙️ Admin</button>
        <button style={{...styles.btn, ...(mode==='clerk' ? styles.activeClerk : {})}} onClick={() => setMode('clerk')}>📋 Clerk</button>
        <button style={{...styles.btn, ...(mode==='feeClerk' ? styles.activeFeeClerk : {})}} onClick={() => setMode('feeClerk')}>💰 Fee Clerk</button>
      </div>
      {mode === 'student' && <Login onLogin={(d) => { setStudent(d); setMode('student'); }} />}
      {mode === 'teacher' && <TeacherLogin onLogin={(d) => { setTeacher(d); setMode('teacher'); }} />}
      {mode === 'admin' && <AdminLogin onLogin={(d) => { setAdmin(d); setMode('admin'); }} />}
      {mode === 'clerk' && <ClerkLogin onLogin={(d) => { setClerk(d); setMode('clerk'); }} />}
      {mode === 'feeClerk' && <FeeClerkLogin onLogin={(d) => { setFeeClerk(d); setMode('feeClerk'); localStorage.setItem('feeClerk', JSON.stringify(d)); }} />}
    </div>
  );
}

const styles = {
  toggle: { display: 'flex', justifyContent: 'center', gap: '0.75rem', padding: '1.5rem', background: '#1a202c', flexWrap: 'wrap' },
  btn: { padding: '0.6rem 1.5rem', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95rem', background: '#4a5568', color: '#fff' },
  activeStudent: { background: '#4c51bf' },
  activeTeacher: { background: '#38a169' },
  activeAdmin: { background: '#e53e3e' },
  activeClerk: { background: '#764ba2' },
  activeFeeClerk: { background: '#d69e2e' },
};
