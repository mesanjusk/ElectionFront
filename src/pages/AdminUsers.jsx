// client/src/pages/AdminUsers.jsx
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
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
import api, {
  adminListUsers,
  adminListDatabases,
  adminCreateUser,
  adminDeleteUser,
  adminUpdateUserRole,
  adminUpdateUserPassword,
  adminUpdateUserDatabases,
  adminResetUserDevice,
  adminToggleUserEnabled,
} from '../api';

// includes "volunteer"
const ROLES = ['user', 'operator', 'candidate', 'volunteer', 'admin'];

const getId = (u) => u?.id || u?._id;
const getRole = (u) => (u?.role || '').toLowerCase();
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

// Cloudinary config – read from Vite env, with safe defaults
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
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', text: '' });

  // main create-user fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [allowed, setAllowed] = useState([]);

  // political party selection
  const [partyId, setPartyId] = useState('');

  // how many volunteers to auto-create (v1, v2, v3…)
  const [autoVolunteerCount, setAutoVolunteerCount] = useState('3');

  // max volunteers allowed (limit)
  const [maxVolunteers, setMaxVolunteers] = useState('');

  // poster image for candidate/user (shared with volunteers)
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // per-user avatar + volunteer-limit editing
  const [updatingAvatarId, setUpdatingAvatarId] = useState(null);
  const [volLimitEditing, setVolLimitEditing] = useState({});

  // password modal
  const [pwdUserId, setPwdUserId] = useState(null);
  const [newPwd, setNewPwd] = useState('');

  // role/db inline editing
  const [roleEditing, setRoleEditing] = useState({});
  const [dbEditing, setDbEditing] = useState({});

  // volunteer creation dialog (manual)
  const [volDialogUser, setVolDialogUser] = useState(null);
  const [volUsername, setVolUsername] = useState('');
  const [volPassword, setVolPassword] = useState('');

  async function loadAll() {
    setLoading(true);
    try {
      const [uRes, dRes, pRes] = await Promise.all([
        adminListUsers(),
        adminListDatabases(),
        api
          .get('/api/admin/parties')
          .then((r) => r.data)
          .catch(() => []),
      ]);
      setUsers(uRes || []);
      setDbs(dRes || []);
      setParties(Array.isArray(pRes) ? pRes : []);
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
    setMaxVolunteers('');
    setPartyId('');
    setAutoVolunteerCount('3');
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setStatus({ type: '', text: '' });

    try {
      if (!username.trim()) throw new Error('Username required');
      if (password.length < 4)
        throw new Error('Password must be at least 4 chars');

      let avatarUrl = null;

      if (avatarFile) {
        setUploadingAvatar(true);
        avatarUrl = await uploadAvatarToCloudinary(avatarFile);
      }

      // Parse maxVolunteers as number (limit)
      let maxVol = 0;
      if (maxVolunteers !== '') {
        const parsed = Number(maxVolunteers);
        if (Number.isNaN(parsed) || parsed < 0) {
          throw new Error('Max volunteers must be a positive number');
        }
        maxVol = Math.min(parsed, 50);
      }

      // Parse autoVolunteerCount
      let autoCount = 0;
      if (autoVolunteerCount !== '') {
        const parsedAuto = Number(autoVolunteerCount);
        if (Number.isNaN(parsedAuto) || parsedAuto < 0) {
          throw new Error('Volunteers to auto-create must be >= 0');
        }
        autoCount = Math.min(parsedAuto, 50);
      }

      // Ensure limit is at least auto count
      if (autoCount > 0 && maxVol > 0 && maxVol < autoCount) {
        maxVol = autoCount;
      } else if (autoCount > 0 && maxVol === 0) {
        maxVol = autoCount;
      }

      const baseUsername = username.trim();

      // 1) Create main user
      const created = await adminCreateUser({
        username: baseUsername,
        password,
        role,
        allowedDatabaseIds: allowed,
        avatarUrl, // poster image
        maxVolunteers: maxVol,
        partyId: partyId || null,
      });

      const createdId =
        created?.id ||
        created?._id ||
        created?.user?.id ||
        created?.user?._id;
      const createdUsername =
        created?.username || created?.user?.username || baseUsername;

      // 2) Auto-create volunteers only for candidates
      if (role === 'candidate' && autoCount > 0 && createdId) {
        for (let i = 1; i <= autoCount; i += 1) {
          const vUsername = `${createdUsername}v${i}`; // priyal -> priyalv1
          await adminCreateUser({
            username: vUsername,
            password, // same password as candidate
            role: 'volunteer',
            allowedDatabaseIds: allowed,
            avatarUrl, // same poster image as candidate
            parentUserId: createdId,
            parentUsername: createdUsername,
            partyId: partyId || null,
          });
        }
      }

      resetCreateForm();
      setStatus({
        type: 'ok',
        text:
          role === 'candidate' && autoCount > 0
            ? `User created with ${autoCount} volunteers (e.g. ${baseUsername}v1, ${baseUsername}v2…)`
            : 'User created',
      });
      onCreated?.();
      await loadAll();
    } catch (err) {
      setStatus({ type: 'error', text: err?.message || String(err) });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm('Delete this user and their volunteers + DBs?')) return;
    try {
      await adminDeleteUser(id);
      setStatus({ type: 'ok', text: 'User deleted (and private DBs removed)' });
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
    // New DB list selected for this user (master DB IDs)
    const newDbList = Array.from(dbEditing[id] || []);

    // 1) Update the selected user
    await adminUpdateUserDatabases(id, newDbList);

    // 2) If this user is a candidate, also update all their volunteers
    const parentUser = users.find((u) => getId(u) === id);
    const parentRole = parentUser ? getRole(parentUser) : null;

    let extraMsg = '';

    if (parentUser && parentRole === 'candidate') {
      const volunteers = users.filter((u) => {
        if (getRole(u) !== 'volunteer') return false;
        const pId = u.parentUserId;
        if (!pId) return false;

        // Normalize to string to be safe
        return (
          String(pId) === String(id) ||
          String(pId) === String(parentUser.id) ||
          String(pId) === String(parentUser._id)
        );
      });

      for (const v of volunteers) {
        const vId = getId(v);
        if (!vId) continue;
        await adminUpdateUserDatabases(vId, newDbList);
      }

      extraMsg = ` (and ${volunteers.length} volunteer${
        volunteers.length === 1 ? '' : 's'
      })`;
    }

    setStatus({
      type: 'ok',
      text: `Allowed databases updated${extraMsg}`,
    });

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

  // volunteer dialog helpers (manual volunteers)
  const openVolunteerDialog = (user) => {
    setVolDialogUser(user);
    setVolUsername('');
    setVolPassword('');
  };

  const closeVolunteerDialog = () => {
    setVolDialogUser(null);
    setVolUsername('');
    setVolPassword('');
  };

  const onCreateVolunteer = async (e) => {
    e.preventDefault();
    if (!volDialogUser) return;

    setStatus({ type: '', text: '' });

    try {
      if (!volUsername.trim()) throw new Error('Volunteer username required');
      if (volPassword.length < 4)
        throw new Error('Password must be at least 4 chars');

      const maxVol = volDialogUser?.maxVolunteers ?? 0;
      const usedVol = volDialogUser?.volunteerCount ?? 0;
      if (maxVol && usedVol >= maxVol) {
        throw new Error('Volunteer limit reached for this account');
      }

      const parentId = getId(volDialogUser);
      const parentUsername = volDialogUser.username;
      const parentAllowed = volDialogUser?.allowedDatabaseIds || [];
      const parentPartyId =
        volDialogUser.partyId ||
        volDialogUser.party ||
        null;
      const parentAvatarUrl = volDialogUser.avatarUrl || null;

      await adminCreateUser({
        username: volUsername.trim(),
        password: volPassword,
        role: 'volunteer',
        avatarUrl: parentAvatarUrl, // same poster image
        parentUserId: parentId,
        parentUsername,
        allowedDatabaseIds: parentAllowed,
        partyId: parentPartyId,
      });

      setStatus({
        type: 'ok',
        text: `Volunteer created for ${parentUsername}`,
      });
      closeVolunteerDialog();
      await loadAll();
    } catch (err) {
      setStatus({ type: 'error', text: err?.message || String(err) });
    }
  };

  // enable / disable user (and their volunteers)
  const onToggleEnabled = async (id, enable) => {
    try {
      await adminToggleUserEnabled(id, enable);
      setStatus({
        type: 'ok',
        text: enable
          ? 'User enabled (and their volunteers)'
          : 'User disabled (and their volunteers)',
      });
      await loadAll();
    } catch (e) {
      setStatus({ type: 'error', text: e?.message || String(e) });
    }
  };

  // per-user avatar update (edit existing user image)
  const handleUserAvatarChange = async (e, user) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const userId = getId(user);
    if (!userId) return;

    setStatus({ type: '', text: '' });
    setUpdatingAvatarId(userId);

    try {
      const url = await uploadAvatarToCloudinary(file);
      await api.patch(`/api/admin/users/${userId}/profile`, { avatarUrl: url });
      setStatus({ type: 'ok', text: 'User image updated' });
      await loadAll();
    } catch (err) {
      setStatus({
        type: 'error',
        text:
          err?.response?.data?.error ||
          err?.message ||
          'Failed to update user image',
      });
    } finally {
      setUpdatingAvatarId(null);
      if (e.target) e.target.value = '';
    }
  };

  // volunteer-limit editing helpers
  const beginVolLimitEdit = (id, current) => {
    setVolLimitEditing((prev) => ({
      ...prev,
      [id]:
        current === null || current === undefined || current === 0
          ? ''
          : String(current),
    }));
  };

  const cancelVolLimitEdit = (id) => {
    setVolLimitEditing((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const saveVolLimit = async (id) => {
    const raw = volLimitEditing[id];
    let n = 0;

    if (raw !== '' && raw !== undefined) {
      n = Number(raw);
      if (Number.isNaN(n) || n < 0) {
        setStatus({
          type: 'error',
          text: 'Volunteer limit must be a non-negative number',
        });
        return;
      }
    }

    try {
      await api.patch(`/api/admin/users/${id}/profile`, {
        maxVolunteers: n,
      });
      setStatus({ type: 'ok', text: 'Volunteer limit updated' });
      cancelVolLimitEdit(id);
      await loadAll();
    } catch (err) {
      setStatus({
        type: 'error',
        text:
          err?.response?.data?.error ||
          err?.message ||
          'Failed to update volunteer limit',
      });
    }
  };

  // resolve party display name from user object
  const getUserPartyName = (u) => {
    const pid = u.partyId || u.party;
    if (pid && parties.length) {
      const match = parties.find(
        (p) =>
          p.id === pid ||
          p._id === pid ||
          p.code === pid
      );
      if (match) {
        return (
          match.name ||
          match.title ||
          match.shortName ||
          match.code ||
          pid
        );
      }
    }
    return u.partyName || u.party || '—';
  };

  return (
    <Stack spacing={3}>
      {status.text && (
        <Alert severity={status.type === 'error' ? 'error' : 'success'}>
          {status.text}
        </Alert>
      )}

      {/* CREATE NEW USER */}
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

              {/* Political party */}
              <Grid item xs={12} md={4}>
                <TextField
                  select
                  label="Political party"
                  value={partyId}
                  onChange={(e) => setPartyId(e.target.value)}
                  fullWidth
                  helperText="Party from Party master DB"
                >
                  <MenuItem value="">None</MenuItem>
                  {parties.map((p) => {
                    const value = p.id || p._id || p.code;
                    const label =
                      p.name ||
                      p.title ||
                      p.shortName ||
                      p.code ||
                      value;
                    return (
                      <MenuItem key={value} value={value}>
                        {label}
                      </MenuItem>
                    );
                  })}
                </TextField>
              </Grid>

              {/* Max volunteers allowed */}
              <Grid item xs={12} md={4}>
                <TextField
                  label="Max volunteers (logins)"
                  type="number"
                  value={maxVolunteers}
                  onChange={(e) => setMaxVolunteers(e.target.value)}
                  fullWidth
                  helperText="Set 5–10 for most candidates. Leave blank for 0."
                  inputProps={{ min: 0 }}
                />
              </Grid>

              {/* Volunteers to auto-create */}
              <Grid item xs={12} md={4}>
                <TextField
                  label="Volunteers to auto-create"
                  type="number"
                  value={autoVolunteerCount}
                  onChange={(e) => setAutoVolunteerCount(e.target.value)}
                  fullWidth
                  helperText="For candidates, creates usernamev1, usernamev2, …"
                  inputProps={{ min: 0 }}
                />
              </Grid>

              {/* Poster image upload */}
              <Grid item xs={12} md={4}>
                <Button
                  variant="outlined"
                  component="label"
                  fullWidth
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? 'Uploading image…' : 'Upload poster image'}
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
                      Poster image selected (used for user + all volunteers)
                    </Typography>
                  </Stack>
                )}
              </Grid>
            </Grid>

            <Typography variant="subtitle2" sx={{ mt: 3 }}>
              Allowed databases (master DBs – app will clone per user)
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

      {/* ALL USERS */}
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
                const isEditingVolLimit = volLimitEditing[id] !== undefined;

                const dbSet = isDbEditing
                  ? dbEditing[id]
                  : new Set(u?.allowedDatabaseIds || []);
                const dbList = Array.from(dbSet);

                const role = getRole(u);
                const isEnabled = u.enabled !== false;

                const maxVol = u?.maxVolunteers ?? 0;
                const usedVol = u?.volunteerCount ?? 0;
                const parentUsername = u?.parentUsername;
                const parentUserId = u?.parentUserId;

                const volunteerLimitReached = maxVol && usedVol >= maxVol;
                const partyName = getUserPartyName(u);

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
                          <Stack
                            direction="row"
                            spacing={2}
                            alignItems="center"
                          >
                            <Avatar
                              src={u.avatarUrl || undefined}
                              sx={{ width: 40, height: 40 }}
                            >
                              {u.username?.[0]?.toUpperCase() || '?'}
                            </Avatar>
                            <Stack spacing={0.5}>
                              <Typography variant="h6">{u.username}</Typography>
                              {role === 'volunteer' && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  Volunteer for:{' '}
                                  {parentUsername || parentUserId || '—'}
                                </Typography>
                              )}
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                Party: {partyName}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                Passwords stored securely (hashed)
                              </Typography>
                            </Stack>
                          </Stack>
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            <Chip
                              label={role}
                              color="primary"
                              variant="outlined"
                            />
                            <Chip
                              label={isEnabled ? 'Active' : 'Disabled'}
                              color={isEnabled ? 'success' : 'default'}
                              variant={isEnabled ? 'filled' : 'outlined'}
                            />
                            {role !== 'volunteer' && (
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={volunteerLimitReached || !isEnabled}
                                onClick={() => openVolunteerDialog(u)}
                              >
                                {volunteerLimitReached
                                  ? 'Volunteer limit reached'
                                  : 'Create volunteer'}
                              </Button>
                            )}

                            <Button
                              size="small"
                              variant="outlined"
                              component="label"
                              disabled={updatingAvatarId === id}
                            >
                              {u.avatarUrl
                                ? updatingAvatarId === id
                                  ? 'Updating image…'
                                  : 'Replace image'
                                : updatingAvatarId === id
                                ? 'Uploading image…'
                                : 'Upload image'}
                              <input
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={(e) =>
                                  handleUserAvatarChange(e, u)
                                }
                              />
                            </Button>

                            <Button
                              size="small"
                              variant="outlined"
                              color={isEnabled ? 'warning' : 'success'}
                              onClick={() =>
                                onToggleEnabled(id, !isEnabled)
                              }
                            >
                              {isEnabled ? 'Disable user' : 'Enable user'}
                            </Button>
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
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
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
                                  label={role}
                                  color="primary"
                                  variant="filled"
                                />
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={() => beginRoleEdit(id, role)}
                                >
                                  Edit
                                </Button>
                              </Stack>
                            )}
                          </Grid>

                          <Grid item xs={12} md={4}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Allowed DBs
                            </Typography>
                            {isDbEditing ? (
                              <Stack spacing={1} sx={{ mt: 1 }}>
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  flexWrap="wrap"
                                >
                                  {dbs.map((d) => (
                                    <Chip
                                      key={d.id}
                                      label={d.name || d.id}
                                      color={
                                        dbSet.has(d.id)
                                          ? 'primary'
                                          : 'default'
                                      }
                                      variant={
                                        dbSet.has(d.id)
                                          ? 'filled'
                                          : 'outlined'
                                      }
                                      onClick={() =>
                                        toggleDbForUser(id, d.id)
                                      }
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
                                  onClick={() =>
                                    beginDbEdit(id, u?.allowedDatabaseIds)
                                  }
                                >
                                  Edit
                                </Button>
                              </Stack>
                            )}
                          </Grid>

                          {/* Volunteer slots summary for non-volunteer accounts */}
                          {role !== 'volunteer' && (
                            <Grid item xs={12} md={4}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Volunteer logins
                              </Typography>
                              <Typography sx={{ mt: 1 }}>
                                {maxVol
                                  ? `${usedVol} / ${maxVol} volunteers in use`
                                  : 'No volunteer limit set'}
                              </Typography>

                              {isEditingVolLimit ? (
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  sx={{ mt: 1 }}
                                >
                                  <TextField
                                    type="number"
                                    size="small"
                                    label="Max volunteers"
                                    value={volLimitEditing[id]}
                                    onChange={(e) =>
                                      setVolLimitEditing((prev) => ({
                                        ...prev,
                                        [id]: e.target.value,
                                      }))
                                    }
                                    inputProps={{ min: 0 }}
                                  />
                                  <Button
                                    variant="contained"
                                    size="small"
                                    onClick={() => saveVolLimit(id)}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => cancelVolLimitEdit(id)}
                                  >
                                    Cancel
                                  </Button>
                                </Stack>
                              ) : (
                                <Button
                                  variant="outlined"
                                  size="small"
                                  sx={{ mt: 1 }}
                                  onClick={() => beginVolLimitEdit(id, maxVol)}
                                >
                                  Edit limit
                                </Button>
                              )}

                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ mt: 1 }}
                              >
                                Each volunteer has separate credentials and is
                                device-locked like a normal user. Enabling /
                                disabling this user affects all their volunteers.
                              </Typography>
                            </Grid>
                          )}

                          <Grid item xs={12} md={4}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Device
                            </Typography>
                            <Stack spacing={0.5} sx={{ mt: 1 }}>
                              {u.deviceIdBound ? (
                                <>
                                  <Typography fontFamily="monospace">
                                    bound: {u.deviceIdBound}
                                  </Typography>
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    at: {fmt(u.deviceBoundAt)}
                                  </Typography>
                                </>
                              ) : (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
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
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Created
                            </Typography>
                            <Typography>{fmt(u.createdAt)}</Typography>
                          </Grid>
                          <Grid item xs={12} md={4}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
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

      {/* PASSWORD MODAL */}
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
                Passwords are stored securely. After saving, you will see the new
                password once to share with the user.
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

      {/* CREATE VOLUNTEER MODAL (manual) */}
      <Dialog
        open={!!volDialogUser}
        onClose={closeVolunteerDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Create volunteer for <strong>{volDialogUser?.username || ''}</strong>
        </DialogTitle>
        <Box component="form" onSubmit={onCreateVolunteer}>
          <DialogContent>
            <Stack spacing={2}>
              <TextField
                label="Volunteer username"
                value={volUsername}
                onChange={(e) => setVolUsername(e.target.value)}
                required
                fullWidth
              />
              <TextField
                label="Password"
                type="password"
                value={volPassword}
                onChange={(e) => setVolPassword(e.target.value)}
                required
                fullWidth
              />
              <Typography variant="body2" color="text.secondary">
                Volunteer will inherit poster image, party and cloned databases
                from this account and will be device-locked after first
                activation.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeVolunteerDialog}>Cancel</Button>
            <Button type="submit" variant="contained">
              Create volunteer
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
