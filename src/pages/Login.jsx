// client/src/pages/Login.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiLogin, setAuthToken } from '../services/api';
import { pullAll, pushOutbox, resetSyncState } from '../services/sync';
import {
  setSession,
  setActiveDatabase,
  getActiveDatabase,
  getAvailableDatabases,
  unlockSession,
  getToken,
  isSessionUnlocked,
  lockSession,
  clearToken,
} from '../auth';
import {
  clearActivationState,
  clearRevocationFlag,
  getActivationState,
  getDeviceId,
  setActivationState,
  storeActivation,
  verifyPin,
} from '../services/activation';

// Fixed defaults per requirement
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_PIN = '11';

const PIN_REGEX_2DIGIT = /^\d{2}$/;

/**
 * Choose a concrete database id to use for syncing.
 * Priority:
 *  1) activeDatabaseId from server or previously stored active DB
 *  2) first database from stored list (setSession -> getAvailableDatabases)
 *  3) first allowedDatabaseIds on user
 */
function chooseEffectiveDatabase({ activeDatabaseId, user } = {}) {
  const active = activeDatabaseId || getActiveDatabase();
  if (active) return active;

  const stored = getAvailableDatabases();
  if (stored && stored.length) return stored[0].id || stored[0]._id;

  const allowed = user?.allowedDatabaseIds;
  if (allowed && allowed.length) return allowed[0];

  return null;
}

