import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiLogin, setAuthToken } from '../services/api';
import { pullAll, resetSyncState } from '../services/sync';
import {
  getActiveDatabase,
  getAvailableDatabases,
  getToken,
  isSessionUnlocked,
  setActiveDatabase,
  setSession,
  unlockSession,
} from '../auth';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (getToken() && isSessionUnlocked()) {
      navigate('/admin', { replace: true });
    }
  }, [navigate]);

  const completeLogin = async ({ token, user, databases = [], activeDatabaseId }) => {
    const available = databases.length ? databases : user?.databases || [];
    setSession({ token, user, databases: available });
    setAuthToken(token);
    if (activeDatabaseId) setActiveDatabase(activeDatabaseId);
    const activeDatabase = activeDatabaseId || getActiveDatabase();
    const storedDatabases = getAvailableDatabases();
    const firstDatabase = storedDatabases[0];
    const effectiveDatabase = activeDatabase || firstDatabase?.id || firstDatabase?._id || null;
    if (effectiveDatabase) {
      await resetSyncState(effectiveDatabase);
      let total = 0;
      await pullAll({
        databaseId: effectiveDatabase,
        onProgress: ({ total: t }) => {
          total = t;
          setProgress(t);
        },
      });
      const databaseLabel = effectiveDatabase ? ` from database ${effectiveDatabase}` : '';
      alert(`Synced ${total} records${databaseLabel} to your device. You can now work fully offline.`);
    } else {
      alert('Admin login complete. Assign voter databases to team members from the dashboard.');
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    setProgress(0);
    try {
      const response = await apiLogin({ username, password });
      if (response?.user?.role !== 'admin') {
        throw new Error('Admin access required.');
      }
      await completeLogin(response);
      unlockSession();
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(`Admin login failed: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const cardStyle = {
    width: 'min(420px, 100%)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--surface-border)',
    background: 'var(--surface)',
    padding: '32px',
    boxShadow: '0 40px 80px rgba(15,23,42,0.15)',
  };

  return (
    <div className="page-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={cardStyle}>
        <header style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 18px',
              borderRadius: 22,
              background: 'var(--brand-soft)',
              color: 'var(--brand-dark)',
            }}
          >
            <span style={{ fontWeight: 800, fontSize: '1.4rem' }}>SB</span>
            <div style={{ textAlign: 'left' }}>
              <p style={{ margin: 0, fontSize: '0.75rem', letterSpacing: '0.18em', textTransform: 'uppercase' }}>SMart Book Admin</p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>Control centre access</p>
            </div>
          </div>
        </header>

        {error && (
          <div className="alert alert--error" style={{ marginTop: 24 }} role="alert">
            <span aria-hidden>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }} onSubmit={onSubmit}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted-dark)' }}>Username</span>
            <input
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              type="text"
              autoComplete="username"
              required
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted-dark)' }}>Password</span>
            <input
              className="input-field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </label>

          <button className="btn btn--primary" disabled={loading} type="submit">
            {loading ? 'Syncing data…' : 'Sign in'}
          </button>
        </form>

        {loading ? (
          <div style={{ marginTop: 24 }} role="status" aria-live="polite">
            <div className="progress-track">
              <span className="progress-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
            <p className="section-subtext" style={{ textAlign: 'center', marginTop: 8 }}>Preparing admin workspace…</p>
          </div>
        ) : (
          <p className="section-subtext" style={{ textAlign: 'center', marginTop: 24 }}>
            Need field access instead? Go back to the regular login page.
          </p>
        )}
      </div>
    </div>
  );
}
