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
} from "../auth";
import {
  clearRevocationFlag,
  getActivationState,
  getDeviceId,
  setActivationState,
  storeActivation,
} from "../services/activation";

// Fixed defaults per requirement
const DEFAULT_LANGUAGE = "en";

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

  // Language is fixed to English — no UI controls
  const [language] = useState(DEFAULT_LANGUAGE);

  // Username/password for login
  const [username, setUsername] = useState(() => activation?.username || "");
  const [password, setPassword] = useState("");

  // UX state
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  // Keep document lang in sync (even though it’s fixed)
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("appLanguage", language);
    }
  }, [language]);

  // Handle revocation message
  useEffect(() => {
    if (activation?.revoked) {
      setInfoMessage(
        activation?.revokedMessage ||
          "This device was signed out because your account was activated elsewhere. Please login again."
      );
    } else {
      setInfoMessage("");
    }
  }, [activation]);

  // Helper: where to go after login
  const goAfterLogin = (user, fallbackUserType) => {
    const userType = user?.userType || fallbackUserType;
    if (user?.role === "admin") return navigate("/admin", { replace: true });
    if (userType === "candidate") return navigate("/search", { replace: true });
    return navigate("/", { replace: true });
  };

  // 🔁 Fast-path auto-login: rebuild session from localStorage if possible
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedToken = window.localStorage.getItem("token");
    const storedUserRaw = window.localStorage.getItem("user");

    if (!storedToken || !storedUserRaw) return;

    let storedUser = null;
    let storedDatabases = [];

    try {
      storedUser = JSON.parse(storedUserRaw);
    } catch {
      // bad JSON – force re-login
      return;
    }

    try {
      const dbsRaw = window.localStorage.getItem("databases");
      if (dbsRaw) {
        const parsed = JSON.parse(dbsRaw);
        if (Array.isArray(parsed)) storedDatabases = parsed;
      } else {
        // fallback from user payload if present
        const userDbs =
          storedUser?.userDatabases || storedUser?.databases || [];
        if (Array.isArray(userDbs)) storedDatabases = userDbs;
      }
    } catch {
      // ignore DB parse error
    }

    // Restore central session state
    setSession({
      token: storedToken,
      user: storedUser,
      databases: storedDatabases,
    });
    setAuthToken(storedToken);
    unlockSession();

    const fallbackType = activation?.userType;
    goAfterLogin(storedUser, fallbackType);
  }, [navigate, activation?.userType, goAfterLogin]);

  /**
   * Full login + sync (used for username/password login)
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
      } else if (user?.userDatabases && user.userDatabases.length) {
        // New multi-tenant model: per-user clones under user.userDatabases
        available = user.userDatabases;
      } else {
        available = user?.databases || [];
      }
    }

    setSession({ token, user, databases: available });
    setAuthToken(token);

    // 🔹 Persist login for ALL roles (admin, candidate, volunteer, etc.)
    try {
      if (typeof window !== "undefined") {
        if (token) {
          window.localStorage.setItem("token", token);
        }
        if (user) {
          window.localStorage.setItem("user", JSON.stringify(user));
        }
        if (Array.isArray(available) && available.length) {
          window.localStorage.setItem(
            "databases",
            JSON.stringify(available)
          );
        }
        const name = user?.username || user?.name || "";
        if (name) {
          window.localStorage.setItem("userName", name);
        }
      }
    } catch {
      // ignore storage errors
    }

    // Decide an effective DB, persist it, and use it for sync.
    let effectiveDatabase = chooseEffectiveDatabase({ activeDatabaseId, user });
    if (effectiveDatabase) setActiveDatabase(effectiveDatabase);

    let pushResult = null;
    let pushError = null;
    let pullError = null;
    let total = 0;

    const shouldSync = !skipSync && effectiveDatabase;

    // 🔁 Full push + pull only when NOT skipping
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

  // Username/password submit
  const handleActivationSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setInfoMessage("");
    setLoading(true);
    setProgress(0);
    setProgressLabel("Signing in…");

    try {
      const deviceId = await getDeviceId();

      const res = await apiLogin({
        username,
        password,
        deviceId,
      });

      // Store activation info for this device (no PIN)
      await storeActivation({
        username,
        deviceId,
        userType: res?.user?.userType,
        user: res?.user,
        databases: res?.databases,
        activeDatabaseId: res?.activeDatabaseId,
      });

      // Do full login + sync
      await completeLogin(res);
    } catch (err) {
      setError(err?.message || "Login failed.");
      setLoading(false);
      setProgress(0);
      setProgressLabel("");
      clearRevocationFlag();
      return;
    }
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
                ></Typography>
                <Typography variant="h4">Instify</Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                ></Typography>
              </Stack>

              {(infoMessage || error) && (
                <Stack spacing={1}>
                  {infoMessage && (
                    <Alert severity="info">{infoMessage}</Alert>
                  )}
                  {error && <Alert severity="error">{error}</Alert>}
                </Stack>
              )}

              {/* Single login form: username + password */}
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
                  {loading ? "Syncing data…" : "Login & sync"}
                </Button>
              </Stack>

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
