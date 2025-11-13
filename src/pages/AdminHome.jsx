// client/src/pages/AdminHome.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import AdminUsers from './AdminUsers.jsx';
import { getUser, getAvailableDatabases, setAvailableDatabases } from '../auth';

function resolveId(entity) {
  if (!entity) return undefined;
  return entity.id ?? entity._id ?? entity.uuid ?? entity.key;
}

function databaseDisplayName(db) {
  if (!db) return '';
  return db.name || db.title || db.label || `Database ${resolveId(db)}`;
}

function StatCard({ title, value, hint, onClick, href, icon = '📊' }) {
  const Component = href ? Link : 'div';
  const interactiveProps = (() => {
    if (href) return { to: href };
    if (!onClick) return {};
    const handleKeyDown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
      }
    };
    return { role: 'button', tabIndex: 0, onClick, onKeyDown: handleKeyDown };
  })();
  return (
    <Component
      className="flex flex-col gap-1 rounded-2xl border border-emerald-50 bg-white/90 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
      {...interactiveProps}
    >
      <div className="text-2xl" aria-hidden>
        {icon}
      </div>
      <div className="text-sm font-semibold text-slate-600">{title}</div>
      <div className="text-2xl font-bold text-emerald-700">{value}</div>
      {hint && <div className="text-sm text-slate-500">{hint}</div>}
    </Component>
  );
}

