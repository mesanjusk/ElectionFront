// client/src/pages/Login.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "@mui/material";
import { apiLogin, setAuthToken } from "../services/api";
import { pullAll, pushOutbox, resetSyncState } from "../services/sync";
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
  getUser, // 👈 added so we can reuse existing user on PIN login
} from "../auth";
import {
  clearActivationState,
  clearRevocationFlag,
  getActivationState,
  getDeviceId,
  setActivationState,
  storeActivation,
  verifyPin,
} from "../services/activation";

// Fixed defaults per requirement
const DEFAULT_LANGUAGE = "en";
const DEFAULT_PIN = "11";

const PIN_REGEX_2DIGIT = /^\d{2}$/;

/**
 * Choose a concrete database id to use for syncing.
 * Priority:
 *  1) activeDatabaseId from server or previously stored active DB
 *  2) first database from stored list (setSession -> getAvailableDatabases)
 *  3) first per-user cloned DB on user.userDatabases (if present)
 *
 * NOTE:
 * We intentionally do NOT fall back to allowedDatabaseIds here, because those
 * refer to master DB templates (e.g. "booth_17"), while sync must always use
 * the per-user cloned database id (e.g. "voters_u_<userId>_booth_17").
 */
function chooseEffectiveDatabase({ activeDatabaseId, user } = {}) {
  const active = activeDatabaseId || getActiveDatabase();
  if (active) return active;

  const stored = getAvailableDatabases();
  if (stored && stored.length) return stored[0].id || stored[0]._id;

  const userDbs = user?.userDatabases || user?.databases;
  if (userDbs && userDbs.length) {
    const first = userDbs[0];
    return first.id || first._id || first.databaseId || null;
  }

  return null;
}

