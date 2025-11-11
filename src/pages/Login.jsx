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

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'mr', label: 'मराठी' },
];

// ✅ Login types: Candidate & Volunteer only
const USER_TYPES = [
  { value: 'candidate', label: 'Candidate' },
  { value: 'volunteer', label: 'Volunteer' },
];

const PIN_REGEX = /^\d{4}$/;

export default function Login() {
  const navigate = useNavigate();
  const [activation, setActivation] = useState(() => getActivationState());
  const [mode, setMode] = useState(() => {
    if (!activation?.pinHash) return 'activate';
    if (activation?.revoked) return 'activate';
    if (!getToken()) return 'activate';
    return 'pin';
  });

  const [language, setLanguage] = useState(() => activation?.language || 'en');

  // ✅ default to 'volunteer' if nothing stored
  const [userType, setUserType] = useState(() => activation?.userType || 'volunteer');

  // 🔄 replaced email with username everywhere
  const [username, setUsername] = useState(() => activation?.username || '');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  useEffect(() => {
    const storedLanguage = activation?.language;
    if (storedLanguage && storedLanguage !== language) setLanguage(storedLanguage);
    const storedType = activation?.userType;
    if (storedType && storedType !== userType) setUserType(storedType);
    // ensure username is loaded from activation (for re-open)
    if (activation?.username && activation?.username !== username) {
      setUsername(activation.username);
    }
  }, [activation]);

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = language;
    if (typeof window !== 'undefined') window.localStorage.setItem('appLanguage', language);
  }, [language]);

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

  useEffect(() => {
    if (getToken() && isSessionUnlocked()) {
      const destination = activation?.userType === 'candidate' ? '/search' : '/';
      navigate(destination, { replace: true });
    }
  }, [navigate, activation]);

  const availableLanguages = useMemo(() => LANGUAGES, []);
  const availableUserTypes = useMemo(() => USER_TYPES, []);

  const completeLogin = async ({ token, user, databases = [], activeDatabaseId }) => {
    const available = databases.length ? databases : user?.databases || [];
    setSession({ token, user, databases: available });
    setAuthToken(token);
    if (activeDatabaseId) setActiveDatabase(activeDatabaseId);

    const activeDatabase = activeDatabaseId || getActiveDatabase();
    const storedDatabases = getAvailableDatabases();
    const firstDatabase = storedDatabases[0];
    const effectiveDatabase = activeDatabase || firstDatabase?.id || firstDatabase?._id || null;

    let pushResult = null;
    let pushError = null;
    let pullError = null;
    let total = 0;

    setProgress(0);
    setProgressLabel('Uploading offline updates…');
    try {
      pushResult = await pushOutbox();
    } catch (err) {
      pushError = err;
    }

    if (!pushError) {
      await resetSyncState(effectiveDatabase);
    }

    if (effectiveDatabase) {
      setProgress(0);
      setProgressLabel('Downloading latest records…');
      try {
        await pullAll({
          databaseId: effectiveDatabase,
          onProgress: ({ total: t }) => {
            total = t;
            setProgress(t);
            setProgressLabel(`Downloading ${t.toLocaleString()} records…`);
          },
        });
      } catch (err) {
        pullError = err;
      }
    }

    if (pushError || pullError) {
      const messages = [];
      if (pushError) messages.push(`push failed: ${pushError?.message || pushError}`);
      if (pullError) messages.push(`pull failed: ${pullError?.message || pullError}`);
      alert(`Login completed with limited sync — ${messages.join(' and ')}.`);
    } else if (effectiveDatabase) {
      const databaseLabel = effectiveDatabase ? ` from database ${effectiveDatabase}` : '';
      const pushed = pushResult?.pushed || 0;
      alert(
        `Synced ${total.toLocaleString()} records${databaseLabel} to your device after uploading ${pushed} offline updates.`
      );
    } else {
      alert('Activation complete. Your account is ready once a voter database is assigned.');
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
    if (!PIN_REGEX.test(pin)) {
      setError('Choose a 4 digit numeric PIN for quick logins.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PIN values do not match.');
      return;
    }

    setLoading(true);
    setProgress(0);
    setProgressLabel('');

    try {
      const deviceId = getDeviceId(); // keep as-is if your util returns sync ID
      // ⬇️ switched to username
      const response = await apiLogin({ username, password, deviceId, userType });
      const { user } = await completeLogin(response);

      // ⬇️ store username instead of email
      const stored = await storeActivation({ username, language, userType, pin });
      const cleaned = clearRevocationFlag();
      setActivation(cleaned || stored);

      unlockSession();
      setMode('pin');
      setPin('');
      setConfirmPin('');
      setPassword('');

      const target = userType === 'candidate' ? '/search' : user?.role === 'admin' ? '/admin' : '/';
      navigate(target, { replace: true });
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

    if (!PIN_REGEX.test(pinInput)) {
      setError('Enter the 4 digit PIN you created during activation.');
      return;
    }
    if (!getToken()) {
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

    let pushResult = null;
    let pushError = null;
    let pulled = 0;
    let pullError = null;

    try {
      try {
        pushResult = await pushOutbox();
      } catch (err) {
        pushError = err;
      }

      setProgress(0);
      setProgressLabel('Downloading latest records…');

      try {
        pulled = await pullAll({
          onProgress: ({ total: t }) => {
            pulled = t;
            setProgress(t);
            setProgressLabel(`Downloading ${t.toLocaleString()} records…`);
          },
        });
      } catch (err) {
        pullError = err;
      }

      const updated = setActivationState({ language, userType, revoked: false });
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
        alert(`Sync complete. Uploaded ${pushed} changes and downloaded ${pulled} updates.`);
      }

      const target = userType === 'candidate' ? '/search' : '/';
      navigate(target, { replace: true });
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
    setPin('');
    setConfirmPin('');
    setPinInput('');
    setPassword('');
    setError('');
    setInfoMessage('Reactivate this device with your username, password and a new PIN.');
  };

  const showActivation = mode === 'activate';

  return (
    <div className="page page--center">
      <div className="card auth-card login-card">
        <header className="login-card__header">
          <div className="brand brand--center">
            <span className="brand__mark">SB</span>
            <div>
              <span className="brand__title">SMart BOOK</span>
              <p className="login-card__tagline">Manage Voters Data</p>
            </div>
          </div>

          <p className="login-card__subtitle">
            {showActivation
              ? 'Activate this device with your credentials and create a secure PIN for quick access.'
              : 'Unlock with your offline PIN to continue where you left off.'}
          </p>
        </header>

        {infoMessage && (
          <div className="alert alert--warning" role="status" style={{ marginBottom: '1rem' }}>
            <span aria-hidden>⚠️</span>
            <span>{infoMessage}</span>
          </div>
        )}

        {error && (
          <div className="alert alert--error" role="alert" style={{ marginBottom: '1rem' }}>
            <span aria-hidden>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {showActivation ? (
          <form className="form-grid" onSubmit={handleActivationSubmit}>
            <label className="field">
              <span className="field__label">Username</span>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. priyal.ramani"
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

            <label className="field">
              <span className="field__label">Language preference</span>
              <select
                className="select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {availableLanguages.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="field" style={{ border: 'none', padding: 0 }}>
              <legend className="field__label">How will you use this login?</legend>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {availableUserTypes.map((type) => (
                  <label key={type.value} className="chip">
                    <input
                      type="radio"
                      name="userType"
                      value={type.value}
                      checked={userType === type.value}
                      onChange={(e) => setUserType(e.target.value)}
                    />
                    <span>{type.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="field">
              <span className="field__label">Create a 4 digit PIN</span>
              <input
                className="input"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="••••"
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Confirm PIN</span>
              <input
                className="input"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="••••"
                required
              />
            </label>

            <button className="btn btn--primary" disabled={loading} type="submit">
              {loading ? 'Syncing data…' : 'Activate & sync'}
            </button>

            <button className="btn btn--ghost" type="button" onClick={() => setMode('pin')}>
              Already activated? Unlock with PIN
            </button>
          </form>
        ) : (
          <form className="form-grid" onSubmit={handlePinSubmit}>
            <label className="field">
              <span className="field__label">Language</span>
              <select
                className="select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {availableLanguages.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="field" style={{ border: 'none', padding: 0 }}>
              <legend className="field__label">Login type</legend>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {availableUserTypes.map((type) => (
                  <label key={type.value} className="chip">
                    <input
                      type="radio"
                      name="quickUserType"
                      value={type.value}
                      checked={userType === type.value}
                      onChange={(e) => setUserType(e.target.value)}
                    />
                    <span>{type.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="field">
              <span className="field__label">4 digit PIN</span>
              <input
                className="input"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="••••"
                autoFocus
                required
              />
            </label>

            <button className="btn btn--primary" type="submit">
              Unlock
            </button>

            <button className="btn btn--ghost" type="button" onClick={startReactivation}>
              Reactivate this device
            </button>
          </form>
        )}

        {loading ? (
          <div className="login-progress" role="status" aria-live="polite">
            <div className="login-progress__bar">
              <span className="login-progress__fill" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
            <span className="login-progress__label">
              {progressLabel || `Downloading ${progress.toLocaleString()} records…`}
            </span>
          </div>
        ) : (
          <p className="login-card__hint">Keep your PIN secret. You can reactivate anytime to change it.</p>
        )}
      </div>
    </div>
  );
}
