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

  const cardClass =
    'w-full max-w-md rounded-[30px] border border-emerald-100/70 bg-white/90 p-8 shadow-2xl shadow-emerald-900/10 backdrop-blur';
  const labelClass = 'text-sm font-semibold text-slate-600';
  const inputClass =
    'mt-2 w-full rounded-2xl border border-emerald-100 bg-white/80 px-4 py-3 text-base text-slate-900 shadow-inner shadow-emerald-900/5 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200';
  const primaryBtn =
    'inline-flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className={cardClass}>
        <header className="flex flex-col items-center gap-2 text-center">
          <div className="inline-flex items-center gap-3 rounded-2xl bg-emerald-50/70 px-4 py-2 text-emerald-700">
            <span className="text-2xl font-black tracking-tight">SB</span>
            <div className="text-left">
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">SMart Book Admin</p>
              <p className="text-xs text-slate-500">Control centre access</p>
            </div>
          </div>
        </header>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
            <span aria-hidden>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className={labelClass}>Username</span>
            <input
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              type="text"
              autoComplete="username"
              required
            />
          </label>

          <label className="block">
            <span className={labelClass}>Password</span>
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </label>

          <button className={primaryBtn} disabled={loading} type="submit">
            {loading ? 'Syncing data…' : 'Sign in'}
          </button>
        </form>

        {loading ? (
          <div className="mt-6 space-y-2" role="status" aria-live="polite">
            <div className="h-3 w-full overflow-hidden rounded-full bg-emerald-100">
              <span
                className="block h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <span className="block text-center text-sm text-slate-500">Preparing admin workspace…</span>
          </div>
        ) : (
          <p className="mt-6 text-center text-sm text-slate-500">
            Need field access instead? Go back to the regular login page.
          </p>
        )}
      </div>
    </div>
  );
}
