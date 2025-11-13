// client/src/pages/Login.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  LinearProgress,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
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
  const showPinTab = Boolean(activation?.pinHash && !activation?.revoked);

  useEffect(() => {
    if (!showPinTab && mode === 'pin') {
      setMode('activate');
    }
  }, [showPinTab, mode]);

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
    const userType = user?.userType || fallbackUserType;
    if (user?.role === 'admin') return navigate('/admin', { replace: true });
    if (userType === 'candidate') return navigate('/search', { replace: true });
    return navigate('/', { replace: true });
  };

  const completeLogin = async ({ token, user, databases = [], activeDatabaseId }) => {
    const available = databases.length ? databases : user?.databases || [];
    setSession({ token, user, databases: available });
    setAuthToken(token);

    // ✅ Store userName for Search page greeting
    try {
      if (user) {
        const name = user.username || user.name || '';
        if (name) {
          window.localStorage.setItem('userName', name);
        }
      }
    } catch {
      // ignore
    }

    // Decide an effective DB, persist it, and use it for sync.
    let effectiveDatabase = chooseEffectiveDatabase({ activeDatabaseId, user });
    if (effectiveDatabase) setActiveDatabase(effectiveDatabase);

    let pushResult = null;
    let pushError = null;
    let pullError = null;
    let total = 0;

    // Always push + (attempt to) pull on login
    if (effectiveDatabase) {
      setProgress(0);
      setProgressLabel('Uploading offline updates…');
      try {
        pushResult = await pushOutbox({ databaseId: effectiveDatabase }); // ✅ pass databaseId
      } catch (err) {
        pushError = err;
      }
    } else {
      // No DB yet — nothing to push
      pushResult = { pushed: 0 };
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
        userType: user?.userType,
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

    // ✅ Always push with databaseId when available
    if (effectiveDatabase) {
      try {
        pushResult = await pushOutbox({ databaseId: effectiveDatabase });
      } catch (err) {
        pushError = err;
      }
    } else {
      pushResult = { pushed: 0 };
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

    const fallbackType = activation?.userType;
    goAfterLogin(updated?.user, fallbackType);
    navigate('/', { replace: true });

    setLoading(false);
    setProgress(0);
    setProgressLabel('');
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

  const currentTab = showPinTab ? mode : 'activate';
  const isActivationView = currentTab === 'activate';

  const handlePinInputChange = (value) => {
    setPinInput(value.replace(/[^0-9]/g, '').slice(0, 2));
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', py: { xs: 4, md: 8 } }}>
      <Container maxWidth="sm">
        <Card elevation={8}>
          <CardContent>
            <Stack spacing={3}>
              <Stack spacing={0.5} textAlign="center">
                <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 3 }}>
                  Smart Book access
                </Typography>
                <Typography variant="h4">Secure login</Typography>
                <Typography variant="body2" color="text.secondary">
                  Activate this device once and unlock daily with your quick PIN.
                </Typography>
              </Stack>

              {(infoMessage || error) && (
                <Stack spacing={1}>
                  {infoMessage && <Alert severity="info">{infoMessage}</Alert>}
                  {error && <Alert severity="error">{error}</Alert>}
                </Stack>
              )}

              <Tabs
                value={currentTab}
                onChange={(_, value) => setMode(value)}
                variant="fullWidth"
                textColor="primary"
                indicatorColor="primary"
              >
                <Tab label="Activate device" value="activate" />
                {showPinTab && <Tab label="Unlock with PIN" value="pin" />}
              </Tabs>

              {isActivationView ? (
                <Stack component="form" spacing={2} onSubmit={handleActivationSubmit}>
                  <TextField
                    label="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                    fullWidth
                  />
                  <TextField
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    fullWidth
                  />
                  <Button type="submit" variant="contained" size="large" disabled={loading}>
                    {loading ? 'Syncing data…' : 'Activate & sync'}
                  </Button>
                </Stack>
              ) : (
                <Stack component="form" spacing={2} onSubmit={handlePinSubmit}>
                  <TextField
                    label="2 digit PIN"
                    value={pinInput}
                    onChange={(e) => handlePinInputChange(e.target.value)}
                    inputProps={{ inputMode: 'numeric', maxLength: 2, pattern: '[0-9]{2}' }}
                    required
                  />
                  <Button type="submit" variant="contained" size="large">
                    Login
                  </Button>
                  <Button variant="outlined" onClick={startReactivation}>
                    Reactivate this device
                  </Button>
                </Stack>
              )}

              {loading && (
                <Stack spacing={1} role="status" aria-live="polite">
                  <LinearProgress color="secondary" />
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    {progressLabel || 'Preparing your offline workspace…'}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
