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
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
  Chip,
} from "@mui/material";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CallRoundedIcon from "@mui/icons-material/CallRounded";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";

import { setAuthToken } from "../services/api";
import {
  lockSession,
  getActiveDatabase,
  getUser,
  getAvailableDatabases,
} from "../auth";
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

/* Simple transliteration: Devanagari to Latin (approx) – for surname search / A–Z */
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

/* Share text for WhatsApp (simple version for per-voter row) */
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

/* Extract surname from full name – FIRST word considered as surname */
const getSurname = (r) => {
  const name = getName(r);
  if (!name) return "";
  const clean = String(name).replace(/[.,]/g, " ").trim();
  if (!clean) return "";
  const parts = clean.split(/\s+/);
  return parts[0];
};

/* Caste color tag style */
const getCasteChipSx = (caste) => {
  const v = String(caste || "OPEN").toUpperCase();
  const base = {
    height: 20,
    borderRadius: "999px",
    fontSize: 11,
    px: 1,
  };

  if (v.includes("SC")) {
    return { ...base, bgcolor: "#fee2e2", color: "#b91c1c" };
  }
  if (v.includes("ST")) {
    return { ...base, bgcolor: "#dcfce7", color: "#166534" };
  }
  if (v.includes("OBC")) {
    return { ...base, bgcolor: "#ffedd5", color: "#9a3412" };
  }
  if (v.includes("OPEN")) {
    return { ...base, bgcolor: "#e0f2fe", color: "#075985" };
  }
  return { ...base, bgcolor: "#e5e7eb", color: "#111827" };
};

