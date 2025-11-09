import React, { useState } from 'react';
import api from '../api';
import { setToken } from '../auth';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/api/auth/login', { email, password });
      setToken(data.token);
      nav('/');
    } catch (e) {
      setError(e?.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{display:'grid',placeItems:'center',minHeight:'100vh',padding:24}}>
      <form onSubmit={submit} style={{width:320,display:'grid',gap:12}}>
        <h1>Login</h1>
        <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        {error && <div style={{color:'crimson'}}>{error}</div>}
        <button disabled={loading}>{loading ? 'Signing in…' : 'Sign In'}</button>
      </form>
    </div>
  );
}
