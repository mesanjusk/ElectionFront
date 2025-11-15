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
  getUser, // 👈 reuse existing user on PIN login
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

  // PIN entry (we now always use DEFAULT_PIN = "11" in code)
  const [pinInput, setPinInput] = useState("");

  // Basic UI state
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  // ---------------------------------------------------------------------------
  // Helper: where to go after login
  // ---------------------------------------------------------------------------
  const goAfterLogin = (user, fallbackUserType) => {
    const userType = user?.userType || fallbackUserType;
    if (user?.role === "admin") return navigate("/admin", { replace: true });
    if (userType === "candidate") return navigate("/search", { replace: true });
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

    const effectiveDbId = chooseEffectiveDatabase({ activeDatabaseId, user });

    // Persist session + DB choice
    setSession({
      token,
      user,
      databases: available,
      activeDatabaseId: effectiveDbId,
    });
    if (effectiveDbId) {
      setActiveDatabase(effectiveDbId);
    }

    // Mark this device as activated with a fixed PIN '11'
    const deviceId = getDeviceId();
    const activationPayload = {
      deviceId,
      username: user?.username || username,
      userId: user?._id,
      language,
      pinHash: null, // backend may store hash; frontend still uses verifyPin(DEFAULT_PIN)
      userType: user?.userType,
      activeDatabaseId: effectiveDbId,
      revoked: false,
    };
    const stored = storeActivation(activationPayload);
    setActivation(stored);
    clearRevocationFlag();

    if (!skipSync) {
      setProgress(10);
      setProgressLabel("Pushing offline changes…");
      await pushOutbox({ databaseId: effectiveDbId });

      setProgress(60);
      setProgressLabel("Pulling latest data…");
      await pullAll({ databaseId: effectiveDbId });

      setProgress(100);
      setProgressLabel("Done.");
    }

    goAfterLogin(user, user?.userType || stored?.userType);
  };

  /**
   * Username/password login (activation only)
   */
  const handleActivateSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setInfoMessage("");
    setLoading(true);
    setProgress(0);
    setProgressLabel("Contacting server…");

    try {
      const resp = await apiLogin({
        username,
        password,
        userType: activation?.userType,
        deviceId: getDeviceId(),
      });

      const { token, user, databases, activeDatabaseId } = resp;


      setAuthToken(token);
      await completeLogin({
        token,
        user,
        databases,
        activeDatabaseId,
        skipSync: false,
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Login failed.");
    } finally {
      setLoading(false);
      setProgress(0);
      setProgressLabel("");
    }
  };

  /**
   * PIN login (unlock)
   * Now:
   *  - uses fixed DEFAULT_PIN = "11"
   *  - always runs PUSH then PULL on login
   */
  const handlePinSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    setProgress(0);
    setProgressLabel("Logging you in…");

    try {
      // Always use fixed PIN '11' as per requirement
      const ok = await verifyPin(DEFAULT_PIN);
      if (!ok) {
        setError(
          "This device is not activated. Please login with username & password once."
        );
        setLoading(false);
        return;
      }

      const token = getToken();
      if (!token) {
        setError(
          "Session expired. Reactivate this device with username & password."
        );
        setLoading(false);
        return;
      }

      // Restore axios auth header using existing token
      setAuthToken(token);

      // Clear revoked flag and keep language (always English)
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

      // Decide which DB to use and persist as active
      const effectiveDbId = chooseEffectiveDatabase({
        activeDatabaseId: updatedActivation?.activeDatabaseId,
        user,
      });

      if (effectiveDbId) {
        setActiveDatabase(effectiveDbId);
      }

      // 🔄 On every login run PUSH then PULL so Search/Home get fresh data
      try {
        if (effectiveDbId) {
          await pushOutbox({ databaseId: effectiveDbId });
        } else {
          await pushOutbox();
        }
      } catch (err) {
        console.error("Push on login failed:", err);
      }

      try {
        if (effectiveDbId) {
          await pullAll({ databaseId: effectiveDbId });
        } else {
          await pullAll();
        }
      } catch (err) {
        console.error("Pull on login failed:", err);
      }

      const fallbackType =
        updatedActivation?.userType ||
        user?.userType ||
        activation?.userType;
      goAfterLogin(user || updatedActivation?.user, fallbackType);

      setLoading(false);
      setProgress(0);
      setProgressLabel("");
    } catch (err) {
      setError(err?.message || "PIN login failed.");
      setLoading(false);
      setProgress(0);
      setProgressLabel("");
    }
  };

  const startReactivation = () => {
    // Full local reset: logout + clear activation + clear local sync state
    lockSession();
    clearToken();
    clearActivationState();
    resetSyncState();
    setActivation(null);
    setMode("activate");
    setPinInput("");
    setPassword("");
    setError("");
    setInfoMessage(
      "Device reset. Please login again with your username and password."
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
        bgcolor: "background.default",
      }}
    >
      <Container maxWidth="sm">
        <Card>
          <CardContent>
            <Stack spacing={3}>
              <Stack spacing={0.5} alignItems="center">
                <Typography variant="h5" fontWeight={700}>
                  Digital Voter Book
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  
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
                  onSubmit={handleActivateSubmit}
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
                  <Button type="submit" variant="contained" size="large">
                    Login
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={startReactivation}
                  >
                    Reset this device
                  </Button>
                </Stack>
              )}

              {loading && (
                <Stack spacing={1}>
                  <LinearProgress
                    variant={
                      progress > 0 && progress < 100 ? "determinate" : "indeterminate"
                    }
                    value={progress || undefined}
                  />
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    textAlign="center"
                  >
                    {progressLabel || "Preparing your offline workspace…"}
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
