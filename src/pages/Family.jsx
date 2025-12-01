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

/* 🔹 Address getter (same as Search.jsx) */
const getAddress = (r) =>
  pick(r, ["Address", "address", "Address Line", "Address1"]) ||
  pick(r?.__raw, ["Address", "address", "पत्ता"]) ||
  "";

/* 🔹 Booth getter – same as Search.jsx */
const getBooth = (r) =>
  pick(r, ["Booth No", "booth", "Booth", "BoothNo"]) ||
  pick(r?.__raw, ["Booth No", "Booth", "booth", "BoothNo"]) ||
  "";

/* 🔹 Source serial – same logic as Search.jsx (from "Source File") */
const parseLastNumber = (s) => {
  const m = String(s || "").match(/\d+/g);
  if (!m) return NaN;
  const n = parseInt(m[m.length - 1], 10);
  return Number.isNaN(n) ? NaN : n;
};

const getSourceFile = (r) =>
  pick(r, ["Source File", "SourceFile", "sourceFile", "source_file"]) ||
  pick(r?.__raw, ["Source File", "SourceFile", "sourceFile", "source_file"]) ||
  "";

const getSourceSerial = (r) => {
  const sf = getSourceFile(r);
  if (!sf) return "";
  const n = parseLastNumber(sf);
  if (Number.isNaN(n)) return "";
  return String(n);
};

const getMobile = (r) =>
  r?.mobile ||
  pick(r, ["Mobile", "mobile", "Phone"]) ||
  pick(r?.__raw, ["Mobile", "mobile", "Phone"]) ||
  "";

const getCaste = (r) =>
  pick(r, ["caste", "Caste"]) ||
  pick(r?.__raw, ["caste", "Caste", "जात"]) ||
  "";

/* NEW: R/P/S helper – Roll/Part/Serial */
const getRPS = (r) =>
  pick(r, [
    "Roll/Part/Serial",
    "RollPartSerial",
    "Roll_Part_Serial",
    "RPS",
    "rps",
    "Status",
    "status",
  ]) ||
  pick(r?.__raw, [
    "Roll/Part/Serial",
    "RollPartSerial",
    "Roll_Part_Serial",
    "RPS",
    "rps",
    "Status",
    "status",
  ]) ||
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

/* Share text for WhatsApp – aligned with Search.jsx style */
const buildShareText = (r, collectionName) => {
  const name = getName(r);
  const epic = getEPIC(r);
  const rps = getRPS(r);
  const sourceSerial = getSourceSerial(r);
  const booth = getBooth(r);
  const addr = getAddress(r);
  const dbName = collectionName || "";

  const lines = [
    "Voter Details",
    `नाम: ${name || "—"}`,
    `${epic || "—"}`,
    rps ? `${rps}` : null,
    sourceSerial ? `Number: ${sourceSerial}` : null,
    booth ? `Booth: ${booth}` : null,
    addr ? `मतदान केंद्र: ${addr}` : null,
    // dbName && `Database: ${dbName}`,
  ].filter(Boolean);

  return lines.join("\n");
};

/* NEW: read surname directly from Surname column (preferred) */
const getSurnameFromColumn = (r) =>
  pick(r, ["Surname", "SURNAME", "Last Name", "LastName"]) ||
  pick(r?.__raw, ["Surname", "SURNAME", "उपनाम", "आडनाव"]) ||
  "";

/* Extract surname – NOW primarily from Surname column */
const getSurname = (r) => {
  // 1) Prefer explicit Surname column
  const col = getSurnameFromColumn(r);
  if (col) return String(col).replace(/[.,]/g, " ").trim();

  // 2) Fallback: FIRST word from full name
  const name = getName(r);
  if (!name) return "";
  const clean = String(name).replace(/[.,]/g, " ").trim();
  if (!clean) return "";
  const parts = clean.split(/\s+/);
  return parts[0];
};

/* Caste color tag style (currently only used if you add caste chips later) */
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

/* ---------------- Family detail modal (grouped by House + C/O) -------- */

