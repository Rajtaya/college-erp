import React, { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import TeacherLogin from './pages/TeacherLogin';
import TeacherDashboard from './pages/TeacherDashboard';

export default function App() {
  const [student, setStudent] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [teacher, setTeacher] = useState(null);
  const [mode, setMode] = useState('student');

  useEffect(() => {
    const savedStudent = localStorage.getItem('student');
    const savedAdmin = localStorage.getItem('admin');
    const savedTeacher = localStorage.getItem('teacher');
    if (savedAdmin) { setAdmin(JSON.parse(savedAdmin)); setMode('admin'); }
    else if (savedTeacher) { setTeacher(JSON.parse(savedTeacher)); setMode('teacher'); }
    else if (savedStudent) { setStudent(JSON.parse(savedStudent)); setMode('student'); }
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    setStudent(null); setAdmin(null); setTeacher(null);
  };

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
      <div style={styles.toggle}>
        <button style={{...styles.btn, ...(mode==='student' ? styles.activeStudent : {})}} onClick={() => setMode('student')}>🎓 Student</button>
        <button style={{...styles.btn, ...(mode==='teacher' ? styles.activeTeacher : {})}} onClick={() => setMode('teacher')}>👨‍🏫 Teacher</button>
        <button style={{...styles.btn, ...(mode==='admin' ? styles.activeAdmin : {})}} onClick={() => setMode('admin')}>⚙️ Admin</button>
      </div>
      {mode === 'student' && <Login onLogin={(d) => { setStudent(d); setMode('student'); }} />}
      {mode === 'teacher' && <TeacherLogin onLogin={(d) => { setTeacher(d); setMode('teacher'); }} />}
      {mode === 'admin' && <AdminLogin onLogin={(d) => { setAdmin(d); setMode('admin'); }} />}
    </div>
  );
}

const styles = {
  toggle: { display: 'flex', justifyContent: 'center', gap: '1rem', padding: '1.5rem', background: '#1a202c' },
  btn: { padding: '0.6rem 2rem', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '1rem', background: '#4a5568', color: '#fff' },
  activeStudent: { background: '#4c51bf' },
  activeTeacher: { background: '#38a169' },
  activeAdmin: { background: '#e53e3e' },
};
