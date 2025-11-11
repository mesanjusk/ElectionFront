// client/src/pages/AdminHome.jsx
import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import AdminUsers from './AdminUsers.jsx';
import {
  getUser,
  getAvailableDatabases,
  setAvailableDatabases,
} from '../auth';

function resolveId(entity) {
  return entity?.id || entity?._id;
}

function databaseDisplayName(db) {
  if (!db) return '';
  return db.name || db.title || db.label || `Database ${resolveId(db)}`;
}

function StatCard({ title, value, hint, onClick, href, icon = '📊' }) {
  const content = (
    <div
      className="stat-card"
      style={{
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 16,
        padding: '1rem',
        background: '#fff',
        display: 'grid',
        gap: '0.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        cursor: onClick || href ? 'pointer' : 'default',
        transition: 'transform 120ms ease',
      }}
      onClick={onClick}
      onKeyDown={(e) => (onClick && (e.key === 'Enter' || e.key === ' ')) && onClick()}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }}>{icon}</div>
      <div style={{ fontWeight: 600, color: '#111827' }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#065f46' }}>{value}</div>
      {hint && <div style={{ color: '#6b7280', fontSize: 13 }}>{hint}</div>}
    </div>
  );

  if (href) {
    return (
      <a href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {content}
      </a>
    );
  }
  return content;
}

