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
  TextField,
  Typography,
} from '@mui/material';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
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

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', py: { xs: 4, md: 8 } }}>
      <Container maxWidth="sm">
        <Card elevation={8}>
          <CardContent>
            <Stack spacing={3}>
              <Stack spacing={1} textAlign="center" alignItems="center">
                <AdminPanelSettingsRoundedIcon color="primary" sx={{ fontSize: 48 }} />
                <Typography variant="h4">Admin control</Typography>
                <Typography variant="body2" color="text.secondary">
                  Sign in to assign databases, manage roles, and monitor sync health.
                </Typography>
              </Stack>

              {error && <Alert severity="error">{error}</Alert>}

              <Stack component="form" spacing={2} onSubmit={onSubmit}>
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
                  {loading ? 'Syncing data…' : 'Sign in'}
                </Button>
              </Stack>

              {loading ? (
                <Stack spacing={1} role="status" aria-live="polite">
                  <LinearProgress />
                  <Typography variant="body2" color="text.secondary">
                    Preparing admin workspace…
                  </Typography>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Need field access instead? Use the standard login page.
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