export default function Login() {
  const navigate = useNavigate();

  const [activation, setActivation] = useState(() => getActivationState());

  // If any user is already activated (has a pinHash and not revoked), default to PIN screen.
  const initialMode = (() => {
    if (activation?.pinHash && !activation?.revoked) return 'pin';
    return 'activate';
  })();
  const [mode, setMode] = useState(initialMode);

  // Language is fixed to English — no UI controls
  const [language] = useState(DEFAULT_LANGUAGE);

  // Username/password only for activation
  const [username, setUsername] = useState(() => activation?.username || '');
  const [password, setPassword] = useState('');

  // PIN entry for unlock (2-digit)
  const [pinInput, setPinInput] = useState('');

  // UX state
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Keep document lang in sync (even though it’s fixed)
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = language;
    if (typeof window !== 'undefined') window.localStorage.setItem('appLanguage', language);
  }, [language]);

  // Handle revocation message
  useEffect(() => {
    if (activation?.revoked) {
      setMode('activate');
      setInfoMessage(
        activation?.revokedMessage ||
          'This device was signed out because your account was activated elsewhere. Reactivate to continue.'
      );
    } else if (infoMessage) {
      setInfoMessage('');
    }
  }, [activation, infoMessage]);

  // Fast-path: if token exists and session is unlocked, go home
  useEffect(() => {
    if (getToken() && isSessionUnlocked()) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  // Helper: where to go after login
  const goAfterLogin = (user, fallbackUserType) => {
    // Respect backend-defined userType/role if you route differently.
    const userType = user?.userType || fallbackUserType;
    if (user?.role === 'admin') return navigate('/admin', { replace: true });
    if (userType === 'candidate') return navigate('/search', { replace: true });
    return navigate('/', { replace: true });
  };

  const completeLogin = async ({ token, user, databases = [], activeDatabaseId }) => {
    const available = databases.length ? databases : user?.databases || [];
    setSession({ token, user, databases: available });
    setAuthToken(token);

    // Decide an effective DB, persist it, and use it for sync.
    let effectiveDatabase = chooseEffectiveDatabase({ activeDatabaseId, user });
    if (effectiveDatabase) setActiveDatabase(effectiveDatabase);

    let pushResult = null;
    let pushError = null;
    let pullError = null;
    let total = 0;

    // Always push + (attempt to) pull on login
    setProgress(0);
    setProgressLabel('Uploading offline updates…');
    try {
      pushResult = await pushOutbox();
    } catch (err) {
      pushError = err;
    }

    // For first-time activation, reset cursors for a clean pull
    if (!pushError && effectiveDatabase) {
      await resetSyncState(effectiveDatabase);
    }

    setProgress(0);
    setProgressLabel('Downloading latest records…');
    try {
      if (effectiveDatabase) {
        await pullAll({
          databaseId: effectiveDatabase,
          onProgress: ({ total: t }) => {
            total = t;
            setProgress(t);
            setProgressLabel(`Downloading ${t.toLocaleString()} records…`);
          },
        });
      } else {
        // No DB assigned — we still consider login successful, but inform the user.
        total = 0;
      }
    } catch (err) {
      pullError = err;
    }

    if (pushError || pullError) {
      const messages = [];
      if (pushError) messages.push(`push failed: ${pushError?.message || pushError}`);
      if (pullError) messages.push(`pull failed: ${pullError?.message || pullError}`);
      alert(`Login completed with limited sync — ${messages.join(' and ')}.`);
    } else {
      const databaseLabel = effectiveDatabase ? ` from database ${effectiveDatabase}` : '';
      const pushed = pushResult?.pushed || 0;
      alert(
        effectiveDatabase
          ? `Synced ${total.toLocaleString()} records${databaseLabel} after uploading ${pushed} offline updates.`
          : `Logged in. No database assigned yet — ask admin to assign one.`
      );
    }

    return { user };
  };

  const handleActivationSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setInfoMessage('');

    if (!username || username.trim().length < 3) {
      setError('Enter a valid username (at least 3 characters).');
      return;
    }
    if (!password || password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    setLoading(true);
    setProgress(0);
    setProgressLabel('');

    try {
      const deviceId = getDeviceId();
      const response = await apiLogin({ username, password, deviceId });
      const { user } = await completeLogin(response);

      // Store activation with fixed language + fixed two-digit PIN ("11")
      const stored = await storeActivation({
        username,
        language: DEFAULT_LANGUAGE,
        userType: user?.userType, // respect server-defined user type
        pin: DEFAULT_PIN,
      });
      const cleaned = clearRevocationFlag();
      setActivation(cleaned || stored);

      unlockSession();
      setMode('pin');
      setPassword('');

      goAfterLogin(user, user?.userType);
    } catch (err) {
      setError(`Activation failed: ${err?.message || err}`);
    } finally {
      setLoading(false);
      setProgressLabel('');
    }
  };

  const handlePinSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!PIN_REGEX_2DIGIT.test(pinInput)) {
      setError('Enter your 2 digit PIN.');
      return;
    }
    if (!getToken()) {
      // Token expired — force reactivation, but we keep UI minimal.
      setMode('activate');
      setError('Your secure token has expired. Reactivate with your username and password.');
      return;
    }

    const valid = await verifyPin(pinInput);
    if (!valid) {
      setError('Incorrect PIN. Try again or reactivate to set a new one.');
      return;
    }

    const token = getToken();
    setLoading(true);
    setProgress(0);
    setProgressLabel('Uploading offline updates…');
    setAuthToken(token);

    let effectiveDatabase = chooseEffectiveDatabase({});
    if (effectiveDatabase) setActiveDatabase(effectiveDatabase);

    let pushResult = null;
    let pushError = null;
    let pulled = 0;
    let pullError = null;

    try {
      // Always push
      try {
        pushResult = await pushOutbox();
      } catch (err) {
        pushError = err;
      }

      // Always attempt pull
      setProgress(0);
      setProgressLabel('Downloading latest records…');
      try {
        if (effectiveDatabase) {
          await pullAll({
            databaseId: effectiveDatabase,
            onProgress: ({ total: t }) => {
              pulled = t;
              setProgress(t);
              setProgressLabel(`Downloading ${t.toLocaleString()} records…`);
            },
          });
        } else {
          pulled = 0;
        }
      } catch (err) {
        pullError = err;
      }

      const updated = setActivationState({ language: DEFAULT_LANGUAGE, revoked: false });
      setActivation(updated);
      unlockSession();
      setPinInput('');

      if (pushError || pullError) {
        const parts = [];
        if (pushError) parts.push(`push failed: ${pushError?.message || pushError}`);
        if (pullError) parts.push(`pull failed: ${pullError?.message || pullError}`);
        alert(`Unlocked with limited sync — ${parts.join(' and ')}.`);
      } else {
        const pushed = pushResult?.pushed || 0;
        alert(
          effectiveDatabase
            ? `Sync complete. Uploaded ${pushed} changes and downloaded ${pulled} updates.`
            : `Unlocked. No database assigned yet — ask admin to assign one.`
        );
      }

      // Use whatever was stored earlier for routing; backend-defined is preferred.
      const fallbackType = activation?.userType;
      goAfterLogin(updated?.user, fallbackType);
      navigate('/', { replace: true }); // safe default
    } finally {
      setLoading(false);
      setProgress(0);
      setProgressLabel('');
    }
  };

  const startReactivation = () => {
    lockSession();
    clearToken();
    clearActivationState();
    setActivation(null);
    setMode('activate');
    setPinInput('');
    setPassword('');
    setError('');
    setInfoMessage('Reactivate this device with your username and password.');
  };

  const showActivation = mode === 'activate' && !(activation?.pinHash && !activation?.revoked);

  const cardClass =
    'w-full max-w-md rounded-[30px] border border-emerald-100/70 bg-white/90 p-8 shadow-2xl shadow-emerald-900/10 backdrop-blur';
  const labelClass = 'text-sm font-semibold text-slate-600';
  const inputClass =
    'mt-2 w-full rounded-2xl border border-emerald-100 bg-white/80 px-4 py-3 text-base text-slate-900 shadow-inner shadow-emerald-900/5 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200';
  const primaryBtn =
    'inline-flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:opacity-60';
  const secondaryBtn =
    'inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500';

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className={cardClass}>
        <header className="flex flex-col items-center gap-2 text-center">
          <div className="inline-flex items-center gap-3 rounded-2xl bg-emerald-50/70 px-4 py-2 text-emerald-700">
            <span className="text-2xl font-black tracking-tight">SB</span>
            <div className="text-left">
              <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">SMart Book</p>
              <p className="text-xs text-slate-500">Manage voters data</p>
            </div>
          </div>
          {!showActivation && (
            <p className="text-sm text-slate-500">Enter your PIN to continue.</p>
          )}
        </header>

        <div className="mt-6 space-y-3">
          {infoMessage && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-900" role="status">
              <span aria-hidden>⚠️</span>
              <span>{infoMessage}</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
              <span aria-hidden>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        {showActivation ? (
          <form className="mt-6 space-y-4" onSubmit={handleActivationSubmit}>
            <label className="block">
              <span className={labelClass}>Username</span>
              <input
                className={inputClass}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="smart book"
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
              {loading ? 'Syncing data…' : 'Activate & sync'}
            </button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handlePinSubmit}>
            <label className="block">
              <span className={labelClass}>2 digit PIN</span>
              <input
                className={inputClass}
                inputMode="numeric"
                pattern="[0-9]{2}"
                maxLength={2}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                placeholder="••"
                autoFocus
                required
              />
            </label>

            <button className={primaryBtn} type="submit">
              Login
            </button>

            <button className={secondaryBtn} type="button" onClick={startReactivation}>
              Reactivate this device
            </button>
          </form>
        )}

        {loading && (
          <div className="mt-6 space-y-2" role="status" aria-live="polite">
            <div className="h-3 w-full overflow-hidden rounded-full bg-emerald-100">
              <span
                className="block h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <span className="block text-center text-sm text-slate-500">
              {progressLabel || `Downloading ${progress.toLocaleString()} records…`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
