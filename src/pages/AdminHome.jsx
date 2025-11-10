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

export default function AdminHome() {
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
      showStatus('success', `Updated ${saved.email || user.email}`);
    } catch (e) {
      showStatus('error', e?.response?.data?.error || 'Failed to update user.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="page" style={{ padding: '2rem 1rem' }}>
      <div className="page__content" style={{ maxWidth: '960px', margin: '0 auto', display: 'grid', gap: '2rem' }}>
        <header className="panel">
          <div className="panel__header">
            <h1 className="panel__title">Admin control centre</h1>
            <p className="panel__subtitle">
              Manage teammates, assign voter databases and keep your campaign data compartmentalised.
            </p>
          </div>
          {currentUser?.email && (
            <p className="help-text">You are signed in as {currentUser.email}.</p>
          )}
        </header>

        <AdminUsers onCreated={onUserCreated} />

        <section className="panel" aria-labelledby="database-panel">
          <div className="panel__header">
            <h2 className="panel__title" id="database-panel">Voter databases</h2>
            <p className="panel__subtitle">
              Assign one or more voter databases to each user. They will only be able to sync data from the selected lists.
            </p>
          </div>
          {status.text && (
            <div
              className={`alert ${status.type === 'error' ? 'alert--error' : 'alert--success'}`}
              role="status"
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
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Email</th>
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
                        <td style={{ padding: '0.5rem' }}>{user.email}</td>
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
                                <label key={id} className="checkbox">
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
      </div>
    </div>
  );
}
