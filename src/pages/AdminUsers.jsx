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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {status.text ? (
        <div className={`alert ${status.type === 'error' ? 'alert--error' : 'alert--info'}`}>{status.text}</div>
      ) : null}

      <form className="glass-panel" onSubmit={onCreate}>
        <h2 className="section-heading">Create New User</h2>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', marginTop: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.9rem', fontWeight: 600 }}>
            Username
            <input className="input-field" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.9rem', fontWeight: 600 }}>
            Password
            <input
              className="input-field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="minimum 4 characters"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.9rem', fontWeight: 600 }}>
            Role
            <select className="select-field" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginTop: 20 }}>
          <p className="section-subtext" style={{ fontWeight: 600, color: 'var(--muted-dark)' }}>Allowed Databases</p>
          <div className="chip-set" style={{ marginTop: 12 }}>
            {dbs.map((d) => (
              <label key={d.id} className={`chip-button${allowed.includes(d.id) ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={allowed.includes(d.id)} onChange={() => onToggleDb(d.id)} />
                <span>{d.name || d.id}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20, textAlign: 'right' }}>
          <button className="btn btn--primary" type="submit">Create</button>
        </div>
      </form>

      <div className="glass-panel">
        <h2 className="section-heading">All Users</h2>
        {loading ? (
          <p className="section-subtext" style={{ marginTop: 16 }}>Loading…</p>
        ) : (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {users.map((u) => {
              const id = getId(u);
              const isRoleEditing = roleEditing[id] !== undefined;
              const isDbEditing = dbEditing[id] !== undefined;
              const dbSet = isDbEditing ? dbEditing[id] : new Set(u?.allowedDatabaseIds || []);
              const dbList = Array.from(dbSet);

              return (
                <div key={id} className="glass-pill" style={{ flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                    <strong>{u.username}</strong>
                    <span className="section-subtext">Password not stored in plain text</span>
                  </div>

                  <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
                    <div>
                      <p className="section-subtext" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Role</p>
                      {isRoleEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <select className="select-field" value={roleEditing[id]} onChange={(e) => setRoleEditing((prev) => ({ ...prev, [id]: e.target.value }))}>
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn btn--primary" type="button" onClick={() => saveRole(id)}>Save</button>
                            <button className="btn btn--ghost" type="button" onClick={() => cancelRoleEdit(id)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="chip-button active" style={{ cursor: 'default' }}>{getRole(u)}</span>
                          <button className="btn btn--tiny" type="button" onClick={() => beginRoleEdit(id, getRole(u))}>edit</button>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="section-subtext" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Allowed DBs</p>
                      {isDbEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div className="chip-set">
                            {dbs.map((d) => (
                              <label key={d.id} className={`chip-button${dbSet.has(d.id) ? ' active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <input type="checkbox" checked={dbSet.has(d.id)} onChange={() => toggleDbForUser(id, d.id)} />
                                <span>{d.name || d.id}</span>
                              </label>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn btn--primary" type="button" onClick={() => saveDbEdit(id)}>Save</button>
                            <button className="btn btn--ghost" type="button" onClick={() => cancelDbEdit(id)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="section-subtext">{dbList.length ? dbList.join(', ') : '—'}</span>
                          <button className="btn btn--tiny" type="button" onClick={() => beginDbEdit(id, u?.allowedDatabaseIds)}>edit</button>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="section-subtext" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Device</p>
                      <div className="section-subtext">
                        {u.deviceIdBound ? (
                          <>
                            <div style={{ fontFamily: 'monospace' }}>bound: {u.deviceIdBound}</div>
                            <div>at: {fmt(u.deviceBoundAt)}</div>
                          </>
                        ) : (
                          '—'
                        )}
                      </div>
                      <button className="btn btn--tiny" type="button" onClick={() => onResetDevice(id)}>Reset device</button>
                    </div>

                    <div>
                      <p className="section-subtext" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Created</p>
                      <span>{fmt(u.createdAt)}</span>
                    </div>
                    <div>
                      <p className="section-subtext" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Updated</p>
                      <span>{fmt(u.updatedAt)}</span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <button className="btn btn--ghost" type="button" onClick={() => openPwdModal(id)}>Change Password</button>
                      <button className="btn btn--danger" type="button" onClick={() => onDelete(id)}>Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pwdUserId ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Change Password</h3>
            <form style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={savePassword}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                New Password
                <input
                  className="input-field"
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="minimum 4 characters"
                  autoFocus
                />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn--primary" type="submit">Save</button>
                <button className="btn btn--ghost" type="button" onClick={closePwdModal}>Cancel</button>
              </div>
              <p className="section-subtext" style={{ fontSize: '0.75rem' }}>
                Note: Current passwords are not retrievable (stored as secure hashes). After saving, you’ll see the new password once to share with the user.
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
