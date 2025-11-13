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

  const inputClass =
    'mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200';
  const primaryBtn =
    'inline-flex items-center rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500';
  const ghostBtn =
    'inline-flex items-center rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500';
  const dangerBtn =
    'inline-flex items-center rounded-2xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500';

  return (
    <div className="space-y-6">
      {status.text ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            status.type === 'error' ? 'border-rose-100 bg-rose-50 text-rose-900' : 'border-emerald-100 bg-emerald-50 text-emerald-900'
          }`}
        >
          {status.text}
        </div>
      ) : null}

      <form className="rounded-3xl border border-emerald-50 bg-white/90 p-6 shadow-sm" onSubmit={onCreate}>
        <h2 className="text-xl font-semibold text-slate-900">Create New User</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="block text-sm font-semibold text-slate-600">
            Username
            <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
          </label>
          <label className="block text-sm font-semibold text-slate-600">
            Password
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="minimum 4 characters"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-600">
            Role
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 text-sm font-semibold text-slate-600">
          Allowed Databases
          <div className="mt-2 flex flex-wrap gap-2">
            {dbs.map((d) => (
              <label
                key={d.id}
                className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-1 text-sm font-semibold ${
                  allowed.includes(d.id) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  checked={allowed.includes(d.id)}
                  onChange={() => onToggleDb(d.id)}
                />
                <span>{d.name || d.id}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button className={primaryBtn} type="submit">Create</button>
        </div>
      </form>

      <div className="rounded-3xl border border-emerald-50 bg-white/90 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">All Users</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="mt-4 space-y-4">
            {users.map((u) => {
              const id = getId(u);
              const isRoleEditing = roleEditing[id] !== undefined;
              const isDbEditing = dbEditing[id] !== undefined;
              const dbSet = isDbEditing ? dbEditing[id] : new Set(u?.allowedDatabaseIds || []);
              const dbList = Array.from(dbSet);

              return (
                <div key={id} className="rounded-2xl border border-slate-100 p-4 shadow-sm">
                  <div className="grid gap-4 md:grid-cols-7 md:items-start">
                    <div className="md:col-span-1">
                      <div className="font-semibold text-slate-900">{u.username}</div>
                      <div className="text-xs text-slate-500">Password not stored in plain text</div>
                    </div>

                    <div className="md:col-span-1 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role</div>
                      {isRoleEditing ? (
                        <div className="space-y-2">
                          <select
                            className={inputClass}
                            value={roleEditing[id]}
                            onChange={(e) => setRoleEditing((prev) => ({ ...prev, [id]: e.target.value }))}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          <div className="flex gap-2">
                            <button className={primaryBtn} type="button" onClick={() => saveRole(id)}>Save</button>
                            <button className={ghostBtn} type="button" onClick={() => cancelRoleEdit(id)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{getRole(u)}</span>
                          <button className="text-sm font-semibold text-emerald-600" onClick={() => beginRoleEdit(id, getRole(u))}>edit</button>
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-2 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Allowed DBs</div>
                      {isDbEditing ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {dbs.map((d) => (
                              <label
                                key={d.id}
                                className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-1 text-sm font-semibold ${
                                  dbSet.has(d.id) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                                  checked={dbSet.has(d.id)}
                                  onChange={() => toggleDbForUser(id, d.id)}
                                />
                                <span>{d.name || d.id}</span>
                              </label>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button className={primaryBtn} type="button" onClick={() => saveDbEdit(id)}>Save</button>
                            <button className={ghostBtn} type="button" onClick={() => cancelDbEdit(id)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-slate-500">{dbList.length ? dbList.join(', ') : '—'}</span>
                          <button className="text-sm font-semibold text-emerald-600" onClick={() => beginDbEdit(id, u?.allowedDatabaseIds)}>edit</button>
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-1 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Device</div>
                      <div className="text-xs text-slate-500">
                        {u.deviceIdBound ? (
                          <>
                            <div className="font-mono text-sm">bound: {u.deviceIdBound}</div>
                            <div>at: {fmt(u.deviceBoundAt)}</div>
                          </>
                        ) : (
                          '—'
                        )}
                      </div>
                      <button className="text-sm font-semibold text-emerald-600" onClick={() => onResetDevice(id)}>Reset device</button>
                    </div>

                    <div className="md:col-span-1 text-sm text-slate-600">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created</div>
                      {fmt(u.createdAt)}
                    </div>
                    <div className="md:col-span-1 text-sm text-slate-600">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</div>
                      {fmt(u.updatedAt)}
                    </div>

                    <div className="md:col-span-1 flex flex-wrap gap-2">
                      <button className={ghostBtn} type="button" onClick={() => openPwdModal(id)}>Change Password</button>
                      <button className={dangerBtn} type="button" onClick={() => onDelete(id)}>Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pwdUserId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
          <div className="w-full max-w-md rounded-3xl border border-emerald-100 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Change Password</h3>
            <form className="mt-4 space-y-4" onSubmit={savePassword}>
              <label className="block text-sm font-semibold text-slate-600">
                New Password
                <input
                  className={inputClass}
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="minimum 4 characters"
                  autoFocus
                />
              </label>
              <div className="flex gap-2">
                <button className={primaryBtn} type="submit">Save</button>
                <button className={ghostBtn} type="button" onClick={closePwdModal}>Cancel</button>
              </div>
              <p className="text-xs text-slate-500">
                Note: Current passwords are not retrievable (stored as secure hashes). After saving, you’ll see the new password once to share with the user.
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
