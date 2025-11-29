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

  // Pick the single assigned per-user DB (no UI to change)
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

  // --- Election trends bar chart data (like screenshot) ---
  const chartData = [
    { label: "BJP", value: 320 },
    { label: "INC", value: 260 },
    { label: "AAP", value: 190 },
    { label: "NCP", value: 140 },
    { label: "SP", value: 110 },
    { label: "BSP", value: 90 },
    { label: "OTH", value: 70 },
  ];
  const maxVal = Math.max(...chartData.map((d) => d.value), 10);
  const yTicks = [0, 100, 200, 300, 400];

  // 🔹 Updated quick actions: Voter / Family / Caste / Booth
  const quickActions = [
    {
      label: "Voter Search",
      description: "",
      icon: <SearchRoundedIcon color="primary" />,
      action: () => navigate("/search"),
    },
    {
      label: "Family Search",
      description: "",
      icon: <QuizRoundedIcon color="primary" />,
      action: () => navigate("/family"),
    },
    {
      label: "Alphabatically",
      description: "",
      icon: <MapRoundedIcon color="primary" />,
      action: () => navigate("/alpha"),
    },
    {
      label: "Booth Search",
      description: "",
      icon: <SyncRoundedIcon color="primary" />,
      action: () => navigate("/booth"),
    },
  ];

  const collectionName = assignedName || "Unassigned collection";
  const userName = user?.username || user?.name || "User";
  const userRole = (user?.role || "").toUpperCase();
  const avatarUrl = user?.avatarUrl || user?.avatar || null;
  const bannerUrl =
    user?.bannerUrl || user?.coverUrl || user?.posterUrl || avatarUrl;

  const handleMenuOpen = (event) => setMenuAnchorEl(event.currentTarget);
  const handleMenuClose = () => setMenuAnchorEl(null);

  const logout = () => {
    handleMenuClose();
    lockSession();
    clearToken();
    navigate("/login", { replace: true });
  };

  return (
    <Box sx={{ minHeight: "100vh", pb: 4 }}>
      {/* Top navbar */}
      <TopNavbar
        userName={userName}
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

      <Container maxWidth="sm" sx={{ pt: 1, pb: 4 }}>
        <Stack spacing={3}>
          {/* Banner */}
          <Box
            sx={{
              borderRadius: 3,
              overflow: "hidden",
              boxShadow: 3,
            }}
          >
            {bannerUrl ? (
              <Box
                component="img"
                src={bannerUrl}
                alt={userName}
                sx={{
                  width: "100%",
                  display: "block",
                  objectFit: "cover",
                  maxHeight: 260,
                }}
              />
            ) : (
              <Box
                sx={{
                  background:
                    "linear-gradient(90deg,#f97316 0%,#f97316 45%,#16a34a 45%,#16a34a 100%)",
                  minHeight: 180,
                }}
              />
            )}
          </Box>

          {/* (chart + other content skipped – keep as you had or extend later) */}

          {/* Bottom three pastel blocks (+ Booth Search now makes it 4) */}
          <Grid container spacing={2}>
            {quickActions.map((action) => (
              <Grid item xs={4} key={action.label}>
                <Card
                  onClick={action.action}
                  sx={{
                    cursor: "pointer",
                    borderRadius: 4,
                    minHeight: 90,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: 2,
                    background: "linear-gradient(145deg, #f5f7ff, #ffffff)",
                  }}
                >
                  <CardContent
                    sx={{
                      p: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {action.icon}
                    <Typography
                      variant="caption"
                      sx={{ mt: 0.5, textAlign: "center" }}
                    >
                      {action.label}
                    </Typography>
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
