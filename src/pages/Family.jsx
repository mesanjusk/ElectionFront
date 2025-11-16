// client/src/pages/Family.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CallRoundedIcon from "@mui/icons-material/CallRounded";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";

import { setAuthToken } from "../services/api";
import { lockSession, getActiveDatabase, getUser, getAvailableDatabases } from "../auth";
import { db } from "../db/indexedDb";
import { pullAll, pushOutbox } from "../services/sync";
import VoiceSearchButton from "../components/VoiceSearchButton.jsx";
import PWAInstallPrompt from "../components/PWAInstallPrompt.jsx";
import TopNavbar from "../components/TopNavbar.jsx";

/* ---------------- helpers (same style as Search.jsx) ---------------- */
const pick = (obj, keys) => {
  if (!obj) return "";
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
};

const getName = (r) =>
  pick(r, ["Name", "name", "FullName"]) ||
  pick(r?.__raw, ["Name", "नाम", "पूर्ण नाव"]) ||
  "";

const getEPIC = (r) =>
  pick(r, ["EPIC", "Voter ID", "Voter Id", "Voter id", "VoterID", "VoterId"]) ||
  pick(r?.__raw, ["EPIC", "Epic", "Voter ID", "Voter Id", "voter_id", "कार्ड नं"]) ||
  "";

const getAge = (r) =>
  pick(r, ["Age", "age"]) || pick(r?.__raw, ["Age", "age", "वय"]) || "";

const getGender = (r) => {
  const g =
    pick(r, ["gender", "Gender"]) ||
    pick(r?.__raw, ["Gender", "gender", "लिंग"]) ||
    "";
  const s = String(g).toLowerCase();
  if (!s) return "";
  if (s.startsWith("m") || s.includes("पुरुष")) return "M";
  if (s.startsWith("f") || s.includes("स्त्री")) return "F";
  return s.toUpperCase();
};

const getHouseNo = (r) =>
  pick(r, ["House No", "House", "HouseNumber"]) ||
  pick(r?.__raw, ["घर क्रमांक", "घर क्र.", "House No", "House Number"]) ||
  "";

const getCareOf = (r) =>
  pick(r, ["CareOf", "careof", "C/O", "CO", "Father", "Husband"]) ||
  pick(r?.__raw, ["Father", "Husband", "Care Of", "C/O", "वडील", "पती"]) ||
  "";

const getMobile = (r) =>
  r?.mobile ||
  pick(r, ["Mobile", "mobile", "Phone"]) ||
  pick(r?.__raw, ["Mobile", "mobile", "Phone"]) ||
  "";

const getCaste = (r) =>
  pick(r, ["caste", "Caste"]) ||
  pick(r?.__raw, ["caste", "Caste", "जात"]) ||
  "";

/* Normalize phone for tel:/WhatsApp */
const normalizePhone = (raw) => {
  if (!raw) return "";
  let d = String(raw).replace(/[^\d]/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? d : "";
};

/* Simple transliteration: Devanagari to Latin (approx) – for surname search */
const DEV_TO_LATIN = {
  अ: "a",
  आ: "aa",
  इ: "i",
  ई: "ii",
  उ: "u",
  ऊ: "uu",
  ए: "e",
  ऐ: "ai",
  ओ: "o",
  औ: "au",
  क: "k",
  ख: "kh",
  ग: "g",
  घ: "gh",
  च: "ch",
  छ: "chh",
  ज: "j",
  झ: "jh",
  ट: "t",
  ठ: "th",
  ड: "d",
  ढ: "dh",
  त: "t",
  थ: "th",
  द: "d",
  ध: "dh",
  न: "n",
  प: "p",
  फ: "ph",
  ब: "b",
  भ: "bh",
  म: "m",
  य: "y",
  र: "r",
  ल: "l",
  व: "v",
  श: "sh",
  ष: "shh",
  स: "s",
  ह: "h",
};

const devToLatin = (s) => {
  if (!s) return "";
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    out += DEV_TO_LATIN[ch] || ch.toLowerCase();
  }
  return out;
};

