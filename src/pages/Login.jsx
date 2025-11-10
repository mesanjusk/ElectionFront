// client/src/pages/Login.jsx
import React, { useState } from 'react';
import { apiLogin, setAuthToken } from '../services/api';
import { pullAll } from '../services/sync';

export default function Login() {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { token } = await apiLogin({ email, password });
      localStorage.setItem('token', token);
      setAuthToken(token);
      let total = 0;
      await pullAll({
        onProgress: ({ total: t }) => {
          total = t;
          setProgress(t);
        },
      });
      alert(`Synced ${total} records to your device. You can now work fully offline.`);
      window.location.href = '/search';
    } catch (err) {
      alert('Login or Sync failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 360, margin: '40px auto', display:'grid', gap:8 }}>
      <h2>Login</h2>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" />
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" />
      <button disabled={loading}>{loading ? 'Syncing…' : 'Login'}</button>
      {loading ? <div>Downloaded: {progress}</div> : null}
    </form>
  );
}