function FamilyDetailModal({ open, family, onClose, collectionName }) {
  if (!open || !family) return null;
  const voters = family.voters || [];

  // Grouping by House No + Father (C/O)
  const groupsMap = new Map();
  for (const r of voters) {
    const house = getHouseNo(r) || "";
    const co = getCareOf(r) || "";
    const key = `${house}||${co}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        house,
        co,
        voters: [],
      });
    }
    groupsMap.get(key).voters.push(r);
  }

  const groups = Array.from(groupsMap.values());
  // Sort by house (optional)
  groups.sort((a, b) => {
    const ha = (a.house || "").toString();
    const hb = (b.house || "").toString();
    return ha.localeCompare(hb, "en-IN");
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {family.surname} परिवार ({family.count} मतदाता)
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1}>
          {groups.map((g, idx) => (
            <Paper
              key={`${g.house}-${g.co}-${idx}`}
              sx={{
                p: 0.7,
                borderRadius: 1,
                border: "1px solid #e5e7eb",
              }}
            >
              {/* Group header: House + C/O */}
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600 }}
              >
                {g.house ? `House: ${g.house}` : "House: —"}
                {g.co ? ` · C/O: ${g.co}` : ""}
              </Typography>

              <Stack spacing={0.4} sx={{ mt: 0.4 }}>
                {g.voters.map((r) => {
                  const name = getName(r);
                  const epic = getEPIC(r);
                  const age = getAge(r);
                  const gender = getGender(r);
                  const rps = getRPS(r);
                  const mobRaw = getMobile(r);
                  const mob = normalizePhone(mobRaw);
                  const addr = getAddress(r);
                  const booth = getBooth(r);
                  const sourceSerial = getSourceSerial(r);

                  const shareText = buildShareText(r, collectionName);
                  const waHref = mob
                    ? `https://wa.me/91${mob}?text=${encodeURIComponent(
                        shareText
                      )}`
                    : `whatsapp://send?text=${encodeURIComponent(shareText)}`;

                  return (
                    <Paper
                      key={r._id || `${family.surname}-${epic}`}
                      sx={{
                        p: 0.5,
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.2,
                        borderRadius: 0.75,
                        bgcolor: "#f9fafb",
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

                      {/* Line 1: EPIC / Age / Sex / RPS / Booth / Number */}
                      <Typography variant="caption" color="text.secondary">
                        EPIC {epic || "—"} · Age {age || "—"} ·{" "}
                        {gender || "—"} · R/P/S {rps || "—"}
                        {booth ? ` · Booth ${booth}` : ""}
                        {sourceSerial ? ` · No ${sourceSerial}` : ""}
                      </Typography>

                      {/* Line 2: Address */}
                      {addr && (
                        <Typography variant="caption" color="text.secondary">
                          Address: {addr}
                        </Typography>
                      )}
                    </Paper>
                  );
                })}
              </Stack>
            </Paper>
          ))}
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

  const [q, setQ] = useState(""); // surname search
  const [letterFilter, setLetterFilter] = useState("ALL"); // A–Z filter
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

  // Group voters by surname (from Surname column)
  const families = useMemo(() => {
    const map = new Map();

    for (const r of allRows) {
      const surnameRaw = getSurname(r); // now uses Surname column
      if (!surnameRaw) continue;

      // Normalize key so same surname groups together
      const surnameKey = surnameRaw.replace(/[.,]/g, " ").trim().toUpperCase();
      if (!surnameKey) continue;

      let fam = map.get(surnameKey);
      if (!fam) {
        fam = {
          surname: surnameRaw.replace(/[.,]/g, " ").trim(), // display value
          count: 0,
          voters: [],
          casteCounts: {},
        };
        map.set(surnameKey, fam);
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
        casteKeys.sort((a, b) => fam.casteCounts[b] - fam.casteCounts[a]);
        mainCaste = casteKeys[0];
      }

      const latin = devToLatin(fam.surname || "");
      const alphaSource = (latin || fam.surname || "").trim();
      const alphaKey = alphaSource ? alphaSource[0].toUpperCase() : "";

      list.push({
        surname: fam.surname,
        count: fam.count,
        caste: mainCaste,
        voters: fam.voters,
        alphaKey,
      });
    }

    // 🔹 Sort surname alphabetically
    list.sort((a, b) => a.surname.localeCompare(b.surname, "en-IN"));

    return list;
  }, [allRows]);

  // Search by surname + A–Z filter (surname from Surname column)
  const filteredFamilies = useMemo(() => {
    const term = q.trim();
    const letter = letterFilter;

    return families.filter((f) => {
      // A–Z filter
      if (letter !== "ALL" && f.alphaKey && f.alphaKey !== letter) {
        return false;
      }

      if (!term) return true;

      const lower = term.toLowerCase();
      const latinTerm = devToLatin(term);

      const surnameStr = String(f.surname || "");
      const s = surnameStr.toLowerCase();
      const latinSurname = devToLatin(surnameStr);

      return (
        s.includes(lower) ||
        latinSurname.toLowerCase().includes(latinTerm.toLowerCase())
      );
    });
  }, [families, q, letterFilter]);

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

      {/* Sticky header: surname search + A–Z filter bar */}
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
                onClick={() => setLetterFilter("ALL")}
                color={letterFilter === "ALL" ? "primary" : "default"}
                sx={{ height: 22 }}
              />
              {LETTERS.map((L) => (
                <Chip
                  key={L}
                  label={L}
                  size="small"
                  onClick={() => setLetterFilter(L)}
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
                borderRadius: 0.75,
                cursor: "pointer",
              }}
            >
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ width: "100%" }}
              >
                {/* LEFT: Surname */}
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

                {/* RIGHT: Count */}
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
                    {fam.count.toLocaleString()}
                  </Typography>
                </Stack>
              </Stack>
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
