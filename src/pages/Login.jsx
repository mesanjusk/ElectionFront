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

import { apiLogin } from "../services/api";
import { pullAll, pushOutbox, resetSyncState } from "../services/sync";
import {
  setSession,
  setActiveDatabase,
  getActiveDatabase,
  getAvailableDatabases,
  unlockSession,
  lockSession,
  clearToken,
} from "../auth";
import {
  clearActivationState,
  getActivationState,
  getDeviceId,
  setActivationState,
  clearRevocationFlag,
} from "../services/activation";

const DEFAULT_LANGUAGE = "en";

/**
 * Decide which database id to use for sync.
 */
function chooseEffectiveDatabase({ activeDatabaseId, user, databases }) {
  // 1) explicit activeDatabaseId from server or previously stored
  if (activeDatabaseId) return activeDatabaseId;

  // 2) previously selected DB in local storage
  const existing = getActiveDatabase();
  if (existing) return existing;

  // 3) any databases already stored locally
  const stored = getAvailableDatabases();
  if (stored && stored.length) {
    const first = stored[0];
    return first.id || first._id || first.databaseId || null;
  }

  // 4) per-user databases, if backend sends them
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
  const [username, setUsername] = useState(() => activation?.username || "");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [deviceId, setDeviceIdState] = useState("");

  useEffect(() => {
    const id = getDeviceId();
    if (id) setDeviceIdState(id);

    // Clear revocation banner if any
    if (activation?.revoked) {
      setInfoMessage(activation.revokedMessage || "");
      clearRevocationFlag();
      const fresh = getActivationState();
      setActivation(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setInfoMessage("");
    setLoading(true);
    setProgress(0);
    setProgressLabel("Logging in…");

    try {
      const trimmedUser = (username || "").trim().toLowerCase();
      if (!trimmedUser || !password) {
        setError("Please enter username and password.");
        setLoading(false);
        return;
      }

      const resp = await apiLogin({
        username: trimmedUser,
        password,
        // userType omitted – backend infers from role
      });

      const {
        token,
        user,
        databases = [],
        activeDatabaseId,
      } = resp || {};

      if (!token || !user) {
        setError("Invalid response from server. Login failed.");
        setLoading(false);
        return;
      }

      // Store token + user + database list
      setSession({ token, user, databases });

      // Decide and store active database id
      const effectiveDbId = chooseEffectiveDatabase({
        activeDatabaseId,
        user,
        databases,
      });
      if (effectiveDbId) {
        setActiveDatabase(effectiveDbId);
      }

      // Store activation locally (no PIN UI, but keep language & DB info)
      const nextActivation = setActivationState({
        ...(activation || {}),
        username: user.username || trimmedUser,
        language: DEFAULT_LANGUAGE,
        userType: user.role || null,
        activeDatabaseId: effectiveDbId,
        revoked: false,
      });
      setActivation(nextActivation);

      // Mark session as unlocked
      unlockSession();

      // Sync: PUSH then PULL
      setProgress(20);
      setProgressLabel("Pushing offline changes…");
      try {
        if (effectiveDbId) {
          await pushOutbox({ databaseId: effectiveDbId });
        } else {
          await pushOutbox();
        }
      } catch (err) {
        // Do not block login
        console.error("Push failed:", err);
      }

      setProgress(60);
      setProgressLabel("Pulling latest records…");
      try {
        if (effectiveDbId) {
          await pullAll({ databaseId: effectiveDbId });
        } else {
          await pullAll();
        }
      } catch (err) {
        console.error("Pull failed:", err);
      }

      setProgress(100);
      setProgressLabel("Done!");

      setTimeout(() => {
        // Go straight to Search; change to "/home" if you prefer
        navigate("/search", { replace: true });
      }, 300);
    } catch (err) {
      console.error("LOGIN_ERROR", err);
      const msg =
        err?.message ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Login failed.";
      setError(msg);
    } finally {
      setLoading(false);
      setProgress(0);
      setProgressLabel("");
    }
  };

  const handleResetDevice = () => {
    try {
      lockSession();
      clearToken();
      clearActivationState();
      resetSyncState?.();
    } catch (err) {
      console.error("RESET_DEVICE_ERROR", err);
    }
    setActivation(null);
    setUsername("");
    setPassword("");
    setError("");
    setInfoMessage("Device reset. Please login again with username & password.");
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#0b1726",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}
    >
      <Container maxWidth="xs">
        <Card
          sx={{
            borderRadius: 3,
            boxShadow: 6,
            overflow: "hidden",
          }}
        >
          <CardContent sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Typography
                variant="h5"
                fontWeight={700}
                textAlign="center"
                gutterBottom
              >
                Smart Book Login
              </Typography>

              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
              >
                Use your election username & password to continue.
              </Typography>

              {deviceId ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  textAlign="center"
                  sx={{ wordBreak: "break-all" }}
                >
                  Device ID: {deviceId}
                </Typography>
              ) : null}

              {infoMessage && (
                <Alert
                  severity="info"
                  onClose={() => setInfoMessage("")}
                  sx={{ mt: 1 }}
                >
                  {infoMessage}
                </Alert>
              )}

              {error && (
                <Alert
                  severity="error"
                  onClose={() => setError("")}
                  sx={{ mt: 1 }}
                >
                  {error}
                </Alert>
              )}

              <Box component="form" onSubmit={handleLogin}>
                <Stack spacing={2}>
                  <TextField
                    label="Username"
                    fullWidth
                    size="small"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                  <TextField
                    label="Password"
                    type="password"
                    fullWidth
                    size="small"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />

                  <Stack
                    direction="row"
                    spacing={1}
                    justifyContent="center"
                    sx={{ mt: 1 }}
                  >
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={loading}
                    >
                      {loading ? "Logging in…" : "Login"}
                    </Button>

                    <Button
                      type="button"
                      variant="text"
                      color="secondary"
                      disabled={loading}
                      onClick={handleResetDevice}
                    >
                      Reset Device
                    </Button>
                  </Stack>
                </Stack>
              </Box>

              {loading && (
                <Stack spacing={1}>
                  <LinearProgress
                    variant={progress ? "determinate" : "indeterminate"}
                    value={progress || undefined}
                  />
                  <Typography
                    variant="caption"
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