export default function AdminHome() {
  const [tab, setTab] = useState('overview');
  const [databases, setDatabases] = useState(() => getAvailableDatabases() || []);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', text: '' });
  const [savingId, setSavingId] = useState(null);

  const currentUser = useMemo(() => getUser?.() || null, []);
  const showStatus = (type, text) => setStatus({ type, text });

  const loadDatabases = async () => {
    showStatus('', '');
    try {
      const { data } = await api.get('/api/admin/databases');
      const list = data?.databases || [];
      setDatabases(list);
      setAvailableDatabases(list);
    } catch (e) {
      showStatus('error', e?.response?.data?.error || 'Unable to load voter databases.');
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    showStatus('', '');
    try {
      const { data } = await api.get('/api/admin/users');
      setUsers(data?.users || []);
    } catch (e) {
      showStatus('error', e?.response?.data?.error || 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDatabases(); loadUsers(); }, []);

  const onUserCreated = () => { loadUsers(); };

  const updateUserField = (id, updater) => {
    if (!id) return;
    setUsers((prev) => prev.map((u) => (resolveId(u) === id ? updater(u) : u)));
  };

  const onRoleChange = (id, role) => {
    const normalized = role === 'volunteer' ? 'operator' : role;
    updateUserField(id, (u) => ({ ...u, role: normalized }));
  };

  const onToggleDatabase = (id, databaseId, checked) => {
    updateUserField(id, (u) => {
      const dbIds = new Set(u.allowedDatabaseIds || u.databaseIds || []);
      if (checked) dbIds.add(databaseId);
      else dbIds.delete(databaseId);
      return { ...u, allowedDatabaseIds: Array.from(dbIds) };
    });
  };

  const saveUser = async (user) => {
    const userId = resolveId(user);
    if (!userId) return;
    setSavingId(userId);
    showStatus('', '');
    try {
      const payload = {
        role: user.role,
        allowedDatabaseIds: user.allowedDatabaseIds || [],
      };
      const { data } = await api.put(`/api/admin/users/${userId}`, payload);
      const saved = data?.user || user;
      updateUserField(userId, () => saved);
      showStatus('success', `Updated ${saved.username || user.username || 'user'}`);
    } catch (e) {
      showStatus('error', e?.response?.data?.error || 'Failed to update user.');
    } finally {
      setSavingId(null);
    }
  };

  const roleOf = (u) => (u?.role || '').toLowerCase();
  const totalUsers = users.length;
  const totalAdmins = users.filter((u) => roleOf(u) === 'admin').length;
  const totalOperators = users.filter((u) => roleOf(u) === 'operator').length;
  const totalCandidates = users.filter((u) => roleOf(u) === 'candidate').length;
  const totalPlainUsers = users.filter((u) => roleOf(u) === 'user').length;
  const totalDatabases = databases.length;

  const panelClass = 'rounded-3xl border border-emerald-100 bg-white/95 p-6 shadow-lg shadow-emerald-900/5 backdrop-blur';
  const primaryBtn =
    'inline-flex items-center rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500';
  const ghostBtn =
    'inline-flex items-center rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500';
  const tabButton = (active) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition ${
      active ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:text-emerald-600'
    }`;

  const Toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">Admin</span>
        {currentUser?.username && (
          <span className="text-sm text-slate-500">
            Signed in as <b className="text-slate-700">{currentUser.username}</b>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button className={primaryBtn} type="button" onClick={() => { loadDatabases(); loadUsers(); }}>
          ⟳ Refresh
        </button>
      </div>
    </div>
  );

  const TabBar = (
    <div role="tablist" aria-label="Admin tabs" className="flex flex-wrap gap-2">
      {[
        ['overview', 'Overview'],
        ['team', 'Team'],
        ['databases', 'Databases'],
        ['settings', 'Settings'],
      ].map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={tab === key}
          className={tabButton(tab === key)}
          onClick={() => setTab(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-emerald-50/40 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className={`${panelClass} space-y-4`}>
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Admin Dashboard</h1>
            <p className="text-sm text-slate-500">Manage users, assign voter databases, and jump to common actions.</p>
          </div>
          {Toolbar}
          {TabBar}
        </header>

        {tab === 'overview' && (
          <section aria-labelledby="overview" className={panelClass}>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <StatCard title="Total Accounts" value={totalUsers} hint="All members" icon="👥" onClick={() => setTab('team')} />
              <StatCard title="Admins" value={totalAdmins} hint="Full access" icon="🛡️" onClick={() => setTab('team')} />
              <StatCard title="Operators" value={totalOperators} hint="On-ground users" icon="🤝" onClick={() => setTab('team')} />
              <StatCard title="Candidates" value={totalCandidates} hint="Candidate logins" icon="🎯" onClick={() => setTab('team')} />
              <StatCard title="Users" value={totalPlainUsers} hint="General role" icon="🧑‍💼" onClick={() => setTab('team')} />
              <StatCard title="Voter Databases" value={totalDatabases} hint="Available lists" icon="🗃️" onClick={() => setTab('databases')} />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <StatCard title="Open Voter Search" value="Search & Filter" hint="Find voters quickly" href="/search" icon="🔎" />
              <StatCard title="Manage Users" value="Add / Edit / Assign" hint="Create users and set roles" onClick={() => setTab('team')} icon="👤" />
              <StatCard title="Assign Databases" value="Grant access" hint="Control which lists each user sees" onClick={() => setTab('databases')} icon="🗂️" />
              <StatCard title="Server Health" value="OK" hint="Everything looks good" icon="✅" />
            </div>
          </section>
        )}

        {tab === 'team' && (
          <>
            <section className={panelClass} aria-labelledby="create-user">
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold text-slate-900" id="create-user">Team management</h2>
                <p className="text-sm text-slate-500">Add teammates (username only — email optional), choose a role, and assign databases.</p>
              </div>
              <div className="mt-4">
                <AdminUsers onCreated={onUserCreated} />
              </div>
            </section>

            <section className={panelClass} aria-labelledby="user-access">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold text-slate-900" id="user-access">User access & databases</h3>
                <p className="text-sm text-slate-500">Toggle which voter databases each user can access.</p>
              </div>

              {status.text && (
                <div
                  className={`mt-4 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
                    status.type === 'error'
                      ? 'border-rose-100 bg-rose-50 text-rose-900'
                      : 'border-emerald-100 bg-emerald-50 text-emerald-900'
                  }`}
                  role="status"
                >
                  <span aria-hidden>{status.type === 'error' ? '⚠️' : '✅'}</span>
                  <span>{status.text}</span>
                </div>
              )}

              {loading ? (
                <p className="mt-4 text-sm text-slate-500">Loading users…</p>
              ) : users.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No team members found yet.</p>
              ) : (
                <div className="mt-6 overflow-x-auto">
                  <table className="min-w-full divide-y divide-emerald-50 text-sm">
                    <thead className="bg-emerald-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Allowed databases</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {users.map((user) => {
                        const userId = resolveId(user);
                        const assigned = new Set(user?.allowedDatabaseIds || user?.databaseIds || []);
                        const isAdmin = (user?.role || '').toLowerCase() === 'admin';
                        return (
                          <tr key={userId || Math.random()} className="align-top">
                            <td className="px-4 py-3 font-semibold text-slate-800">{user?.username || '—'}</td>
                            <td className="px-4 py-3">
                              <select
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                                value={user?.role || 'user'}
                                disabled={isAdmin}
                                onChange={(e) => onRoleChange(userId, e.target.value)}
                              >
                                {isAdmin ? (
                                  <option value="admin">Admin</option>
                                ) : (
                                  <>
                                    <option value="user">User</option>
                                    <option value="candidate">Candidate</option>
                                    <option value="operator">Operator</option>
                                  </>
                                )}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <div className="grid gap-2 md:grid-cols-2">
                                {databases.length > 0 ? (
                                  databases.map((db) => {
                                    const id = resolveId(db);
                                    return (
                                      <label key={id} className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                                          checked={assigned.has(id)}
                                          onChange={(e) => onToggleDatabase(userId, id, e.target.checked)}
                                        />
                                        <span>{databaseDisplayName(db)}</span>
                                      </label>
                                    );
                                  })
                                ) : (
                                  <span className="text-sm text-slate-500">No voter databases available.</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                className={ghostBtn}
                                type="button"
                                onClick={() => saveUser(user)}
                                disabled={savingId === userId}
                              >
                                {savingId === userId ? 'Saving…' : 'Save'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {tab === 'databases' && (
          <section className={panelClass} aria-labelledby="database-panel">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold text-slate-900" id="database-panel">Voter databases</h2>
              <p className="text-sm text-slate-500">Your available lists. Assign them to team members from the <b>Team</b> tab.</p>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {databases.length === 0 ? (
                <p className="text-sm text-slate-500">No voter databases available.</p>
              ) : (
                databases.map((db) => {
                  const label = databaseDisplayName(db);
                  return (
                    <div key={resolveId(db)} className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                      <div className="text-lg font-semibold text-slate-900">{label}</div>
                      <div className="text-sm text-slate-500">ID: <code className="font-mono">{resolveId(db)}</code></div>
                      <div className="mt-3">
                        <Link className={ghostBtn} to="/search">Open in Search</Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className={panelClass} aria-labelledby="settings">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold text-slate-900" id="settings">Settings</h2>
              <p className="text-sm text-slate-500">General admin preferences.</p>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                <div className="text-lg font-semibold text-slate-900">Theme</div>
                <p className="text-sm text-slate-500">Using a light, professional palette (green / grey / black / white).</p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                <div className="text-lg font-semibold text-slate-900">Shortcuts</div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link to="/search" className={ghostBtn}>Go to Search</Link>
                  <button type="button" className={ghostBtn} onClick={() => setTab('team')}>
                    Manage Users
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
