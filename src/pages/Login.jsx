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
        <header style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 16px',
              borderRadius: 20,
              background: 'var(--brand-soft)',
              color: 'var(--brand-dark)',
            }}
          >
            <span style={{ fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.04em' }}>SB</span>
            <div style={{ textAlign: 'left' }}>
              <p style={{ margin: 0, fontSize: '0.75rem', letterSpacing: '0.2em', textTransform: 'uppercase' }}>SMart Book</p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>Manage voters data</p>
            </div>
          </div>
          {!showActivation && (
            <p className="section-subtext" style={{ marginTop: 12 }}>
              Enter your PIN to continue.
            </p>
          )}
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {infoMessage && (
            <div className="alert alert--info" role="status">
              <span aria-hidden>⚠️</span>
              <span>{infoMessage}</span>
            </div>
          )}
          {error && (
            <div className="alert alert--error" role="alert">
              <span aria-hidden>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        {showActivation ? (
          <form style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }} onSubmit={handleActivationSubmit}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted-dark)' }}>Username</span>
              <input
                className="input-field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="smart book"
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
              {loading ? 'Syncing data…' : 'Activate & sync'}
            </button>
          </form>
        ) : (
          <form style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }} onSubmit={handlePinSubmit}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted-dark)' }}>2 digit PIN</span>
              <input
                className="input-field"
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

            <button className="btn btn--primary" type="submit">
              Login
            </button>

            <button className="btn btn--ghost" type="button" onClick={startReactivation}>
              Reactivate this device
            </button>
          </form>
        )}

        {loading && (
          <div style={{ marginTop: 24 }} role="status" aria-live="polite">
            <div className="progress-track">
              <span className="progress-fill" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
            <p className="section-subtext" style={{ textAlign: 'center', marginTop: 8 }}>
              {progressLabel || `Downloading ${progress.toLocaleString()} records…`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
