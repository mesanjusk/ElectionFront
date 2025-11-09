import React, { useState } from 'react';
import api from '../api';

export default function AdminUsers() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');
  const [msg, setMsg] = useState('');

  const create = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const { data } = await api.post('/api/admin/users', { email, password, role });
      setMsg('Created: ' + data.user.email + ' (' + data.user.role + ')');
      setEmail(''); setPassword('');
    } catch (e) {
      setMsg(e?.response?.data?.error || 'Error');
    }
  };

  return (
    <div style={{maxWidth:420, margin:'40px auto', display:'grid', gap:10}}>
      <h2>Admin: Create User</h2>
      <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <select value={role} onChange={e=>setRole(e.target.value)}>
        <option value="operator">operator</option>
        <option value="admin">admin</option>
      </select>
      <button onClick={create}>Create</button>
      {msg && <div style={{opacity:0.8}}>{msg}</div>}
    </div>
  );
}
