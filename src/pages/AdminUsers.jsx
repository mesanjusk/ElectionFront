// client/src/pages/AdminUsers.jsx
import React, { useEffect, useState } from 'react';
import api from '../api';
import './Admin.css';

export default function AdminUsers({ onCreated = () => {} }) {
  // no email — use username instead
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');

  // allow assigning DBs at creation
  const [databases, setDatabases] = useState([]);
  const [selectedDbIds, setSelectedDbIds] = useState([]);

  const [status, setStatus] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);
  const [loadingDbs, setLoadingDbs] = useState(true);

  useEffect(() => {
    // load available databases (collections like "Gondia 01", "Gondia 02", ...)
    const load = async () => {
      try {
        const { data } = await api.get('/api/admin/databases');
        setDatabases(data?.databases || []);
      } catch (e) {
        setStatus({
          type: 'error',
          text: e?.response?.data?.error || 'Unable to load voter databases.',
        });
      } finally {
        setLoadingDbs(false);
      }
    };
    load();
  }, []);

  const toggleDb = (id, checked) => {
    setSelectedDbIds((prev) => {
      const s = new Set(prev);
      checked ? s.add(id) : s.delete(id);
      return Array.from(s);
    });
  };

  const create = async (e) => {
    e.preventDefault();
    setStatus({ type: '', text: '' });

    if (!username.trim()) {
      setStatus({ type: 'error', text: 'Username is required.' });
      return;
    }
    if (!password || password.length < 6) {
      setStatus({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    setLoading(true);
    try {
      // Backend should accept username + password + role + databaseIds
      const payload = {
        username: username.trim(),
        password,
        role,
        databaseIds: selectedDbIds,
      };
      const { data } = await api.post('/api/admin/users', payload);

      setStatus({
        type: 'success',
        text: `Created ${data?.user?.username || username} (${data?.user?.role || role})`,
      });

      // reset form
      setUsername('');
      setPassword('');
      setRole('operator');
      setSelectedDbIds([]);

      onCreated?.(data?.user);
    } catch (e) {
      const message = e?.response?.data?.error || 'Unable to create user right now.';
      setStatus({ type: 'error', text: message });
    } finally {
      setLoading(false);
    }
  };

  const alertClass =
    status.type === 'error' ? 'alert alert--error' : 'alert alert--success';

  const dbLabel = (db) =>
    db?.name || db?.title || db?.label || `Database ${db?._id || db?.id}`;

  return (
    <div className="admin-users">
      {status.text && (
        <div className={alertClass} role="status">
          <span aria-hidden>{status.type === 'error' ? '⚠️' : '✅'}</span>
          <span>{status.text}</span>
        </div>
      )}

      <form className="form-grid" onSubmit={create}>
        <label className="field">
          <span className="field__label">Username</span>
          <input
            className="input"
            placeholder="e.g., operator01"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
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

        <div className="field admin-field--full">
          <span className="field__label">Allowed databases</span>
          {loadingDbs ? (
            <div className="help-text admin-loading">Loading databases…</div>
          ) : databases.length === 0 ? (
            <div className="help-text admin-empty">No voter databases available.</div>
          ) : (
            <div className="admin-checkbox-list">
              {databases.map((db) => {
                const id = db?._id || db?.id;
                return (
                  <label key={id} className="admin-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedDbIds.includes(id)}
                      onChange={(e) => toggleDb(id, e.target.checked)}
                    />
                    <span>{dbLabel(db)}</span>
                  </label>
                );
              })}
            </div>
          )}
          <p className="help-text admin-tip">
            Tip: Your collections like <b>“Gondia 01”</b>, <b>“Gondia 02”</b>, etc., will appear here for selection.
          </p>
        </div>

        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? 'Creating user…' : 'Create user'}
        </button>
      </form>

      <p className="panel__subtitle">
        Users can change their password after first login.
      </p>
    </div>
  );
}
