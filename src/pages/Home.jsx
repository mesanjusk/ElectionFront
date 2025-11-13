// client/src/pages/Home.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  Stack,
  Typography,
  Menu,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import QuizRoundedIcon from "@mui/icons-material/QuizRounded";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";

import {
  getUser,
  getAvailableDatabases,
  getActiveDatabase,
  setActiveDatabase,
  lockSession,
  clearToken,
} from "../auth";
import { pullAll, resetSyncState, pushOutbox } from "../services/sync";
import TopNavbar from "../components/TopNavbar.jsx";

export default function Home() {
  const [databases, setDatabases] = useState(() => getAvailableDatabases());
  const [activeDb, setActiveDb] = useState(() => getActiveDatabase());
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);

  const navigate = useNavigate();
  const user = useMemo(() => getUser(), []);

  // Pick the single assigned DB (no UI to change)
  const assignedDb = useMemo(() => {
    if (!databases || databases.length === 0) return null;
    if (databases.length === 1) return databases[0];
    const current = databases.find((db) => (db.id || db._id) === activeDb);
    return current || databases[0];
  }, [databases, activeDb]);

  const assignedId = assignedDb ? assignedDb.id || assignedDb._id : "";
  const assignedName = assignedDb
    ? assignedDb.name ||
      assignedDb.title ||
      assignedDb.label ||
      `Database ${assignedId}`
    : null;

  // Load DBs & restore last sync count on mount
  useEffect(() => {
    const dbs = getAvailableDatabases();
    setDatabases(dbs);

    const existingActive = getActiveDatabase();
    if (!existingActive && dbs && dbs.length === 1) {
      const id = dbs[0].id || dbs[0]._id;
      setActiveDatabase(id);
      setActiveDb(id);
      const cached = Number(localStorage.getItem(`lastSyncCount:${id}`) || 0);
      setTotalCount(Number.isFinite(cached) ? cached : 0);
    } else {
      const id =
        existingActive || (dbs[0] && (dbs[0].id || dbs[0]._id)) || "";
      setActiveDb(id);
      const cached = Number(localStorage.getItem(`lastSyncCount:${id}`) || 0);
      setTotalCount(Number.isFinite(cached) ? cached : 0);
    }
  }, []);

  // Keep count updated when assigned DB changes
  useEffect(() => {
    if (!assignedId) return;
    const cached = Number(
      localStorage.getItem(`lastSyncCount:${assignedId}`) || 0
    );
    setTotalCount(Number.isFinite(cached) ? cached : 0);
  }, [assignedId]);

  const syncAssigned = async () => {
    if (!assignedDb) {
      setSyncMessage("No voter database is assigned to your account.");
      return;
    }
    const id = assignedDb.id || assignedDb._id;
    setSyncing(true);
    setSyncMessage("");
    try {
      if (activeDb !== id) {
        setActiveDatabase(id);
        setActiveDb(id);
      }
      await resetSyncState(id);
      const total = await pullAll({ databaseId: id });
      localStorage.setItem(`lastSyncCount:${id}`, String(total || 0));
      setTotalCount(total || 0);
      setSyncMessage(
        `Synced ${total} voter records from your assigned database.`
      );
    } catch (e) {
      setSyncMessage(`Sync failed: ${e?.message || e}`);
    } finally {
      setSyncing(false);
    }
  };

  const pushAssigned = async () => {
    if (!assignedDb) {
      setSyncMessage("No voter database is assigned to your account.");
      return;
    }
    const id = assignedDb.id || assignedDb._id;
    setSyncing(true);
    setSyncMessage("");
    try {
      const res = await pushOutbox({ databaseId: id });
      setSyncMessage(
        `Uploaded ${res.pushed || 0} offline changes${
          res.failed?.length ? `, failed: ${res.failed.length}` : ""
        }.`
      );
    } catch (e) {
      setSyncMessage(`Push failed: ${e?.message || e}`);
    } finally {
      setSyncing(false);
    }
  };

  // --- Tiny bar chart (no external libs) ---
  const chartData = [{ label: "Total", value: totalCount }];
  const maxVal = Math.max(...chartData.map((d) => d.value), 10);

  const quickActions = [
    {
      label: "Voter Search",
      description: "",
      icon: <SearchRoundedIcon color="primary" />,
      action: () => navigate("/search"),
    },
    {
      label: "1",
      description: "",
      icon: <QuizRoundedIcon color="secondary" />,
      action: () => alert("Volunteer quiz coming soon."),
    },
    {
      label: "2",
      description: "",
      icon: <MapRoundedIcon color="primary" />,
      action: () => alert("Constituency fact sheet coming soon."),
    },
  ];

  const collectionName = assignedName || "Unassigned collection";
  const userName = user?.username || user?.name || "User";
  const userRole = (user?.role || "").toUpperCase();
  const avatarUrl = user?.avatarUrl || user?.avatar || null;

  const handleMenuOpen = (event) => setMenuAnchorEl(event.currentTarget);
  const handleMenuClose = () => setMenuAnchorEl(null);

  const logout = () => {
    handleMenuClose();
    lockSession();
    clearToken();
    navigate("/login", { replace: true });
  };

  return (
    <Box sx={{ minHeight: "100vh", py: { xs: 4, md: 8 } }}>
      {/* Shared top navbar */}
      <TopNavbar
        collectionName={collectionName}
        userName={userName}
        // optional prop if you later want to use avatar in TopNavbar
        userAvatar={avatarUrl}
        busy={syncing}
        onMenuOpen={handleMenuOpen}
        onPull={syncAssigned}
        onPush={pushAssigned}
      />

      {/* Menu for logout */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
        keepMounted
      >
        <Box sx={{ px: 2, py: 1.5, width: 280 }}>
          <Button
            variant="outlined"
            startIcon={<LogoutRoundedIcon />}
            sx={{ mt: 1 }}
            onClick={logout}
            fullWidth
          >
            Logout
          </Button>
        </Box>
      </Menu>

      <Container maxWidth="lg">
        <Stack spacing={4}>
          {/* Header + user card (shows avatar from Cloudinary) */}
          <Grid container spacing={3}>
            <Grid item xs={12} md={5}>
              <Card>
                <CardContent>
                  <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    justifyContent="flex-start"
                  >
                    <Avatar
                      src={avatarUrl || undefined}
                      alt={userName}
                      sx={{
                        width: 64,
                        height: 64,
                        bgcolor: "#1976d2",
                        fontSize: 24,
                      }}
                    >
                      {!avatarUrl && userName?.[0]?.toUpperCase?.()}
                    </Avatar>
                    <Stack spacing={0.5}>
                      <Typography variant="h6">{userName}</Typography>
                      {userRole && (
                        <Chip
                          label={userRole}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      )}
                      {assignedName && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5 }}
                        >
                          Assigned DB: {assignedName}
                        </Typography>
                      )}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Main metrics + sync button on left */}
          <Grid container spacing={3}>
            <Grid item xs={12} md={7}>
              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="h6">
                      Voter records — {assignedName || "N/A"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Latest synced total shown below.
                    </Typography>

                    <Box
                      sx={{
                        position: "relative",
                        minHeight: 220,
                        borderRadius: 3,
                        background:
                          "linear-gradient(180deg, rgba(15,111,255,0.08), #fff)",
                        p: 3,
                      }}
                    >
                      {[0.25, 0.5, 0.75].map((g) => (
                        <Box
                          key={g}
                          sx={{
                            position: "absolute",
                            left: 24,
                            right: 24,
                            bottom: `${g * 100}%`,
                            borderTop: "1px dashed rgba(15,111,255,0.2)",
                          }}
                        />
                      ))}
                      <Stack
                        direction="row"
                        justifyContent="center"
                        alignItems="flex-end"
                        spacing={6}
                        sx={{ position: "absolute", inset: 0, pb: 3 }}
                      >
                        {chartData.map((d) => {
                          const h = Math.round(
                            (d.value / maxVal) * 170
                          );
                          return (
                            <Stack
                              key={d.label}
                              spacing={1}
                              alignItems="center"
                            >
                              <Box
                                sx={{
                                  width: 64,
                                  height: h,
                                  borderRadius: 5,
                                  background:
                                    "linear-gradient(180deg,#0fb981,#0f6fff)",
                                }}
                              />
                              <Typography variant="subtitle1">
                                {d.label}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                {d.value.toLocaleString()}
                              </Typography>
                            </Stack>
                          );
                        })}
                      </Stack>
                    </Box>

                    <Stack
                      direction="row"
                      spacing={2}
                      alignItems="center"
                    >
                      <Button
                        variant="contained"
                        startIcon={<SyncRoundedIcon />}
                        onClick={syncAssigned}
                        disabled={syncing || !assignedDb}
                      >
                        {syncing ? "Syncing…" : "Sync assigned voters"}
                      </Button>
                      {syncMessage && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                        >
                          {syncMessage}
                        </Typography>
                      )}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Quick actions — 3 in one row */}
          <Grid container spacing={3}>
            {quickActions.map((action) => (
              <Grid item xs={4} md={4} key={action.label}>
                <Card
                  onClick={action.action}
                  sx={{ cursor: "pointer", height: "100%" }}
                >
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Box>{action.icon}</Box>
                      <Typography variant="h6">
                        {action.label}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        {action.description}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Stack>
      </Container>
    </Box>
  );
}