/* ================================== PAGE ================================== */
export default function Family() {
  // auth for server Pull/Push
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

  const [q, setQ] = useState(""); // surname / name search
  const [letterFilter, setLetterFilter] = useState("ALL"); // A–Z filter
  const [allRows, setAllRows] = useState([]);
  const [visibleCount, setVisibleCount] = useState(200);
  const [busy, setBusy] = useState(false);

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

  // Build per-surname stats, then flatten to voter list sorted alphabetically
  const votersList = useMemo(() => {
    const surnameStats = new Map();

    // 1) collect stats per surname
    for (const r of allRows) {
      const surname = getSurname(r) || "";
      if (!surname) continue;

      const caste = getCaste(r) || "OPEN";

      let stat = surnameStats.get(surname);
      if (!stat) {
        stat = { count: 0, casteCounts: {} };
        surnameStats.set(surname, stat);
      }
      stat.count += 1;
      stat.casteCounts[caste] = (stat.casteCounts[caste] || 0) + 1;
    }

    // 2) build per-voter list with surname + main caste + family count
    const list = allRows.map((r) => {
      const surname = getSurname(r) || "";
      const name = getName(r) || "";
      const epic = getEPIC(r) || "";
      const stat = surnameStats.get(surname);

      let mainCaste = getCaste(r) || "OPEN";
      let familyCount = stat?.count || 1;

      if (stat) {
        const casteKeys = Object.keys(stat.casteCounts);
        if (casteKeys.length === 1) {
          mainCaste = casteKeys[0];
        } else if (casteKeys.length > 1) {
          casteKeys.sort((a, b) => stat.casteCounts[b] - stat.casteCounts[a]);
          mainCaste = casteKeys[0];
        }
      }

      const latin = devToLatin(surname);
      const alphaSource = (latin || surname || "").trim();
      const alphaKey = alphaSource ? alphaSource[0].toUpperCase() : "";

      return {
        record: r,
        surname,
        name,
        epic,
        caste: mainCaste,
        familyCount,
        alphaKey,
      };
    });

    // 3) sort alphabetically: surname, then name
    list.sort((a, b) => {
      const sa = (a.surname || "").toString();
      const sb = (b.surname || "").toString();
      const cmpS = sa.localeCompare(sb, "en-IN");
      if (cmpS !== 0) return cmpS;
      const na = (a.name || "").toString();
      const nb = (b.name || "").toString();
      return na.localeCompare(nb, "en-IN");
    });

    return list;
  }, [allRows]);

  // Search + A–Z filter
  const filteredVoters = useMemo(() => {
    const term = q.trim();
    const letter = letterFilter;

    return votersList.filter((v) => {
      // A–Z filter on surname
      if (letter !== "ALL" && v.alphaKey && v.alphaKey !== letter) {
        return false;
      }

      if (!term) return true;

      const lower = term.toLowerCase();
      const latinTerm = devToLatin(term).toLowerCase();

      const surnameStr = String(v.surname || "");
      const nameStr = String(v.name || "");
      const epicStr = String(v.epic || "");

      const s = surnameStr.toLowerCase();
      const n = nameStr.toLowerCase();
      const e = epicStr.toLowerCase();

      const latinSurname = devToLatin(surnameStr).toLowerCase();

      return (
        s.includes(lower) ||
        n.includes(lower) ||
        e.includes(lower) ||
        latinSurname.includes(latinTerm)
      );
    });
  }, [votersList, q, letterFilter]);

  const visible = filteredVoters.slice(0, visibleCount);

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
  }, [filteredVoters.length]);

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

  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

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

      {/* Sticky header: search + A–Z filter bar */}
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
            {/* Search bar */}
            <TextField
              fullWidth
              size="medium"
              placeholder="उपनाम / Surname / Name / EPIC से मतदाता खोजें..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setVisibleCount(200);
              }}
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
                          onClick={() => {
                            setQ("");
                            setVisibleCount(200);
                          }}
                          sx={{ mr: 0.5 }}
                        >
                          ✕
                        </IconButton>
                      )}
                      <VoiceSearchButton
                        onResult={(text) => {
                          setQ(text);
                          setVisibleCount(200);
                        }}
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

            {/* A–Z filter bar */}
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                overflowX: "auto",
                pb: 0.25,
              }}
            >
              <Chip
                label="All"
                size="small"
                onClick={() => {
                  setLetterFilter("ALL");
                  setVisibleCount(200);
                }}
                color={letterFilter === "ALL" ? "primary" : "default"}
                sx={{ height: 22 }}
              />
              {LETTERS.map((L) => (
                <Chip
                  key={L}
                  label={L}
                  size="small"
                  onClick={() => {
                    setLetterFilter(L);
                    setVisibleCount(200);
                  }}
                  color={letterFilter === L ? "primary" : "default"}
                  sx={{ height: 22 }}
                />
              ))}
            </Stack>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ pl: 0.5 }}
            >
              Voters{" "}
              {filteredVoters.length.toLocaleString()} · Total{" "}
              {allRows.length.toLocaleString()}
            </Typography>
          </Stack>
        </Container>
      </Box>

      {/* Voter list (flattened, sorted alphabetically) */}
      <Container
        maxWidth="lg"
        sx={{
          pt: 1.5,
          pb: 10,
        }}
      >
        <Stack spacing={0.4}>
          {visible.map((v) => {
            const r = v.record;
            const name = v.name || getName(r);
            const epic = v.epic || getEPIC(r);
            const age = getAge(r);
            const gender = getGender(r);
            const mobRaw = getMobile(r);
            const mob = normalizePhone(mobRaw);
            const shareText = buildShareText(r, collectionName);
            const waHref = mob
              ? `https://wa.me/91${mob}?text=${encodeURIComponent(shareText)}`
              : `whatsapp://send?text=${encodeURIComponent(shareText)}`;

            return (
              <Paper
                key={r._id || `${v.surname}-${epic}`}
                sx={{
                  p: 0.7,
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: 0.75,
                  bgcolor: "#ffffff",
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ width: "100%" }}
                >
                  {/* LEFT: Name + surname */}
                  <Box sx={{ minWidth: 0 }}>
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
                      {name || "—"}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {v.surname ? `Surname: ${v.surname}` : "Surname: —"}
                    </Typography>
                  </Box>

                  {/* RIGHT: caste chip + family count */}
                  <Stack
                    direction="row"
                    spacing={0.75}
                    alignItems="center"
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 500 }}
                    >
                      {v.familyCount.toLocaleString()} परिवार / voters
                    </Typography>
                    <Chip
                      label={v.caste || "OPEN"}
                      size="small"
                      sx={getCasteChipSx(v.caste)}
                    />
                  </Stack>
                </Stack>

                {/* EPIC / Age / Gender */}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.3 }}
                >
                  EPIC {epic || "—"} · Age {age || "—"} · {gender || "—"}
                </Typography>

                {/* House / C/O if needed */}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.2 }}
                >
                  {getHouseNo(r)
                    ? `House: ${getHouseNo(r)}`
                    : "House: —"}{" "}
                  {getCareOf(r) ? `· C/O: ${getCareOf(r)}` : ""}
                </Typography>

                {/* Call + WhatsApp buttons */}
                <Stack
                  direction="row"
                  spacing={0.5}
                  justifyContent="flex-end"
                  sx={{ mt: 0.3 }}
                >
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
              </Paper>
            );
          })}
          <Box ref={sentinelRef} sx={{ height: 32 }} />
        </Stack>
      </Container>

      {/* Fixed footer with stats */}
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
        {filteredVoters.length === 0 ? (
          <Typography
            color="text.secondary"
            variant="caption"
            textAlign="center"
          >
            No voters found for this search.
          </Typography>
        ) : (
          <Typography
            variant="caption"
            color="text.secondary"
            textAlign="center"
            sx={{ fontWeight: 500 }}
          >
            Showing {filteredVoters.length.toLocaleString()} /{" "}
            {allRows.length.toLocaleString()} voters
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
