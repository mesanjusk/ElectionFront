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
} from '../services/api';
import './Admin.css';

const ROLES = ['user', 'operator', 'candidate', 'admin'];

// helpers to be resilient to id/_id
const resolveId = (x) => (x?.id ?? x?._id ?? x?.uuid ?? x?.key);
const resolveName = (d) => (d?.name || d?.title || d?.label || `Database ${resolveId(d)}`);

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [dbs, setDbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', text: '' });

  // create form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [allowed, setAllowed] = useState([]); // array of DB ids

  // password modal
  const [pwdUserId, setPwdUserId] = useState(null);
  const [newPwd, setNewPwd] = useState('');

  async function loadAll() {
    setLoading(true);
    setStatus({ type: '', text: '' });
    try {
      const [u, d] = await Promise.all([adminListUsers(), adminListDatabases()]);
      setUsers(u || []);
      setDbs(d || []);
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
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

      await adminCreateUser({
        username: username.trim(),
        password,
        role,
        allowedDatabaseIds: allowed,
      });
      setUsername('');
      setPassword('');
      setRole('user');
      setAllowed([]);
      await loadAll();
      setStatus({ type: 'ok', text: 'User created' });
    } catch (e2) {
      setStatus({ type: 'error', text: e2?.message || String(e2) });
    }
  };

  const deleteUser = async (id) => {
    if (!confirm('Delete this user?')) return;
    try {
      await adminDeleteUser(id);
      await loadAll();
      setStatus({ type: 'ok', text: 'User deleted' });
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  const changeRole = async (id, newRole) => {
    // normalize "volunteer" -> "operator" if it ever appears
    const normalized = newRole === 'volunteer' ? 'operator' : newRole;
    try {
      await adminUpdateUserRole(id, normalized);
      await loadAll();
      setStatus({ type: 'ok', text: 'Role updated' });
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
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
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  const setDatabases = async (id, allowedDatabaseIds) => {
    try {
      await adminUpdateUserDatabases(id, allowedDatabaseIds);
      await loadAll();
      setStatus({ type: 'ok', text: 'Database access updated' });
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
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
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. ram"
          />
        </div>
        <div className="admin-form__row">
          <label>Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="min 4 chars"
            type="password"
          />
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
            {dbs.map((d) => {
              const id = resolveId(d);
              return (
                <label key={id} className="admin-chip">
                  <input
                    type="checkbox"
                    checked={allowed.includes(id)}
                    onChange={() => onToggleDb(id)}
                  />
                  <span>{resolveName(d)}</span>
                </label>
              );
            })}
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
            {users.map((u) => {
              const uid = resolveId(u);
              return (
                <tr key={uid}>
                  <td>{u.username}</td>
                  <td>
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(uid, e.target.value)}
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
                      onChange={(next) => setDatabases(uid, next)}
                    />
                  </td>
                  <td className="admin-actions">
                    <button className="btn" onClick={() => openPwd(uid)}>Change Password</button>
                    <button className="btn btn-danger" onClick={() => deleteUser(uid)}>Delete</button>
                  </td>
                </tr>
              );
            })}
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
      {allDbs.map((d) => {
        const id = resolveId(d);
        return (
          <button
            key={id}
            type="button"
            className={`admin-chip ${set.has(id) ? 'admin-chip--active' : ''}`}
            onClick={() => toggle(id)}
            title={resolveName(d)}
          >
            {resolveName(d)}
          </button>
        );
      })}
    </div>
  );
}
