// client/src/pages/AdminUsers.jsx
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  adminListUsers,
  adminListDatabases,
  adminCreateUser,
  adminDeleteUser,
  adminUpdateUserRole,
  adminUpdateUserPassword,
  adminUpdateUserDatabases,
  adminResetUserDevice,
} from '../api';

const ROLES = ['user', 'operator', 'candidate', 'admin'];

const getId = (u) => u?.id || u?._id;
const getRole = (u) => (u?.role || '').toLowerCase();
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

// 🔧 Cloudinary config – read from Vite env, with safe defaults
const CLOUDINARY_CLOUD_NAME =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dadcprflr';
const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'election_users';

// helper: upload image file to Cloudinary (unsigned upload)
async function uploadAvatarToCloudinary(file) {
  if (!file) return null;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error(
      'Cloudinary config missing. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.'
    );
  }

  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error('Image upload failed');
  }

  const data = await res.json();
  return data.secure_url;
}

export default function AdminUsers({ onCreated }) {
  const [users, setUsers] = useState([]);
  const [dbs, setDbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', text: '' });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [allowed, setAllowed] = useState([]);

  // 🖼 avatar states for create-user
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [pwdUserId, setPwdUserId] = useState(null);
  const [newPwd, setNewPwd] = useState('');

  const [roleEditing, setRoleEditing] = useState({});
  const [dbEditing, setDbEditing] = useState({});

  async function loadAll() {
    setLoading(true);
    try {
      const [u, d] = await Promise.all([adminListUsers(), adminListDatabases()]);
      setUsers(u || []);
      setDbs(d || []);
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const onToggleDb = (id) => {
    setAllowed((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const resetCreateForm = () => {
    setUsername('');
    setPassword('');
    setRole('user');
    setAllowed([]);
    setAvatarFile(null);
    setAvatarPreview('');
    setUploadingAvatar(false);
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setStatus({ type: '', text: '' });

    try {
      if (!username.trim()) throw new Error('Username required');
      if (password.length < 4) throw new Error('Password must be at least 4 chars');

      let avatarUrl = null;

      if (avatarFile) {
        setUploadingAvatar(true);
        avatarUrl = await uploadAvatarToCloudinary(avatarFile);
      }

      await adminCreateUser({
        username: username.trim(),
        password,
        role,
        allowedDatabaseIds: allowed,
        avatarUrl, // 👈 send Cloudinary URL to backend
      });

      resetCreateForm();
      setStatus({ type: 'ok', text: 'User created' });
      onCreated?.();
      await loadAll();
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    try {
      await adminDeleteUser(id);
      setStatus({ type: 'ok', text: 'User deleted' });
      await loadAll();
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  const beginRoleEdit = (id, currentRole) => {
    setRoleEditing((prev) => ({ ...prev, [id]: currentRole || 'user' }));
  };
  const cancelRoleEdit = (id) => {
    setRoleEditing((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };
  const saveRole = async (id) => {
    try {
      await adminUpdateUserRole(id, roleEditing[id]);
      setStatus({ type: 'ok', text: 'Role updated' });
      cancelRoleEdit(id);
      await loadAll();
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  const beginDbEdit = (id, currentList) => {
    const s = new Set(Array.isArray(currentList) ? currentList : []);
    setDbEditing((prev) => ({ ...prev, [id]: s }));
  };
  const toggleDbForUser = (id, dbId) => {
    setDbEditing((prev) => {
      const s = new Set(prev[id] || []);
      if (s.has(dbId)) s.delete(dbId);
      else s.add(dbId);
      return { ...prev, [id]: s };
    });
  };
  const cancelDbEdit = (id) => {
    setDbEditing((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };
  const saveDbEdit = async (id) => {
    try {
      await adminUpdateUserDatabases(id, Array.from(dbEditing[id] || []));
      setStatus({ type: 'ok', text: 'Allowed databases updated' });
      cancelDbEdit(id);
      await loadAll();
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  const onResetDevice = async (id) => {
    if (!window.confirm('Reset bound device for this user?')) return;
    try {
      await adminResetUserDevice(id);
      setStatus({ type: 'ok', text: 'Device binding reset' });
      await loadAll();
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  const openPwdModal = (id) => {
    setPwdUserId(id);
    setNewPwd('');
  };
  const closePwdModal = () => {
    setPwdUserId(null);
    setNewPwd('');
  };
  const savePassword = async (e) => {
    e.preventDefault();
    if (!newPwd || newPwd.length < 4) {
      setStatus({ type: 'error', text: 'Password must be at least 4 chars' });
      return;
    }
    try {
      await adminUpdateUserPassword(pwdUserId, newPwd);
      closePwdModal();
      setStatus({ type: 'ok', text: 'Password updated' });
      await loadAll();
      window.alert(
        `New password set successfully.\nShare this one-time value with the user:\n\n${newPwd}`
      );
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  return (
    <Stack spacing={3}>
      {status.text && (
        <Alert severity={status.type === 'error' ? 'error' : 'success'}>
          {status.text}
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6">Create new user</Typography>
          <Box component="form" onSubmit={onCreate} sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  select
                  label="Role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  fullWidth
                >
                  {ROLES.map((r) => (
                    <MenuItem key={r} value={r}>
                      {r}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              {/* Avatar upload */}
              <Grid item xs={12} md={4}>
                <Button
                  variant="outlined"
                  component="label"
                  fullWidth
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? 'Uploading image…' : 'Upload user image'}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleAvatarChange}
                  />
                </Button>
                {avatarPreview && (
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ mt: 1 }}
                  >
                    <img
                      src={avatarPreview}
                      alt="Preview"
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      Image selected
                    </Typography>
                  </Stack>
                )}
              </Grid>
            </Grid>

            <Typography variant="subtitle2" sx={{ mt: 3 }}>
              Allowed databases
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
              {dbs.map((d) => (
                <Chip
                  key={d.id}
                  label={d.name || d.id}
                  color={allowed.includes(d.id) ? 'primary' : 'default'}
                  variant={allowed.includes(d.id) ? 'filled' : 'outlined'}
                  onClick={() => onToggleDb(d.id)}
                />
              ))}
            </Stack>
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 3 }}>
              <Button type="submit" variant="contained" disabled={uploadingAvatar}>
                {uploadingAvatar ? 'Uploading…' : 'Create user'}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6">All users</Typography>
          {loading ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Loading…
            </Typography>
          ) : (
            <Stack spacing={2} sx={{ mt: 2 }}>
              {users.map((u) => {
                const id = getId(u);
                const isRoleEditing = roleEditing[id] !== undefined;
                const isDbEditing = dbEditing[id] !== undefined;
                const dbSet = isDbEditing
                  ? dbEditing[id]
                  : new Set(u?.allowedDatabaseIds || []);
                const dbList = Array.from(dbSet);

                return (
                  <Card key={id} variant="outlined">
                    <CardContent>
                      <Stack spacing={2}>
                        <Stack
                          direction={{ xs: 'column', sm: 'row' }}
                          spacing={1}
                          alignItems="center"
                          justifyContent="space-between"
                        >
                          <Stack spacing={0.5}>
                            <Typography variant="h6">{u.username}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Passwords stored securely (hashed)
                            </Typography>
                          </Stack>
                          <Stack direction="row" spacing={1}>
                            <Chip label={getRole(u)} color="primary" variant="outlined" />
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => openPwdModal(id)}
                            >
                              Change password
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => onDelete(id)}
                            >
                              Delete
                            </Button>
                          </Stack>
                        </Stack>

                        <Grid container spacing={2}>
                          <Grid item xs={12} md={4}>
                            <Typography variant="caption" color="text.secondary">
                              Role
                            </Typography>
                            {isRoleEditing ? (
                              <Stack spacing={1} sx={{ mt: 1 }}>
                                <TextField
                                  select
                                  value={roleEditing[id]}
                                  onChange={(e) =>
                                    setRoleEditing((prev) => ({
                                      ...prev,
                                      [id]: e.target.value,
                                    }))
                                  }
                                  fullWidth
                                >
                                  {ROLES.map((r) => (
                                    <MenuItem key={r} value={r}>
                                      {r}
                                    </MenuItem>
                                  ))}
                                </TextField>
                                <Stack direction="row" spacing={1}>
                                  <Button
                                    variant="contained"
                                    size="small"
                                    onClick={() => saveRole(id)}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => cancelRoleEdit(id)}
                                  >
                                    Cancel
                                  </Button>
                                </Stack>
                              </Stack>
                            ) : (
                              <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                                sx={{ mt: 1 }}
                              >
                                <Chip
                                  label={getRole(u)}
                                  color="primary"
                                  variant="filled"
                                />
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={() => beginRoleEdit(id, getRole(u))}
                                >
                                  Edit
                                </Button>
                              </Stack>
                            )}
                          </Grid>

                          <Grid item xs={12} md={4}>
                            <Typography variant="caption" color="text.secondary">
                              Allowed DBs
                            </Typography>
                            {isDbEditing ? (
                              <Stack spacing={1} sx={{ mt: 1 }}>
                                <Stack direction="row" spacing={1} flexWrap="wrap">
                                  {dbs.map((d) => (
                                    <Chip
                                      key={d.id}
                                      label={d.name || d.id}
                                      color={dbSet.has(d.id) ? 'primary' : 'default'}
                                      variant={dbSet.has(d.id) ? 'filled' : 'outlined'}
                                      onClick={() => toggleDbForUser(id, d.id)}
                                    />
                                  ))}
                                </Stack>
                                <Stack direction="row" spacing={1}>
                                  <Button
                                    variant="contained"
                                    size="small"
                                    onClick={() => saveDbEdit(id)}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => cancelDbEdit(id)}
                                  >
                                    Cancel
                                  </Button>
                                </Stack>
                              </Stack>
                            ) : (
                              <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                                sx={{ mt: 1 }}
                              >
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  {dbList.length ? dbList.join(', ') : '—'}
                                </Typography>
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={() => beginDbEdit(id, u?.allowedDatabaseIds)}
                                >
                                  Edit
                                </Button>
                              </Stack>
                            )}
                          </Grid>

                          <Grid item xs={12} md={4}>
                            <Typography variant="caption" color="text.secondary">
                              Device
                            </Typography>
                            <Stack spacing={0.5} sx={{ mt: 1 }}>
                              {u.deviceIdBound ? (
                                <>
                                  <Typography fontFamily="monospace">
                                    bound: {u.deviceIdBound}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    at: {fmt(u.deviceBoundAt)}
                                  </Typography>
                                </>
                              ) : (
                                <Typography variant="body2" color="text.secondary">
                                  —
                                </Typography>
                              )}
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => onResetDevice(id)}
                              >
                                Reset device
                              </Button>
                            </Stack>
                          </Grid>

                          <Grid item xs={12} md={4}>
                            <Typography variant="caption" color="text.secondary">
                              Created
                            </Typography>
                            <Typography>{fmt(u.createdAt)}</Typography>
                          </Grid>
                          <Grid item xs={12} md={4}>
                            <Typography variant="caption" color="text.secondary">
                              Updated
                            </Typography>
                            <Typography>{fmt(u.updatedAt)}</Typography>
                          </Grid>
                        </Grid>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!pwdUserId} onClose={closePwdModal} fullWidth maxWidth="xs">
        <DialogTitle>Change password</DialogTitle>
        <Box component="form" onSubmit={savePassword}>
          <DialogContent>
            <Stack spacing={2}>
              <TextField
                label="New password"
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                autoFocus
                required
              />
              <Typography variant="body2" color="text.secondary">
                Passwords are stored securely. After saving, you will see the new password once to
                share with the user.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={closePwdModal}>Cancel</Button>
            <Button type="submit" variant="contained">
              Save
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
