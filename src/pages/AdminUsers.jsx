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
  adminResetUserDevice,
} from '../api';
import './Admin.css';

const ROLES = ['user', 'operator', 'candidate', 'admin'];

// helpers to be resilient to id/_id
const getId = (u) => u?.id || u?._id;
const getRole = (u) => (u?.role || '').toLowerCase();
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [dbs, setDbs] = useState([]);
  const [loading, setLoading] = useState(true);

  // page-level toast
  const [status, setStatus] = useState({ type: '', text: '' });
  useEffect(() => {
    if (!status.text) return;
    const t = setTimeout(() => setStatus({ type: '', text: '' }), 3000);
    return () => clearTimeout(t);
  }, [status]);

  // create form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [allowed, setAllowed] = useState([]);

  // password modal
  const [pwdUserId, setPwdUserId] = useState(null);
  const [newPwd, setNewPwd] = useState('');

  // role inline edit
  const [roleEditing, setRoleEditing] = useState({}); // { userId: 'admin' }

  // db selection per user (edit overlay)
  const [dbEditing, setDbEditing] = useState({}); // { userId: Set([...]) }

  async function loadAll() {
    setLoading(true);
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
    setAllowed((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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
      setStatus({ type: 'ok', text: 'User created' });
      await loadAll();
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    try {
      await adminDeleteUser(id);
      setStatus({ type: 'ok', text: 'User deleted' });
      await loadAll();
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  const beginRoleEdit = (id, currentRole) => {
    setRoleEditing((prev) => ({ ...prev, [id]: currentRole || 'user' }));
  };
  const cancelRoleEdit = (id) => {
    setRoleEditing((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };
  const saveRole = async (id) => {
    try {
      await adminUpdateUserRole(id, roleEditing[id]);
      setStatus({ type: 'ok', text: 'Role updated' });
      cancelRoleEdit(id);
      await loadAll();
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  const beginDbEdit = (id, currentList) => {
    const s = new Set(Array.isArray(currentList) ? currentList : []);
    setDbEditing((prev) => ({ ...prev, [id]: s }));
  };
  const toggleDbForUser = (id, dbId) => {
    setDbEditing((prev) => {
      const s = new Set(prev[id] || []);
      if (s.has(dbId)) s.delete(dbId);
      else s.add(dbId);
      return { ...prev, [id]: s };
    });
  };
  const cancelDbEdit = (id) => {
    setDbEditing((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };
  const saveDbEdit = async (id) => {
    try {
      await adminUpdateUserDatabases(id, Array.from(dbEditing[id] || []));
      setStatus({ type: 'ok', text: 'Allowed databases updated' });
      cancelDbEdit(id);
      await loadAll();
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  const onResetDevice = async (id) => {
    if (!window.confirm('Reset bound device for this user?')) return;
    try {
      await adminResetUserDevice(id);
      setStatus({ type: 'ok', text: 'Device binding reset' });
      await loadAll();
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  const openPwdModal = (id) => {
    setPwdUserId(id);
    setNewPwd('');
  };
  const closePwdModal = () => {
    setPwdUserId(null);
    setNewPwd('');
  };
  const savePassword = async (e) => {
    e.preventDefault();
    if (!newPwd || newPwd.length < 4) {
      setStatus({ type: 'error', text: 'Password must be at least 4 chars' });
      return;
    }
    try {
      await adminUpdateUserPassword(pwdUserId, newPwd);
      closePwdModal();
      setStatus({ type: 'ok', text: 'Password updated' });
      // optional: reload list to update updatedAt
      await loadAll();
      // Show the temporary password once (since we can't retrieve it later)
      window.alert(`New password set successfully.\nShare this one-time value with the user:\n\n${newPwd}`);
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  return (
    <div className="admin">
      {/* Toast */}
      {status.text ? (
        <div className={`toast toast--${status.type}`}>
          {status.text}
        </div>
      ) : null}

      <h1>Admin Users</h1>

      {/* Create User */}
      <form className="card" onSubmit={onCreate}>
        <h2>Create New User</h2>
        <div className="grid grid--3">
          <label className="field">
            <span className="field__label">Username</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
            />
          </label>
          <label className="field">
            <span className="field__label">Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="minimum 4 characters"
            />
          </label>
          <label className="field">
            <span className="field__label">Role</span>
            <select
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Allowed DBs */}
        <div className="field">
          <span className="field__label">Allowed Databases</span>
          <div className="chips">
            {dbs.map((d) => (
              <label key={d.id} className={`chip ${allowed.includes(d.id) ? 'chip--active' : ''}`}>
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

        <div className="actions">
          <button className="btn btn--primary" type="submit">Create</button>
        </div>
      </form>

      {/* Users Table */}
      <div className="card">
        <h2>All Users</h2>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <div className="table">
            <div className="table__head">
              <div>Username</div>
              <div>Role</div>
              <div>Allowed DBs</div>
              <div>Device</div>
              <div>Created</div>
              <div>Updated</div>
              <div>Actions</div>
            </div>

            {users.map((u) => {
              const id = getId(u);
              const isRoleEditing = roleEditing[id] !== undefined;
              const isDbEditing = dbEditing[id] !== undefined;
              const dbSet = isDbEditing ? dbEditing[id] : new Set(u?.allowedDatabaseIds || []);
              const dbList = Array.from(dbSet);

              return (
                <div key={id} className="table__row">
                  {/* Username */}
                  <div>
                    <div className="mono">{u.username}</div>
                    <div className="muted small">Password not stored in plain text</div>
                  </div>

                  {/* Role (inline edit) */}
                  <div>
                    {isRoleEditing ? (
                      <div className="inline-edit">
                        <select
                          className="input input--sm"
                          value={roleEditing[id]}
                          onChange={(e) =>
                            setRoleEditing((prev) => ({ ...prev, [id]: e.target.value }))
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        <div className="inline-actions">
                          <button className="btn btn--sm" onClick={() => saveRole(id)}>Save</button>
                          <button className="btn btn--sm btn--ghost" onClick={() => cancelRoleEdit(id)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="badge">{getRole(u)}</div>
                        <button className="link" onClick={() => beginRoleEdit(id, getRole(u))}>edit</button>
                      </>
                    )}
                  </div>

                  {/* Allowed DBs (inline edit) */}
                  <div>
                    {isDbEditing ? (
                      <>
                        <div className="chips chips--wrap">
                          {dbs.map((d) => (
                            <label key={d.id} className={`chip ${dbSet.has(d.id) ? 'chip--active' : ''}`}>
                              <input
                                type="checkbox"
                                checked={dbSet.has(d.id)}
                                onChange={() => toggleDbForUser(id, d.id)}
                              />
                              <span>{d.name || d.id}</span>
                            </label>
                          ))}
                        </div>
                        <div className="inline-actions">
                          <button className="btn btn--sm" onClick={() => saveDbEdit(id)}>Save</button>
                          <button className="btn btn--sm btn--ghost" onClick={() => cancelDbEdit(id)}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="muted small">
                          {dbList.length ? dbList.join(', ') : '—'}
                        </div>
                        <button className="link" onClick={() => beginDbEdit(id, u?.allowedDatabaseIds)}>edit</button>
                      </>
                    )}
                  </div>

                  {/* Device info */}
                  <div>
                    <div className="muted small">
                      {u.deviceIdBound ? (
                        <>
                          <div className="mono small">bound: {u.deviceIdBound}</div>
                          <div className="small">at: {fmt(u.deviceBoundAt)}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </div>
                    <button className="link" onClick={() => onResetDevice(id)}>Reset device</button>
                  </div>

                  <div>{fmt(u.createdAt)}</div>
                  <div>{fmt(u.updatedAt)}</div>

                  {/* Actions */}
                  <div className="row-actions">
                    <button className="btn btn--sm" onClick={() => openPwdModal(id)}>Change Password</button>
                    <button className="btn btn--sm btn--danger" onClick={() => onDelete(id)}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Change Password Modal */}
      {pwdUserId ? (
        <div className="modal">
          <div className="modal__dialog">
            <h3>Change Password</h3>
            <form onSubmit={savePassword}>
              <label className="field">
                <span className="field__label">New Password</span>
                <input
                  className="input"
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="minimum 4 characters"
                  autoFocus
                />
              </label>
              <div className="actions">
                <button className="btn btn--primary" type="submit">Save</button>
                <button className="btn btn--ghost" type="button" onClick={closePwdModal}>Cancel</button>
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>
                Note: Current passwords are not retrievable (stored as secure hashes).  
                After saving, you’ll see the new password once to share with the user.
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
