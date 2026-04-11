import React, { useState } from 'react';
import API from '../api';

export default function ClerkLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await API.post('/clerks/login', { email, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('role', 'clerk');
      localStorage.setItem('clerk', JSON.stringify(res.data.clerk));
      onLogin(res.data.clerk, 'clerk');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={styles.container} className="erp-login-container">
      <form onSubmit={handleSubmit} style={styles.form} className="erp-login-form">
        <div style={styles.iconWrap}>
          <span style={styles.icon}>📋</span>
        </div>
        <h2 style={styles.title}>Clerk Login</h2>
        <p style={styles.subtitle}>Faculty Office Portal</p>
        {error && <div style={styles.error}>{error}</div>}
        <div style={styles.field}>
          <label style={styles.label}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="clerk.arts@college.com" style={styles.input} required />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Enter password" style={styles.input} required />
        </div>
        <button type="submit" style={styles.btn} disabled={loading}>
          {loading ? '⏳ Logging in...' : '🔐 Login'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
    background:'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  form: { background:'#fff', padding:'2.5rem', borderRadius:'16px', width:'380px',
    boxShadow:'0 20px 60px rgba(0,0,0,0.15)' },
  iconWrap: { textAlign:'center', marginBottom:'0.5rem' },
  icon: { fontSize:'3rem' },
  title: { textAlign:'center', margin:'0 0 0.25rem', color:'#2d3748', fontSize:'1.5rem' },
  subtitle: { textAlign:'center', margin:'0 0 1.5rem', color:'#718096', fontSize:'0.9rem' },
  error: { background:'#fed7d7', color:'#c53030', padding:'0.75rem', borderRadius:'8px',
    marginBottom:'1rem', fontSize:'0.85rem', textAlign:'center' },
  field: { marginBottom:'1rem' },
  label: { display:'block', marginBottom:'0.35rem', fontWeight:'600', color:'#4a5568', fontSize:'0.85rem' },
  input: { width:'100%', padding:'0.7rem', border:'1.5px solid #e2e8f0', borderRadius:'8px',
    fontSize:'0.95rem', outline:'none', boxSizing:'border-box', transition:'border 0.2s',
    ':focus': { borderColor:'#667eea' } },
  btn: { width:'100%', padding:'0.8rem', background:'linear-gradient(135deg, #667eea, #764ba2)',
    color:'#fff', border:'none', borderRadius:'8px', fontSize:'1rem', fontWeight:'600',
    cursor:'pointer', marginTop:'0.5rem' },
};