/* Share text for WhatsApp (simple version for family modal) */
const buildShareText = (r, collectionName) => {
  const name = getName(r);
  const epic = getEPIC(r);
  const age = getAge(r);
  const gender = getGender(r);
  const house = getHouseNo(r);
  const co = getCareOf(r);
  const caste = getCaste(r) || "OPEN";
  const dbName = collectionName || "";

  const lines = [
    "Voter Details",
    `Name: ${name}`,
    `EPIC: ${epic || "—"}`,
    `Age: ${age || "—"}  Sex: ${gender || "—"}`,
    house ? `House: ${house}` : null,
    co ? `C/O: ${co}` : null,
    `Caste: ${caste}`,
    dbName ? `Database: ${dbName}` : null,
  ].filter(Boolean);
  return lines.join("\n");
};

/* Extract surname from full name (last word) */
const getSurname = (r) => {
  const name = getName(r);
  if (!name) return "";
  const clean = String(name).replace(/[.,]/g, " ").trim();
  if (!clean) return "";
  const parts = clean.split(/\s+/);
  return parts[parts.length - 1];
};

/* ---------------- Family detail modal (all voters for that surname) ---- */

function FamilyDetailModal({ open, family, onClose, collectionName }) {
  if (!open || !family) return null;
  const voters = family.voters || [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {family.surname} परिवार ({family.count} मतदाता)
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={0.75}>
          {voters.map((r) => {
            const name = getName(r);
            const epic = getEPIC(r);
            const age = getAge(r);
            const gender = getGender(r);
            const house = getHouseNo(r);
            const co = getCareOf(r);
            const mobRaw = getMobile(r);
            const mob = normalizePhone(mobRaw);
            const shareText = buildShareText(r, collectionName);
            const waHref = mob
              ? `https://wa.me/91${mob}?text=${encodeURIComponent(shareText)}`
              : `whatsapp://send?text=${encodeURIComponent(shareText)}`;

            return (
              <Paper
                key={r._id || `${family.surname}-${epic}`}
                sx={{
                  p: 0.6,
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.25,
                  borderRadius: 0.75,
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {name}
                  </Typography>
                  <Stack direction="row" spacing={0.25}>
                    <IconButton
                      size="small"
                      disabled={!mob}
                      component={mob ? "a" : "button"}
                      href={mob ? `tel:${mob}` : undefined}
                    >
                      <CallRoundedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      component="a"
                      href={waHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <WhatsAppIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  EPIC {epic || "—"} · Age {age || "—"} · {gender || "—"}
                </Typography>
                {(house || co) && (
                  <Typography variant="caption" color="text.secondary">
                    {house ? `House: ${house}` : ""}{" "}
                    {co ? `· C/O: ${co}` : ""}
                  </Typography>
                )}
              </Paper>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ================================== PAGE ================================== */
export default function Family() {
  // auth for server Pull/Push (same as Search page)
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (t) setAuthToken(t);
  }, []);

  const [userName, setUserName] = useState("User");
  const [collectionName, setCollectionName] = useState("");

  useEffect(() => {
    try {
      const authUser = getUser && getUser();
      if (authUser?.name) setUserName(authUser.name);
      else if (authUser?.username) setUserName(authUser.username);
    } catch {
      // ignore
    }
    try {
      const fromStorage =
        JSON.parse(window.localStorage.getItem("user") || "{}").name;
      if (fromStorage) setUserName(fromStorage);
    } catch {
      // ignore
    }
  }, []);

  const [activeDb, setActiveDbState] = useState(
    () => getActiveDatabase() || ""
  );

  useEffect(() => {
    const id = getActiveDatabase() || "";
    if (id && id !== activeDb) {
      setActiveDbState(id);
    }
    try {
      const dbs = getAvailableDatabases() || [];
      const found = dbs.find((d) => (d.id || d._id) === (id || activeDb));
      const label =
        found?.name ||
        found?.title ||
        found?.label ||
        (id || activeDb
          ? `Collection ${id || activeDb}`
          : "Unassigned collection");
      if (label) setCollectionName(label);
    } catch {
      // ignore
    }
  }, [activeDb]);

  const voiceLang = "hi-IN";
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);

  const [q, setQ] = useState(""); // surname search
  const [allRows, setAllRows] = useState([]);
  const [visibleCount, setVisibleCount] = useState(200);
  const [busy, setBusy] = useState(false);

  const [selectedFamily, setSelectedFamily] = useState(null);

  const sentinelRef = useRef(null);

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
  });

  const showSnack = (message) => {
    setSnackbar({ open: true, message });
  };

  const handleMenuOpen = (event) => setMenuAnchorEl(event.currentTarget);
  const handleMenuClose = () => setMenuAnchorEl(null);

  const logout = () => {
    handleMenuClose();
    lockSession();
    window.location.href = "/login";
  };

  const loadAll = useCallback(async () => {
    const arr = await db.voters.toArray();
    setAllRows(arr);
  }, []);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  // Group voters by surname
  const families = useMemo(() => {
    const map = new Map();

    for (const r of allRows) {
      const surname = getSurname(r);
      if (!surname) continue;

      let fam = map.get(surname);
      if (!fam) {
        fam = {
          surname,
          count: 0,
          voters: [],
          casteCounts: {},
        };
        map.set(surname, fam);
      }

      fam.count += 1;
      fam.voters.push(r);

      const caste = getCaste(r) || "OPEN";
      if (caste) {
        fam.casteCounts[caste] = (fam.casteCounts[caste] || 0) + 1;
      }
    }

    const list = [];
    for (const [, fam] of map.entries()) {
      const casteKeys = Object.keys(fam.casteCounts);
      let mainCaste = "OPEN";
      if (casteKeys.length === 1) {
        mainCaste = casteKeys[0];
      } else if (casteKeys.length > 1) {
        // pick most common caste for that surname
        casteKeys.sort(
          (a, b) => fam.casteCounts[b] - fam.casteCounts[a]
        );
        mainCaste = casteKeys[0];
      }
      list.push({
        surname: fam.surname,
        count: fam.count,
        caste: mainCaste,
        voters: fam.voters,
      });
    }

    // Sort families: larger groups first, then alphabetically
    list.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.surname.localeCompare(b.surname, "en-IN");
    });

    return list;
  }, [allRows]);

  // Search by surname only (supports Latin or Devanagari via devToLatin)
  const filteredFamilies = useMemo(() => {
    const term = q.trim();
    if (!term) return families;

    const lower = term.toLowerCase();
    const latinTerm = devToLatin(term);

    return families.filter((f) => {
      const s = String(f.surname || "").toLowerCase();
      const latinSurname = devToLatin(f.surname || "");
      return (
        s.includes(lower) ||
        latinSurname.includes(latinTerm.toLowerCase())
      );
    });
  }, [families, q]);

  const visible = filteredFamilies.slice(0, visibleCount);

  // infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setVisibleCount((v) => v + 200);
        }
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [filteredFamilies.length]);

  const onPull = async () => {
    setBusy(true);
    try {
      const id = getActiveDatabase();
      if (!id) {
        showSnack("No voter database is assigned to this device.");
      } else {
        const res = await pullAll({ databaseId: id });
        await loadAll();
        const pulled = res?.pulled ?? res?.count ?? res ?? null;
        if (pulled != null) {
          showSnack(`Pulled ${pulled.toLocaleString()} records from server.`);
        } else {
          showSnack("Pull completed.");
        }
      }
    } catch (e) {
      showSnack("Pull failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onPush = async () => {
    setBusy(true);
    try {
      const id = getActiveDatabase();
      if (!id) {
        showSnack("No voter database is assigned to this device.");
      } else {
        const res = await pushOutbox({ databaseId: id });
        const pushed = res?.pushed ?? res?.count ?? res?.synced ?? null;
        if (pushed != null) {
          showSnack(`Pushed ${pushed.toLocaleString()} record(s) to server.`);
        } else {
          showSnack("Push completed.");
        }
        await loadAll();
      }
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e.message ||
        "Push failed. Please try again.";
      console.error("Push error:", e?.response || e);
      showSnack(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: (theme) =>
          theme.palette.mode === "dark" ? "#020617" : "#f3f4f6",
      }}
    >
      <TopNavbar
        userName={userName}
        busy={busy}
        onMenuOpen={handleMenuOpen}
        onPull={onPull}
        onPush={onPush}
      />

      {/* Menu for logout + DB info */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
        keepMounted
      >
        <Box sx={{ px: 2, py: 1.5, width: 260 }}>
          <Typography variant="subtitle2" noWrap>
            {userName}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
            noWrap
          >
            Database: {collectionName || "Unassigned"}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<LogoutRoundedIcon />}
            sx={{ mt: 1.5 }}
            onClick={logout}
            fullWidth
            size="small"
          >
            Logout
          </Button>
        </Box>
      </Menu>

      {/* Sticky header: only surname search */}
      <Box
        sx={{
          position: "sticky",
          top: 56,
          zIndex: 20,
          bgcolor: "#f3f4f6",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          px: 1,
          py: 1,
          width: "100%",
        }}
      >
        <Container maxWidth="lg">
          <Stack spacing={0.75}>
            <TextField
              fullWidth
              size="medium"
              placeholder="उपनाम / Surname से परिवार खोजें..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <>
                      {q?.length > 0 && (
                        <IconButton
                          size="small"
                          onClick={() => setQ("")}
                          sx={{ mr: 0.5 }}
                        >
                          ✕
                        </IconButton>
                      )}
                      <VoiceSearchButton
                        onResult={(text) => setQ(text)}
                        lang={voiceLang}
                        disabled={busy}
                      />
                    </>
                  </InputAdornment>
                ),
              }}
              sx={{
                "& .MuiInputBase-root": {
                  backgroundColor: "white",
                },
              }}
            />

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ pl: 0.5 }}
            >
              Families {filteredFamilies.length.toLocaleString()} · Voters{" "}
              {allRows.length.toLocaleString()}
            </Typography>
          </Stack>
        </Container>
      </Box>

      {/* Family list */}
      <Container
        maxWidth="lg"
        sx={{
          pt: 1.5,
          pb: 10,
        }}
      >
        <Stack spacing={0.4}>
          {visible.map((fam) => (
            <Paper
              key={fam.surname}
              onClick={() => setSelectedFamily(fam)}
              sx={{
                p: 0.7,
                display: "flex",
                flexDirection: "column",
                gap: 0.15,
                borderRadius: 0.75,
                cursor: "pointer",
              }}
            >
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography
                  variant="subtitle1"
                  fontWeight={700}
                  sx={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: "primary.main",
                  }}
                >
                  {fam.surname}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 500 }}
                >
                  {fam.count.toLocaleString()} voters
                </Typography>
              </Stack>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.2 }}
              >
                Caste: {fam.caste || "OPEN"}
              </Typography>
            </Paper>
          ))}
          <Box ref={sentinelRef} sx={{ height: 32 }} />
        </Stack>
      </Container>

      {/* Family detail modal */}
      <FamilyDetailModal
        open={!!selectedFamily}
        family={selectedFamily}
        onClose={() => setSelectedFamily(null)}
        collectionName={collectionName}
      />

      {/* Fixed footer with family stats */}
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          bgcolor: "#e5e7eb",
          borderTop: "1px solid #d1d5db",
          py: 0.5,
          px: 2,
          zIndex: 30,
        }}
      >
        {filteredFamilies.length === 0 ? (
          <Typography
            color="text.secondary"
            variant="caption"
            textAlign="center"
          >
            No families found for this surname.
          </Typography>
        ) : (
          <Typography
            variant="caption"
            color="text.secondary"
            textAlign="center"
            sx={{ fontWeight: 500 }}
          >
            Families {filteredFamilies.length.toLocaleString()} · Voters{" "}
            {allRows.length.toLocaleString()}
          </Typography>
        )}
      </Box>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={(_, reason) => {
          if (reason === "clickaway") return;
          setSnackbar((s) => ({ ...s, open: false }));
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() =>
            setSnackbar((s) => ({
              ...s,
              open: false,
            }))
          }
          severity="info"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      <PWAInstallPrompt bottom={120} />
    </Box>
  );
}