export default function Login() {
  const navigate = useNavigate();

  const [activation, setActivation] = useState(() => getActivationState());

  // If any user is already activated (has a pinHash and not revoked), default to PIN screen.
  const initialMode = (() => {
    if (activation?.pinHash && !activation?.revoked) return "pin";
    return "activate";
  })();
  const [mode, setMode] = useState(initialMode);
  const showPinTab = Boolean(activation?.pinHash && !activation?.revoked);

  useEffect(() => {
    if (!showPinTab && mode === "pin") {
      setMode("activate");
    }
  }, [showPinTab, mode]);

  // Language is fixed to English — no UI controls
  const [language] = useState(DEFAULT_LANGUAGE);

  // Username/password only for activation
  const [username, setUsername] = useState(() => activation?.username || "");
  const [password, setPassword] = useState("");

  // PIN entry for unlock (2-digit)
  const [pinInput, setPinInput] = useState("");

  // UX state
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  // Keep document lang in sync (even though it’s fixed)
  useEffect(() => {
    if (typeof document !== "undefined")
      document.documentElement.lang = language;
    if (typeof window !== "undefined")
      window.localStorage.setItem("appLanguage", language);
  }, [language]);

  // Handle revocation message
  useEffect(() => {
    if (activation?.revoked) {
      setMode("activate");
      setInfoMessage(
        activation?.revokedMessage ||
          "This device was signed out because your account was activated elsewhere. Reactivate to continue."
      );
    } else if (infoMessage) {
      setInfoMessage("");
    }
  }, [activation, infoMessage]);

  // Fast-path: if token exists and session is unlocked, go home
  useEffect(() => {
    if (getToken() && isSessionUnlocked()) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  // Helper: where to go after login
  const goAfterLogin = (user, fallbackUserType) => {
    const userType = user?.userType || fallbackUserType;
    if (user?.role === "admin") return navigate("/admin", { replace: true });
    if (userType === "candidate")
      return navigate("/search", { replace: true });
    return navigate("/", { replace: true });
  };

  /**
   * Full login + sync (used ONLY for username/password activation)
   */
  const completeLogin = async ({
    token,
    user,
    databases = [],
    activeDatabaseId,
    skipSync = false,
  }) => {
    // 🔐 Preserve existing databases if none are passed
    let available = databases;
    if (!available || !available.length) {
      const existing = getAvailableDatabases();
      if (existing && existing.length) {
        available = existing;
      } else {
        // New multi-tenant model: backend usually stores per-user clones under user.userDatabases
        if (user?.userDatabases && user.userDatabases.length) {
          available = user.userDatabases;
        } else {
          available = user?.databases || [];
        }
      }
    }

    setSession({ token, user, databases: available });
    setAuthToken(token);

    // store userName for greeting
    try {
      if (user) {
        const name = user.username || user.name || "";
        if (name) {
          window.localStorage.setItem("userName", name);
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

    const shouldSync = !skipSync && effectiveDatabase;

    // 🔁 Full push + pull only when NOT skipping (i.e., on activation login)
    if (shouldSync) {
      setProgress(0);
      setProgressLabel("Uploading offline updates…");
      try {
        pushResult = await pushOutbox({ databaseId: effectiveDatabase });
      } catch (err) {
        pushError = err;
      }

      // For first-time activation, reset cursors for a clean pull
      if (!pushError && effectiveDatabase) {
        await resetSyncState(effectiveDatabase);
      }

      setProgress(0);
      setProgressLabel("Downloading latest records…");
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

      if (pushError || pullError) {
        const messages = [];
        if (pushError)
          messages.push(`push failed: ${pushError?.message || pushError}`);
        if (pullError)
          messages.push(`pull failed: ${pullError?.message || pullError}`);
        alert(
          `Login completed with limited sync — ${messages.join(" and ")}.`
        );
      } else {
        const pushed = pushResult?.pushed || 0;
        alert(
          effectiveDatabase
            ? `Sync complete. Uploaded ${pushed} changes and downloaded ${total} records.`
            : `Login complete. No database assigned yet — ask admin to assign one.`
        );
      }
    }

    const updatedActivation = setActivationState({
      language: DEFAULT_LANGUAGE,
      revoked: false,
    });
    setActivation(updatedActivation);
    unlockSession();

    const fallbackType = activation?.userType;
    goAfterLogin(updatedActivation?.user || user, fallbackType);

    setLoading(false);
    setProgress(0);
    setProgressLabel("");
  };

  // Activation submit (username + password + default PIN)
  const handleActivationSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setInfoMessage("");
    setLoading(true);
    setProgress(0);
    setProgressLabel("Activating device…");

    try {
      const deviceId = await getDeviceId();
      const pin = DEFAULT_PIN; // fixed 2-digit pin "11"

      const res = await apiLogin({
        username,
        password,
        deviceId,
        pin,
      });

      // 🔐 Store richer activation info so future PIN unlock can reuse it
      await storeActivation({
        username,
        pin,
        deviceId,
        userType: res?.user?.userType,
        user: res?.user,
        databases: res?.databases,
        activeDatabaseId: res?.activeDatabaseId,
      });

      // For full login (activation) => do sync
      await completeLogin(res);
    } catch (err) {
      setError(err?.message || "Activation failed.");
      setLoading(false);
      setProgress(0);
      setProgressLabel("");
      clearRevocationFlag();
      return;
    }
  };

  // PIN unlock submit (NO sync, NO session reset)
  const handlePinSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    setProgress(0);
    setProgressLabel("Verifying PIN…");

    try {
      const ok = await verifyPin(pinInput);
      if (!ok) {
        setError("Invalid PIN. Try again.");
        setLoading(false);
        return;
      }

      const token = getToken();
      if (!token) {
        setError("Session expired. Reactivate this device.");
        setLoading(false);
        return;
      }

      // Restore axios auth header using existing token
      setAuthToken(token);

      // Clear revoked flag and keep language
      const updatedActivation = setActivationState({
        language: DEFAULT_LANGUAGE,
        revoked: false,
      });
      setActivation(updatedActivation);

      // Unlock existing session WITHOUT touching databases/user
      unlockSession();

      // Reuse existing user (and DBs) from previous activation login
      let user = null;
      try {
        user = getUser && getUser();
      } catch {
        // ignore
      }

      const fallbackType =
        activation?.userType || updatedActivation?.userType;
      goAfterLogin(user || updatedActivation?.user, fallbackType);

      setLoading(false);
      setProgress(0);
      setProgressLabel("");
    } catch (err) {
      setError(err?.message || "PIN verification failed.");
      setLoading(false);
      setProgress(0);
      setProgressLabel("");
    }
  };

  const startReactivation = () => {
    lockSession();
    clearToken();
    clearActivationState();
    setActivation(null);
    setMode("activate");
    setPinInput("");
    setPassword("");
    setError("");
    setInfoMessage(
      "Reactivate this device with your username and password."
    );
  };

  const currentTab = showPinTab ? mode : "activate";
  const isActivationView = currentTab === "activate";

  const handlePinInputChange = (value) => {
    setPinInput(value.replace(/[^0-9]/g, "").slice(0, 2));
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        py: { xs: 4, md: 8 },
      }}
    >
      <Container maxWidth="sm">
        <Card elevation={8}>
          <CardContent>
            <Stack spacing={3}>
              <Stack spacing={0.5} textAlign="center">
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ letterSpacing: 3 }}
                >
                  Smart Book access
                </Typography>
                <Typography variant="h4">Secure login</Typography>
                <Typography variant="body2" color="text.secondary">
                  Activate this device once and unlock daily with your quick
                  PIN.
                </Typography>
              </Stack>

              {(infoMessage || error) && (
                <Stack spacing={1}>
                  {infoMessage && (
                    <Alert severity="info">{infoMessage}</Alert>
                  )}
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
                {showPinTab && (
                  <Tab label="Unlock with PIN" value="pin" />
                )}
              </Tabs>

              {isActivationView ? (
                <Stack
                  component="form"
                  spacing={2}
                  onSubmit={handleActivationSubmit}
                >
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
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={loading}
                  >
                    {loading ? "Syncing data…" : "Activate & sync"}
                  </Button>
                </Stack>
              ) : (
                <Stack
                  component="form"
                  spacing={2}
                  onSubmit={handlePinSubmit}
                >
                  <TextField
                    label="2 digit PIN"
                    value={pinInput}
                    onChange={(e) => handlePinInputChange(e.target.value)}
                    inputProps={{
                      inputMode: "numeric",
                      maxLength: 2,
                      pattern: "[0-9]{2}",
                    }}
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
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    textAlign="center"
                  >
                    {progressLabel ||
                      "Preparing your offline workspace…"}
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
