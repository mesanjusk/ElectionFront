// client/src/pages/AdminHome.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import AdminUsers from './AdminUsers.jsx';
import { getUser, getAvailableDatabases, setAvailableDatabases } from '../auth';
import './Admin.css';

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
    <Component className="admin-stat-card" {...interactiveProps}>
      <div className="admin-stat-card__icon" aria-hidden>{icon}</div>
      <div className="admin-stat-card__title">{title}</div>
      <div className="admin-stat-card__value">{value}</div>
      {hint && <div className="admin-stat-card__hint">{hint}</div>}
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
    // normalize in UI if someone still selects 'volunteer'
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
        role: user.role, // 'operator'|'candidate'|'user'|'admin'
        allowedDatabaseIds: user.allowedDatabaseIds || [],
      };
      const { data } = await api.put(`/api/admin/users/${userId}`, payload);
      const saved = data?.user || user;
      updateUserField(userId, () => saved);
      showStatus('success', `Updated ${saved.username || user.username || saved.email || user.email || 'user'}`);
    } catch (e) {
      showStatus('error', e?.response?.data?.error || 'Failed to update user.');
    } finally {
      setSavingId(null);
    }
  };

  // ---- Stats
  const roleOf = (u) => (u?.role || '').toLowerCase();
  const totalUsers = users.length;
  const totalAdmins = users.filter((u) => roleOf(u) === 'admin').length;
  const totalOperators = users.filter((u) => roleOf(u) === 'operator').length;
  const totalCandidates = users.filter((u) => roleOf(u) === 'candidate').length;
  const totalPlainUsers = users.filter((u) => roleOf(u) === 'user').length;
  const totalDatabases = databases.length;

  const Toolbar = (
    <div className="admin-toolbar">
      <div className="admin-toolbar__group">
        <span className="admin-badge">Admin</span>
        {(currentUser?.email || currentUser?.username) && (
          <span className="help-text">Signed in as <b>{currentUser?.username || currentUser?.email}</b></span>
        )}
      </div>
      <div className="admin-toolbar__group">
        <button className="btn btn--primary" type="button" onClick={() => { loadDatabases(); loadUsers(); }}>
          ⟳ Refresh
        </button>
      </div>
    </div>
  );

  const TabBar = (
    <div role="tablist" aria-label="Admin tabs" className="admin-tabs">
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
          className="admin-tab"
          onClick={() => setTab(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page admin-page">
      <div className="admin-page__content">
        <header className="admin-surface admin-surface--header">
          <div className="admin-surface__header">
            <h1 className="panel__title">Admin Dashboard</h1>
            <p className="panel__subtitle">Manage users, assign voter databases, and jump to common actions.</p>
          </div>
          {Toolbar}
          {TabBar}
        </header>

        {/* Overview */}
        {tab === 'overview' && (
          <section aria-labelledby="overview" className="admin-surface">
            <div className="admin-grid admin-grid--stats">
              <StatCard title="Total Accounts" value={totalUsers} hint="All members" icon="👥" onClick={() => setTab('team')} />
              <StatCard title="Admins" value={totalAdmins} hint="Full access" icon="🛡️" onClick={() => setTab('team')} />
              <StatCard title="Operators" value={totalOperators} hint="On-ground users" icon="🤝" onClick={() => setTab('team')} />
              <StatCard title="Candidates" value={totalCandidates} hint="Candidate logins" icon="🎯" onClick={() => setTab('team')} />
              <StatCard title="Users" value={totalPlainUsers} hint="General role" icon="🧑‍💼" onClick={() => setTab('team')} />
              <StatCard title="Voter Databases" value={totalDatabases} hint="Available lists" icon="🗃️" onClick={() => setTab('databases')} />
            </div>

            <div className="admin-grid admin-grid--actions">
              <StatCard title="Open Voter Search" value="Search & Filter" hint="Find voters quickly" href="/search" icon="🔎" />
              <StatCard title="Manage Users" value="Add / Edit / Assign" hint="Create users and set roles" onClick={() => setTab('team')} icon="👤" />
              <StatCard title="Assign Databases" value="Grant access" hint="Control which lists each user sees" onClick={() => setTab('databases')} icon="🗂️" />
              <StatCard title="Server Health" value="OK" hint="Everything looks good" icon="✅" />
            </div>
          </section>
        )}

        {/* Team */}
        {tab === 'team' && (
          <>
            <section className="admin-surface" aria-labelledby="create-user">
              <div className="admin-surface__header">
                <h2 className="panel__title" id="create-user">Team management</h2>
                <p className="panel__subtitle">Add teammates (username only — email optional), choose a role, and assign databases.</p>
              </div>
              <AdminUsers onCreated={onUserCreated} />
            </section>

            <section className="admin-surface" aria-labelledby="user-access">
              <div className="admin-surface__header">
                <h3 className="panel__title" id="user-access">User access & databases</h3>
                <p className="panel__subtitle">Toggle which voter databases each user can access.</p>
              </div>

              {status.text && (
                <div className={`alert ${status.type === 'error' ? 'alert--error' : 'alert--success'}`} role="status">
                  <span aria-hidden>{status.type === 'error' ? '⚠️' : '✅'}</span>
                  <span>{status.text}</span>
                </div>
              )}

              {loading ? (
                <p className="help-text admin-loading">Loading users…</p>
              ) : users.length === 0 ? (
                <p className="help-text admin-empty">No team members found yet.</p>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
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
                            <td data-label="User">
                              <div className="admin-user-meta">
                                <b>{user?.username || '—'}</b>
                                {user?.email && <span className="admin-user-email">{user.email}</span>}
                              </div>
                            </td>
                            <td data-label="Role">
                              <select
                                className="select"
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
                            <td data-label="Allowed databases">
                              <div className="admin-checkbox-list">
                                {databases.length > 0 ? (
                                  databases.map((db) => {
                                    const id = resolveId(db);
                                    return (
                                      <label key={id} className="admin-checkbox">
                                        <input
                                          type="checkbox"
                                          checked={assigned.has(id)}
                                          onChange={(e) => onToggleDatabase(userId, id, e.target.checked)}
                                        />
                                        <span>{databaseDisplayName(db)}</span>
                                      </label>
                                    );
                                  })
                                ) : (
                                  <span className="help-text">No voter databases available.</span>
                                )}
                              </div>
                            </td>
                            <td data-label="Actions">
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

        {/* Databases */}
        {tab === 'databases' && (
          <section className="admin-surface" aria-labelledby="database-panel">
            <div className="admin-surface__header">
              <h2 className="panel__title" id="database-panel">Voter databases</h2>
              <p className="panel__subtitle">Your available lists. Assign them to team members from the <b>Team</b> tab.</p>
            </div>

            <div className="admin-database-grid">
              {databases.length === 0 ? (
                <p className="help-text admin-empty">No voter databases available.</p>
              ) : (
                databases.map((db) => {
                  const label = databaseDisplayName(db);
                  return (
                    <div key={resolveId(db)} className="admin-database-card">
                      <div className="admin-section-title">{label}</div>
                      <div className="help-text">ID: <code>{resolveId(db)}</code></div>
                      <div className="admin-card-actions">
                        <Link className="btn btn--ghost" to="/search">Open in Search</Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* Settings */}
        {tab === 'settings' && (
          <section className="admin-surface" aria-labelledby="settings">
            <div className="admin-surface__header">
              <h2 className="panel__title" id="settings">Settings</h2>
              <p className="panel__subtitle">General admin preferences.</p>
            </div>

            <div className="admin-database-grid">
              <div className="admin-settings-card">
                <div className="admin-section-title">Theme</div>
                <div className="help-text">Using a light, professional palette (green / grey / black / white).</div>
              </div>

              <div className="admin-settings-card">
                <div className="admin-section-title">Shortcuts</div>
                <div className="admin-card-actions">
                  <Link to="/search" className="btn btn--ghost">Go to Search</Link>
                  <button type="button" className="btn btn--ghost" onClick={() => setTab('team')}>Manage Users</button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
