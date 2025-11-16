// client/src/pages/AdminHome.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import FolderSharedRoundedIcon from '@mui/icons-material/FolderSharedRounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import api from '../api';
import AdminUsers from './AdminUsers.jsx';
import { getUser, getAvailableDatabases, setAvailableDatabases } from '../auth';

function resolveId(entity) {
  if (!entity) return undefined;
  return entity.id ?? entity._id ?? entity.uuid ?? entity.key;
}

function databaseDisplayName(db) {
  if (!db) return '';
  return db.name || db.title || db.label || `Database ${resolveId(db)}`;
}

function StatCard({ title, value, hint, icon }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} alignItems="center">
            {icon}
            <Typography variant="subtitle2" color="text.secondary">
              {title}
            </Typography>
          </Stack>
          <Typography variant="h4">{value}</Typography>
          {hint && (
            <Typography variant="body2" color="text.secondary">
              {hint}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function AdminHome() {
  const [tab, setTab] = useState('overview');
  const [databases, setDatabases] = useState(() => getAvailableDatabases() || []);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', text: '' });
  const [savingId, setSavingId] = useState(null);

  const currentUser = useMemo(() => getUser?.() || null, []);
  const showStatus = (type, text) => setStatus({ type, text });

  const loadDatabases = async () => {
    showStatus('', '');
    try {
      const { data } = await api.get('/api/admin/databases');
      const list = data?.databases || [];
      setDatabases(list);
      setAvailableDatabases(list);
    } catch (e) {
      showStatus('error', e?.response?.data?.error || 'Unable to load voter databases.');
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    showStatus('', '');
    try {
      const { data } = await api.get('/api/admin/users');
      setUsers(data?.users || []);
    } catch (e) {
      showStatus('error', e?.response?.data?.error || 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatabases();
    loadUsers();
  }, []);

  const onUserCreated = () => {
    loadUsers();
  };

  const updateUserField = (id, updater) => {
    if (!id) return;
    setUsers((prev) => prev.map((u) => (resolveId(u) === id ? updater(u) : u)));
  };

  // 🔹 no more volunteer → operator conversion
  const onRoleChange = (id, role) => {
    updateUserField(id, (u) => ({ ...u, role }));
  };

  const onToggleDatabase = (id, databaseId, checked) => {
    updateUserField(id, (u) => {
      const dbIds = new Set(u.allowedDatabaseIds || u.databaseIds || []);
      if (checked) dbIds.add(databaseId);
      else dbIds.delete(databaseId);
      return { ...u, allowedDatabaseIds: Array.from(dbIds) };
    });
  };

  const saveUser = async (user) => {
    const userId = resolveId(user);
    if (!userId) return;
    setSavingId(userId);
    showStatus('', '');
    try {
      const payload = {
        role: user.role,
        allowedDatabaseIds: user.allowedDatabaseIds || [],
      };
      const { data } = await api.put(`/api/admin/users/${userId}`, payload);
      const saved = data?.user || user;
      updateUserField(userId, () => saved);
      showStatus('success', `Updated ${saved.username || user.username || 'user'}`);
    } catch (e) {
      showStatus('error', e?.response?.data?.error || 'Failed to update user.');
    } finally {
      setSavingId(null);
    }
  };

  const roleOf = (u) => (u?.role || '').toLowerCase();
  const totalUsers = users.length;
  const totalAdmins = users.filter((u) => roleOf(u) === 'admin').length;
  const totalOperators = users.filter((u) => roleOf(u) === 'operator').length;
  const totalCandidates = users.filter((u) => roleOf(u) === 'candidate').length;
  const totalPlainUsers = users.filter((u) => roleOf(u) === 'user').length;
  const totalVolunteers = users.filter((u) => roleOf(u) === 'volunteer').length;
  const totalDatabases = databases.length;

  const tabOptions = [
    ['overview', 'Overview'],
    ['team', 'Team'],
    ['databases', 'Databases'],
    ['settings', 'Settings'],
  ];

  const renderStatus = () => {
    if (!status.text) return null;
    return (
      <Alert severity={status.type === 'error' ? 'error' : 'success'}>{status.text}</Alert>
    );
  };

  return (
    <Box sx={{ minHeight: '100vh', py: { xs: 4, md: 6 } }}>
      <Container maxWidth="xl">
        <Stack spacing={4}>
          <Card>
            <CardContent>
              <Stack spacing={3}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={3}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', md: 'center' }}
                >
                  <Stack spacing={0.5}>
                    <Typography
                      variant="overline"
                      color="text.secondary"
                      sx={{ letterSpacing: 2 }}
                    >
                      Admin workspace
                    </Typography>
                    <Typography variant="h4">Dashboard</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Manage users, assign databases, and monitor sync health.
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Chip
                      icon={<AdminPanelSettingsRoundedIcon />}
                      label={currentUser?.username || 'Admin'}
                      color="primary"
                      variant="outlined"
                    />
                    <IconButton
                      onClick={() => {
                        loadDatabases();
                        loadUsers();
                      }}
                      aria-label="Refresh"
                    >
                      <RefreshRoundedIcon />
                    </IconButton>
                  </Stack>
                </Stack>

                <Tabs
                  value={tab}
                  onChange={(_, value) => setTab(value)}
                  variant="scrollable"
                  allowScrollButtonsMobile
                >
                  {tabOptions.map(([key, label]) => (
                    <Tab key={key} label={label} value={key} />
                  ))}
                </Tabs>
              </Stack>
            </CardContent>
          </Card>

          {tab === 'overview' && (
            <Stack spacing={3}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <StatCard
                    title="Total Accounts"
                    value={totalUsers}
                    hint="All members"
                    icon={<DashboardRoundedIcon color="primary" />}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <StatCard
                    title="Admins"
                    value={totalAdmins}
                    hint="Full access"
                    icon={<AdminPanelSettingsRoundedIcon color="primary" />}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <StatCard
                    title="Operators"
                    value={totalOperators}
                    hint="On-ground users"
                    icon={<FolderSharedRoundedIcon color="primary" />}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <StatCard
                    title="Candidates"
                    value={totalCandidates}
                    hint="Candidate logins"
                    icon={<FolderSharedRoundedIcon color="secondary" />}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <StatCard
                    title="Users"
                    value={totalPlainUsers}
                    hint="General role"
                    icon={<FolderSharedRoundedIcon color="action" />}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <StatCard
                    title="Volunteers"
                    value={totalVolunteers}
                    hint="Field volunteers"
                    icon={<FolderSharedRoundedIcon color="disabled" />}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <StatCard
                    title="Databases"
                    value={totalDatabases}
                    hint="Available lists"
                    icon={<SearchRoundedIcon color="primary" />}
                  />
                </Grid>
              </Grid>

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">Quick actions</Typography>
                      <Divider sx={{ my: 2 }} />
                      <Stack spacing={1.5}>
                        <Button
                          component={Link}
                          to="/search"
                          variant="outlined"
                          startIcon={<SearchRoundedIcon />}
                        >
                          Open voter search
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => setTab('team')}
                          startIcon={<FolderSharedRoundedIcon />}
                        >
                          Manage users & roles
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => setTab('databases')}
                          startIcon={<DashboardRoundedIcon />}
                        >
                          Assign databases
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">Sync status</Typography>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="body2" color="text.secondary">
                        Everything looks good. Keep refreshing to fetch the latest counts.
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Stack>
          )}

          {tab === 'team' && (
            <Stack spacing={3}>
              <Card>
                <CardContent>
                  <Typography variant="h5">Team management</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Create users, assign a role, and decide which databases each person can
                    access.
                  </Typography>
                  <AdminUsers onCreated={onUserCreated} />
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="h6">User access & databases</Typography>
                    {renderStatus()}
                    {loading ? (
                      <Typography variant="body2" color="text.secondary">
                        Loading users…
                      </Typography>
                    ) : users.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No team members found yet.
                      </Typography>
                    ) : (
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>User</TableCell>
                            <TableCell>Role</TableCell>
                            <TableCell>Party</TableCell>
                            <TableCell>Allowed databases</TableCell>
                            <TableCell align="right">Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {users.map((user) => {
                            const userId = resolveId(user);
                            const assigned = new Set(
                              user?.allowedDatabaseIds || user?.databaseIds || []
                            );
                            const isAdmin =
                              (user?.role || '').toLowerCase() === 'admin';
                            const partyName = user?.partyName || '';
                            const partyId = user?.partyId || '';

                            return (
                              <TableRow key={userId || Math.random()}>
                                <TableCell>
                                  <Typography fontWeight={600}>
                                    {user?.username || '—'}
                                  </Typography>
                                </TableCell>
                                <TableCell sx={{ minWidth: 150 }}>
                                  <TextField
                                    select
                                    size="small"
                                    value={user?.role || 'user'}
                                    disabled={isAdmin}
                                    onChange={(e) =>
                                      onRoleChange(userId, e.target.value)
                                    }
                                    fullWidth
                                  >
                                    {isAdmin ? (
                                      <MenuItem value="admin">Admin</MenuItem>
                                    ) : (
                                      [
                                        <MenuItem key="user" value="user">
                                          User
                                        </MenuItem>,
                                        <MenuItem key="candidate" value="candidate">
                                          Candidate
                                        </MenuItem>,
                                        <MenuItem key="operator" value="operator">
                                          Operator
                                        </MenuItem>,
                                        <MenuItem key="volunteer" value="volunteer">
                                          Volunteer
                                        </MenuItem>,
                                      ]
                                    )}
                                  </TextField>
                                </TableCell>
                                <TableCell sx={{ minWidth: 160 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    {partyName || partyId || '—'}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Stack
                                    direction="row"
                                    spacing={1}
                                    flexWrap="wrap"
                                  >
                                    {databases.length === 0 ? (
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                      >
                                        No databases available.
                                      </Typography>
                                    ) : (
                                      databases.map((db) => {
                                        const id = resolveId(db);
                                        const checked = assigned.has(id);
                                        return (
                                          <Chip
                                            key={id}
                                            label={databaseDisplayName(db)}
                                            color={checked ? 'primary' : 'default'}
                                            variant={checked ? 'filled' : 'outlined'}
                                            onClick={() =>
                                              onToggleDatabase(userId, id, !checked)
                                            }
                                          />
                                        );
                                      })
                                    )}
                                  </Stack>
                                </TableCell>
                                <TableCell align="right">
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => saveUser(user)}
                                    disabled={savingId === userId}
                                  >
                                    {savingId === userId ? 'Saving…' : 'Save'}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          )}

          {tab === 'databases' && (
            <Card>
              <CardContent>
                <Typography variant="h5">Voter databases</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Assign these lists to team members from the Team tab.
                </Typography>
                {databases.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No voter databases available.
                  </Typography>
                ) : (
                  <Grid container spacing={3}>
                    {databases.map((db) => (
                      <Grid
                        item
                        xs={12}
                        md={6}
                        lg={4}
                        key={resolveId(db)}
                      >
                        <Card variant="outlined">
                          <CardContent>
                            <Typography fontWeight={600}>
                              {databaseDisplayName(db)}
                            </Typography>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{ my: 1 }}
                            >
                              ID: <code>{resolveId(db)}</code>
                            </Typography>
                            <Button
                              component={Link}
                              to="/search"
                              variant="outlined"
                              size="small"
                            >
                              Open in search
                            </Button>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </CardContent>
            </Card>
          )}

          {tab === 'settings' && (
            <Card>
              <CardContent>
                <Typography variant="h5">Settings</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  General admin preferences.
                </Typography>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography fontWeight={600}>Theme</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Using a light, professional palette (blue / green accents).
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography fontWeight={600}>Shortcuts</Typography>
                        <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                          <Button
                            component={Link}
                            to="/search"
                            variant="outlined"
                          >
                            Go to search
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={() => setTab('team')}
                          >
                            Manage users
                          </Button>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
