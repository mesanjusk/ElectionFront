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

  return (
    <div className="page page--center">
      <div className="card auth-card login-card">
        <header className="login-card__header">
          <div className="brand brand--center">
            <span className="brand__mark">SB</span>
            <div>
              <span className="brand__title">SMart BOOK Admin</span>
              <p className="login-card__tagline">Control centre access</p>
            </div>
          </div>
        </header>

        {error && (
          <div className="alert alert--error" role="alert" style={{ marginBottom: '1rem' }}>
            <span aria-hidden>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form className="form-grid" onSubmit={onSubmit}>
          <label className="field">
            <span className="field__label">Username</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              type="text"
              autoComplete="username"
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Password</span>
            <input
              className="input"
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
          <div className="login-progress" role="status" aria-live="polite">
            <div className="login-progress__bar">
              <span
                className="login-progress__fill"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <span className="login-progress__label">Preparing admin workspace…</span>
          </div>
        ) : (
          <p className="login-card__hint">
            Need field access instead? Go back to the regular login page.
          </p>
        )}
      </div>
    </div>
  );
}