export default function AdminHome() {
  const [tab, setTab] = useState('overview'); // 'overview' | 'team' | 'databases' | 'settings'
  const [databases, setDatabases] = useState(() => getAvailableDatabases());
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', text: '' });
  const [savingId, setSavingId] = useState(null);

  const currentUser = useMemo(() => getUser(), []);

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

  useEffect(() => {
    loadDatabases();
    loadUsers();
  }, []);

  const onUserCreated = () => {
    loadUsers();
  };

  const updateUserField = (id, updater) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (resolveId(u) !== id) return u;
        return updater(u);
      }),
    );
  };

  const onRoleChange = (id, role) => {
    updateUserField(id, (u) => ({ ...u, role }));
  };

  const onToggleDatabase = (id, databaseId, checked) => {
    updateUserField(id, (u) => {
      const dbIds = new Set(u.databaseIds || []);
      if (checked) dbIds.add(databaseId);
      else dbIds.delete(databaseId);
      return { ...u, databaseIds: Array.from(dbIds) };
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
        databaseIds: user.databaseIds || [],
      };
      const { data } = await api.put(`/api/admin/users/${userId}`, payload);
      const saved = data?.user || user;
      updateUserField(userId, () => saved);
      showStatus(
        'success',
        `Updated ${saved.username || user.username || saved.email || user.email || 'user'}`
      );
    } catch (e) {
      showStatus('error', e?.response?.data?.error || 'Failed to update user.');
    } finally {
      setSavingId(null);
    }
  };

  const totalUsers = users.length;
  const totalAdmins = users.filter((u) => (u.role || '').toLowerCase() === 'admin').length;
  const totalOperators = totalUsers - totalAdmins;
  const totalDatabases = databases.length;

  const Toolbar = (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="badge" style={{ background: '#e6f7ef', color: '#065f46', padding: '6px 10px', borderRadius: 999 }}>
          Admin
        </span>
        {(currentUser?.email || currentUser?.username) && (
          <span className="help-text" style={{ color: '#6b7280' }}>
            Signed in as{' '}
            <b style={{ color: '#111827' }}>
              {currentUser?.username || currentUser?.email}
            </b>
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          className="btn"
          type="button"
          onClick={() => {
            loadDatabases();
            loadUsers();
          }}
          style={{
            background: '#065f46',
            color: 'white',
            borderRadius: 10,
            padding: '8px 12px',
            border: 'none',
          }}
        >
          ⟳ Refresh
        </button>
      </div>
    </div>
  );

  const TabBar = (
    <div
      role="tablist"
      aria-label="Admin tabs"
      style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        paddingBottom: '0.5rem',
      }}
    >
      {[
        ['overview', 'Overview'],
        ['team', 'Team'],
        ['databases', 'Databases'],
        ['settings', 'Settings'],
      ].map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={tab === key}
          className="btn btn--ghost"
          onClick={() => setTab(key)}
          style={{
            borderRadius: 999,
            padding: '6px 12px',
            border: tab === key ? '1px solid #065f46' : '1px solid transparent',
            background: tab === key ? '#e6f7ef' : 'transparent',
            color: tab === key ? '#065f46' : '#111827',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page" style={{ padding: '2rem 1rem', background: '#f8fafc' }}>
      <div
        className="page__content"
        style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gap: '1.25rem' }}
      >
        <header
          className="panel"
          style={{
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: 16,
            padding: '1.25rem',
          }}
        >
          <div className="panel__header" style={{ display: 'grid', gap: '0.25rem' }}>
            <h1 className="panel__title" style={{ margin: 0 }}>Admin Dashboard</h1>
            <p className="panel__subtitle" style={{ margin: 0, color: '#6b7280' }}>
              Manage users, assign voter databases, and jump to common actions.
            </p>
          </div>
          <div style={{ marginTop: '0.75rem' }}>{Toolbar}</div>
          <div style={{ marginTop: '1rem' }}>{TabBar}</div>
        </header>

        {/* Overview */}
        {tab === 'overview' && (
          <section aria-labelledby="overview" className="panel" style={{ background: 'transparent' }}>
            <div
              style={{
                display: 'grid',
                gap: '1rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              }}
            >
              <StatCard title="Total Users" value={totalUsers} hint="All teammates" icon="👥" onClick={() => setTab('team')} />
              <StatCard title="Admins" value={totalAdmins} hint="Full access" icon="🛡️" onClick={() => setTab('team')} />
              <StatCard title="Operators" value={totalOperators} hint="Limited access" icon="🧑‍💻" onClick={() => setTab('team')} />
              <StatCard title="Voter Databases" value={totalDatabases} hint="Available lists" icon="🗃️" onClick={() => setTab('databases')} />
            </div>

            <div
              style={{
                marginTop: '1.25rem',
                display: 'grid',
                gap: '1rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              }}
            >
              <StatCard
                title="Open Voter Search"
                value="Search & Filter"
                hint="Find voters quickly"
                href="/search"
                icon="🔎"
              />
              <StatCard
                title="Manage Users"
                value="Add / Edit / Assign"
                hint="Create users and set roles"
                onClick={() => setTab('team')}
                icon="👤"
              />
              <StatCard
                title="Assign Databases"
                value="Grant access"
                hint="Control which lists each user sees"
                onClick={() => setTab('databases')}
                icon="🗂️"
              />
              <StatCard
                title="Server Health"
                value="OK"
                hint="Everything looks good"
                icon="✅"
              />
            </div>
          </section>
        )}

        {/* Team */}
        {tab === 'team' && (
          <>
            <section className="panel" aria-labelledby="create-user">
              <div className="panel__header">
                <h2 className="panel__title" id="create-user">Team management</h2>
                <p className="panel__subtitle">
                  Add teammates (username only — email optional), choose a role, and assign databases.
                </p>
              </div>
              <AdminUsers onCreated={onUserCreated} />
            </section>

            <section className="panel" aria-labelledby="user-access">
              <div className="panel__header">
                <h3 className="panel__title" id="user-access">User access & databases</h3>
                <p className="panel__subtitle">
                  Toggle which voter databases each user can access.
                </p>
              </div>

              {status.text && (
                <div
                  className={`alert ${status.type === 'error' ? 'alert--error' : 'alert--success'}`}
                  role="status"
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.75rem 1rem',
                    borderRadius: 10,
                    background: status.type === 'error' ? '#fef2f2' : '#ecfdf5',
                    color: status.type === 'error' ? '#991b1b' : '#065f46',
                    border: `1px solid ${status.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
                    marginBottom: '0.75rem',
                  }}
                >
                  <span aria-hidden>{status.type === 'error' ? '⚠️' : '✅'}</span>
                  <span>{status.text}</span>
                </div>
              )}

              {loading ? (
                <p className="help-text">Loading users…</p>
              ) : users.length === 0 ? (
                <p className="help-text">No team members found yet.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>User</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Role</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Allowed databases</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => {
                        const userId = resolveId(user);
                        const assigned = new Set(user.databaseIds || []);
                        return (
                          <tr key={userId} style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                            <td style={{ padding: '0.5rem' }}>
                              <div style={{ display: 'grid', lineHeight: 1.25 }}>
                                <b>{user.username || '—'}</b>
                                {user.email && (
                                  <span style={{ color: '#6b7280', fontSize: 12 }}>{user.email}</span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '0.5rem' }}>
                              <select
                                className="select"
                                value={user.role}
                                onChange={(e) => onRoleChange(userId, e.target.value)}
                              >
                                <option value="operator">Operator</option>
                                <option value="admin">Administrator</option>
                              </select>
                            </td>
                            <td style={{ padding: '0.5rem' }}>
                              <div style={{ display: 'grid', gap: '0.4rem' }}>
                                {databases.map((db) => {
                                  const id = resolveId(db);
                                  return (
                                    <label key={id} className="checkbox" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                      <input
                                        type="checkbox"
                                        checked={assigned.has(id)}
                                        onChange={(e) => onToggleDatabase(userId, id, e.target.checked)}
                                      />
                                      <span>{databaseDisplayName(db)}</span>
                                    </label>
                                  );
                                })}
                                {databases.length === 0 && (
                                  <span className="help-text">No voter databases available.</span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '0.5rem' }}>
                              <button
                                className="btn btn--ghost"
                                type="button"
                                onClick={() => saveUser(user)}
                                disabled={savingId === userId}
                                style={{
                                  borderRadius: 10,
                                  border: '1px solid rgba(0,0,0,0.1)',
                                  padding: '6px 10px',
                                }}
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
          <section className="panel" aria-labelledby="database-panel">
            <div className="panel__header">
              <h2 className="panel__title" id="database-panel">Voter databases</h2>
              <p className="panel__subtitle">
                Your available lists. Assign them to team members from the <b>Team</b> tab.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gap: '0.75rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              }}
            >
              {databases.length === 0 ? (
                <p className="help-text">No voter databases available.</p>
              ) : (
                databases.map((db) => {
                  const label = databaseDisplayName(db);
                  return (
                    <div
                      key={resolveId(db)}
                      style={{
                        background: '#fff',
                        border: '1px solid rgba(0,0,0,0.06)',
                        borderRadius: 14,
                        padding: '0.9rem',
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{label}</div>
                      <div style={{ color: '#6b7280', fontSize: 13 }}>
                        ID: <code>{resolveId(db)}</code>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <a className="btn btn--ghost" href="/search" style={{ borderRadius: 10, padding: '6px 10px' }}>
                          Open in Search
                        </a>
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
          <section className="panel" aria-labelledby="settings">
            <div className="panel__header">
              <h2 className="panel__title" id="settings">Settings</h2>
              <p className="panel__subtitle">General admin preferences.</p>
            </div>

            <div
              style={{
                display: 'grid',
                gap: '0.75rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              }}
            >
              <div
                style={{
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,0.06)',
                  borderRadius: 14,
                  padding: '0.9rem',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 600 }}>Theme</div>
                <div className="help-text" style={{ color: '#6b7280' }}>
                  Using a light, professional palette (green / grey / black / white).
                </div>
              </div>

              <div
                style={{
                  background: '#fff',
                  border: '1px solid rgba(0,0,0,0.06)',
                  borderRadius: 14,
                  padding: '0.9rem',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 600 }}>Shortcuts</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href="/search" className="btn btn--ghost" style={{ borderRadius: 10, padding: '6px 10px' }}>
                    Go to Search
                  </a>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setTab('team')}
                    style={{ borderRadius: 10, padding: '6px 10px' }}
                  >
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
