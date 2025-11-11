// client/src/pages/AdminUsers.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  adminListUsers,
  adminListDatabases,
  adminCreateUser,
  adminDeleteUser,
  adminUpdateUserRole,
  adminUpdateUserPassword,
  adminUpdateUserDatabases,
} from '../api';
import './Admin.css';

const ROLES = ['user', 'operator', 'candidate', 'admin'];

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [dbs, setDbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', text: '' });

  // create form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [allowed, setAllowed] = useState([]);

  // password modal
  const [pwdUserId, setPwdUserId] = useState(null);
  const [newPwd, setNewPwd] = useState('');

  async function loadAll() {
    setLoading(true);
    try {
      const [u, d] = await Promise.all([adminListUsers(), adminListDatabases()]);
      setUsers(u);
      setDbs(d);
    } catch (e) {
      setStatus({ type: 'error', text: e?.response?.data?.error || e.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const onToggleDb = (id) => {
    setAllowed((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return Array.from(s);
    });
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setStatus({ type: '', text: '' });
    try {
      if (!username.trim()) throw new Error('Username required');
      if (password.length < 4) throw new Error('Password must be at least 4 chars');

      await adminCreateUser({ username: username.trim(), password, role, allowedDatabaseIds: allowed });
      setUsername('');
      setPassword('');
      setRole('user');
      setAllowed([]);
      await loadAll();
      setStatus({ type: 'ok', text: 'User created' });
    } catch (e2) {
      setStatus({ type: 'error', text: e2?.response?.data?.error || e2.message || String(e2) });
    }
  };

  const deleteUser = async (id) => {
    if (!confirm('Delete this user?')) return;
    try {
      await adminDeleteUser(id);
      await loadAll();
    } catch (e) {
      setStatus({ type: 'error', text: e?.response?.data?.error || e.message });
    }
  };

  const changeRole = async (id, newRole) => {
    try {
      await adminUpdateUserRole(id, newRole);
      await loadAll();
    } catch (e) {
      setStatus({ type: 'error', text: e?.response?.data?.error || e.message });
    }
  };

  const openPwd = (id) => {
    setPwdUserId(id);
    setNewPwd('');
  };
  const submitPwd = async (e) => {
    e.preventDefault();
    if (!newPwd || newPwd.length < 4) {
      setStatus({ type: 'error', text: 'Password must be at least 4 chars' });
      return;
    }
    try {
      await adminUpdateUserPassword(pwdUserId, newPwd);
      setPwdUserId(null);
      setNewPwd('');
      setStatus({ type: 'ok', text: 'Password updated' });
    } catch (e) {
      setStatus({ type: 'error', text: e?.response?.data?.error || e.message });
    }
  };

  const setDatabases = async (id, allowedDatabaseIds) => {
    try {
      await adminUpdateUserDatabases(id, allowedDatabaseIds);
      await loadAll();
      setStatus({ type: 'ok', text: 'Database access updated' });
    } catch (e) {
      setStatus({ type: 'error', text: e?.response?.data?.error || e.message });
    }
  };

  if (loading) return <div className="admin-card">Loading…</div>;

  return (
    <div className="admin-card">
      <h2 className="admin-card__title">User Management</h2>

      {status.text ? (
        <div className={`admin-alert admin-alert--${status.type === 'error' ? 'danger' : 'ok'}`}>
          {status.text}
        </div>
      ) : null}

      {/* Create */}
      <form className="admin-form" onSubmit={onCreate}>
        <div className="admin-form__row">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. ram" />
        </div>
        <div className="admin-form__row">
          <label>Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 4 chars" type="password" />
        </div>
        <div className="admin-form__row">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="admin-form__row">
          <label>Database Access</label>
          <div className="admin-chiplist">
            {dbs.map((d) => (
              <label key={d.id} className="admin-chip">
                <input
                  type="checkbox"
                  checked={allowed.includes(d.id)}
                  onChange={() => onToggleDb(d.id)}
                />
                <span>{d.name || d.id}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="admin-form__row">
          <button type="submit" className="btn btn-primary">Create User</button>
        </div>
      </form>

      {/* List */}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Databases</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id || u.id}>
                <td>{u.username}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u._id || u.id, e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <DbSelector
                    allDbs={dbs}
                    value={u.allowedDatabaseIds || []}
                    onChange={(next) => setDatabases(u._id || u.id, next)}
                  />
                </td>
                <td className="admin-actions">
                  <button className="btn" onClick={() => openPwd(u._id || u.id)}>Change Password</button>
                  <button className="btn btn-danger" onClick={() => deleteUser(u._id || u.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr><td colSpan={4} style={{ textAlign: 'center' }}>No users yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Password modal */}
      {pwdUserId && (
        <div className="admin-modal">
          <div className="admin-modal__dialog">
            <h3>Set New Password</h3>
            <form onSubmit={submitPwd}>
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="min 4 chars"
              />
              <div className="admin-modal__actions">
                <button type="button" className="btn" onClick={() => setPwdUserId(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Update</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DbSelector({ allDbs, value, onChange }) {
  const set = useMemo(() => new Set(value || []), [value]);
  const toggle = (id) => {
    const s = new Set(set);
    s.has(id) ? s.delete(id) : s.add(id);
    onChange(Array.from(s));
  };
  return (
    <div className="admin-chiplist">
      {allDbs.map((d) => (
        <button
          key={d.id}
          type="button"
          className={`admin-chip ${set.has(d.id) ? 'admin-chip--active' : ''}`}
          onClick={() => toggle(d.id)}
          title={d.name || d.id}
        >
          {d.name || d.id}
        </button>
      ))}
    </div>
  );
}
