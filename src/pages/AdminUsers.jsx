import React, { useState } from 'react';
import api from '../api';

export default function AdminUsers() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');
  const [status, setStatus] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setStatus({ type: '', text: '' });
    setLoading(true);
    try {
      const { data } = await api.post('/api/admin/users', { email, password, role });
      setStatus({ type: 'success', text: `Created ${data.user.email} (${data.user.role})` });
      setEmail('');
      setPassword('');
    } catch (e) {
      const message = e?.response?.data?.error || 'Unable to create user right now.';
      setStatus({ type: 'error', text: message });
    } finally {
      setLoading(false);
    }
  };

  const alertClass = status.type === 'error' ? 'alert alert--error' : 'alert alert--success';

  return (
    <section className="panel admin-panel" aria-labelledby="admin-panel-title">
      <div className="panel__header">
        <h2 className="panel__title" id="admin-panel-title">Team access</h2>
        <p className="panel__subtitle">
          Invite trusted teammates to collaborate on voter operations with role-based access.
        </p>
      </div>
      {status.text && (
        <div className={alertClass} role="status">
          <span aria-hidden>{status.type === 'error' ? '⚠️' : '✅'}</span>
          <span>{status.text}</span>
        </div>
      )}
      <form className="form-grid" onSubmit={create}>
        <label className="field">
          <span className="field__label">User email</span>
          <input
            className="input"
            placeholder="operator@example.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="field">
          <span className="field__label">Temporary password</span>
          <input
            className="input"
            placeholder="Set an initial password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">Role</span>
          <select
            className="select"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="operator">Operator</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? 'Creating user…' : 'Create user'}
        </button>
      </form>
      <p className="panel__subtitle">
        New users will receive instructions on how to sign in and reset their password on first login.
      </p>
    </section>
  );
}
