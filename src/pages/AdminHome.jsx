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
      className="glass-pill"
      style={{ display: 'flex', flexDirection: 'column', gap: 4, cursor: (onClick || href) ? 'pointer' : 'default' }}
      {...interactiveProps}
    >
      <div style={{ fontSize: '1.4rem' }} aria-hidden>
        {icon}
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--brand-dark)' }}>{value}</div>
      {hint && <div className="section-subtext">{hint}</div>}
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

  const tabOptions = [
    ['overview', 'Overview'],
    ['team', 'Team'],
    ['databases', 'Databases'],
    ['settings', 'Settings'],
  ];

  return (
    <div className="page-shell">
      <div className="page-container">
        <header className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h1 className="section-heading">Admin Dashboard</h1>
            <p className="section-subtext">Manage users, assign voter databases, and jump to common actions.</p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ padding: '4px 12px', borderRadius: 999, background: 'var(--brand-soft)', fontWeight: 600 }}>Admin</span>
              {currentUser?.username && (
                <span className="section-subtext">
                  Signed in as <strong>{currentUser.username}</strong>
                </span>
              )}
            </div>
            <button className="btn btn--primary" type="button" onClick={() => { loadDatabases(); loadUsers(); }}>
              ⟳ Refresh
            </button>
          </div>
          <div role="tablist" aria-label="Admin tabs" className="chip-set">
            {tabOptions.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`chip-button${tab === key ? ' active' : ''}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {tab === 'overview' && (
          <section aria-labelledby="overview" className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="card-grid">
              <StatCard title="Total Accounts" value={totalUsers} hint="All members" icon="👥" onClick={() => setTab('team')} />
              <StatCard title="Admins" value={totalAdmins} hint="Full access" icon="🛡️" onClick={() => setTab('team')} />
              <StatCard title="Operators" value={totalOperators} hint="On-ground users" icon="🤝" onClick={() => setTab('team')} />
              <StatCard title="Candidates" value={totalCandidates} hint="Candidate logins" icon="🎯" onClick={() => setTab('team')} />
              <StatCard title="Users" value={totalPlainUsers} hint="General role" icon="🧑‍💼" onClick={() => setTab('team')} />
              <StatCard title="Voter Databases" value={totalDatabases} hint="Available lists" icon="🗃️" onClick={() => setTab('databases')} />
            </div>

            <div className="card-grid">
              <StatCard title="Open Voter Search" value="Search & Filter" hint="Find voters quickly" href="/search" icon="🔎" />
              <StatCard title="Manage Users" value="Add / Edit / Assign" hint="Create users and set roles" onClick={() => setTab('team')} icon="👤" />
              <StatCard title="Assign Databases" value="Grant access" hint="Control which lists each user sees" onClick={() => setTab('databases')} icon="🗂️" />
              <StatCard title="Server Health" value="OK" hint="Everything looks good" icon="✅" />
            </div>
          </section>
        )}

        {tab === 'team' && (
          <>
            <section className="glass-panel" aria-labelledby="create-user">
              <div>
                <h2 className="section-heading" id="create-user">Team management</h2>
                <p className="section-subtext">Add teammates, choose a role, and assign databases.</p>
              </div>
              <div style={{ marginTop: 20 }}>
                <AdminUsers onCreated={onUserCreated} />
              </div>
            </section>

            <section className="glass-panel" aria-labelledby="user-access">
              <div>
                <h3 className="section-heading" style={{ fontSize: '1.4rem' }} id="user-access">User access & databases</h3>
                <p className="section-subtext">Toggle which voter databases each user can access.</p>
              </div>

              {status.text && (
                <div className={`alert ${status.type === 'error' ? 'alert--error' : 'alert--info'}`} style={{ marginTop: 20 }} role="status">
                  <span aria-hidden>{status.type === 'error' ? '⚠️' : '✅'}</span>
                  <span>{status.text}</span>
                </div>
              )}

              {loading ? (
                <p className="section-subtext" style={{ marginTop: 16 }}>Loading users…</p>
              ) : users.length === 0 ? (
                <p className="section-subtext" style={{ marginTop: 16 }}>No team members found yet.</p>
              ) : (
                <div style={{ marginTop: 24, overflowX: 'auto' }}>
                  <table className="table-shell">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Allowed databases</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => {
                        const userId = resolveId(user);
                        const assigned = new Set(user?.allowedDatabaseIds || user?.databaseIds || []);
                        const isAdmin = (user?.role || '').toLowerCase() === 'admin';
                        return (
                          <tr key={userId || Math.random()}>
                            <td style={{ fontWeight: 600 }}>{user?.username || '—'}</td>
                            <td>
                              <select
                                className="select-field"
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
                            <td>
                              <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
                                {databases.length > 0 ? (
                                  databases.map((db) => {
                                    const id = resolveId(db);
                                    return (
                                      <label key={id} className="glass-pill" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                        <input
                                          type="checkbox"
                                          checked={assigned.has(id)}
                                          onChange={(e) => onToggleDatabase(userId, id, e.target.checked)}
                                        />
                                        <span style={{ fontSize: '0.9rem' }}>{databaseDisplayName(db)}</span>
                                      </label>
                                    );
                                  })
                                ) : (
                                  <span className="section-subtext">No voter databases available.</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <button
                                className="btn btn--ghost"
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
          <section className="glass-panel" aria-labelledby="database-panel">
            <div>
              <h2 className="section-heading" id="database-panel">Voter databases</h2>
              <p className="section-subtext">Assign these lists to team members from the Team tab.</p>
            </div>

            <div className="card-grid" style={{ marginTop: 20 }}>
              {databases.length === 0 ? (
                <p className="section-subtext">No voter databases available.</p>
              ) : (
                databases.map((db) => {
                  const label = databaseDisplayName(db);
                  return (
                    <div key={resolveId(db)} className="glass-pill" style={{ gap: 8 }}>
                      <div style={{ fontWeight: 600 }}>{label}</div>
                      <div className="section-subtext">
                        ID: <code>{resolveId(db)}</code>
                      </div>
                      <div>
                        <Link className="btn btn--ghost" to="/search">Open in Search</Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="glass-panel" aria-labelledby="settings">
            <div>
              <h2 className="section-heading" id="settings">Settings</h2>
              <p className="section-subtext">General admin preferences.</p>
            </div>

            <div className="card-grid" style={{ marginTop: 20 }}>
              <div className="glass-pill" style={{ gap: 8 }}>
                <div style={{ fontWeight: 600 }}>Theme</div>
                <p className="section-subtext">Using a light, professional palette (green / grey / black / white).</p>
              </div>

              <div className="glass-pill" style={{ gap: 12 }}>
                <div style={{ fontWeight: 600 }}>Shortcuts</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <Link to="/search" className="btn btn--ghost">Go to Search</Link>
                  <button type="button" className="btn btn--ghost" onClick={() => setTab('team')}>
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
