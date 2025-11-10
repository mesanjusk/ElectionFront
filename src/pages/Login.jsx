// client/src/pages/Login.jsx
import React, { useState } from 'react';
import { apiLogin, setAuthToken } from '../services/api';
import { pullAll, resetSyncState } from '../services/sync';
import { setSession, setActiveDatabase, getActiveDatabase, getAvailableDatabases } from '../auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { token, user, databases = [], activeDatabaseId } = await apiLogin({ email, password });
      const available = databases.length ? databases : user?.databases || [];
      setSession({ token, user, databases: available });
      setAuthToken(token);
      if (activeDatabaseId) setActiveDatabase(activeDatabaseId);
      const activeDatabase = activeDatabaseId || getActiveDatabase();
      const storedDatabases = getAvailableDatabases();
      const firstDatabase = storedDatabases[0];
      const effectiveDatabase = activeDatabase || firstDatabase?.id || firstDatabase?._id || null;
      if (effectiveDatabase) setActiveDatabase(effectiveDatabase);
      await resetSyncState(effectiveDatabase);
      let total = 0;
      await pullAll({
        databaseId: effectiveDatabase,
        onProgress: ({ total: t }) => {
          total = t;
          setProgress(t);
        },
      });
      const target = user?.role === 'admin' ? '/admin' : '/';
      const databaseLabel = effectiveDatabase ? ` from database ${effectiveDatabase}` : '';
      alert(`Synced ${total} records${databaseLabel} to your device. You can now work fully offline.`);
      window.location.href = target;
    } catch (err) {
      alert('Login or Sync failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page page--center">
      <div className="card auth-card login-card">
        <header className="login-card__header">
          <div className="brand brand--center">
            <span className="brand__mark">EV</span>
            <div>
              <span className="brand__title">Election Vision</span>
              <p className="login-card__tagline">Mobile operations console</p>
            </div>
          </div>
          <h1 className="login-card__title">Welcome back</h1>
          <p className="login-card__subtitle">
            Sign in to refresh your offline voter database and continue field work anywhere.
          </p>
        </header>

        <form className="form-grid" onSubmit={onSubmit}>
          <label className="field">
            <span className="field__label">Work email</span>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@campaign.org"
              type="email"
              autoComplete="email"
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
            {loading ? 'Syncing data…' : 'Sign in & sync'}
          </button>
        </form>

        {loading ? (
          <div className="login-progress" role="status" aria-live="polite">
            <div className="login-progress__bar">
              <span className="login-progress__fill" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
            <span className="login-progress__label">Downloading {progress.toLocaleString()} records…</span>
          </div>
        ) : (
          <p className="login-card__hint">Offline sync keeps every booth list accessible even without network.</p>
        )}
      </div>
    </div>
  );
}
