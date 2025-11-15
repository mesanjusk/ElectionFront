// client/src/pages/Search.jsx
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
  Card,
  CardContent,
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
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CallRoundedIcon from "@mui/icons-material/CallRounded";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";

import { setAuthToken } from "../services/api";
import {
  lockSession,
  getActiveDatabase,
  getUser,
  getAvailableDatabases,
} from "../auth";
import { db } from "../db/indexedDb";
import { pullAll, pushOutbox, updateVoterLocal } from "../services/sync";
import VoiceSearchButton from "../components/VoiceSearchButton.jsx";
import PWAInstallPrompt from "../components/PWAInstallPrompt.jsx";
import TopNavbar from "../components/TopNavbar.jsx";

/* ---------------- helpers (EN + MR + __raw fallbacks) ---------------- */
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
  pick(r, ["EPIC", "voter_id", "VoterID", "VoterId"]) ||
  pick(r?.__raw, ["EPIC", "Epic", "voter_id", "कार्ड नं"]) ||
  "";

const getPart = (r) =>
  pick(r, ["Part", "part", "Booth", "booth"]) ||
  pick(r?.__raw, ["Part", "Part No", "Booth", "भाग नं."]) ||
  "";

const getSerialText = (r) =>
  pick(r, [
    "Serial No",
    "serial",
    "Serial",
    "Sr No",
    "SrNo",
    "अनुक्रमांक",
    "अनु. क्र.",
  ]) ||
  pick(r?.__raw, [
    "Serial No",
    "Serial",
    "SrNo",
    "Sr No",
    "अनु क्र",
    "अनु. नं.",
    "अनुक्रमांक",
    "अनुक्रमांक नं.",
  ]) ||
  "";

const parseLastNumber = (s) => {
  const m = String(s || "").match(/\d+/g);
  if (!m) return NaN;
  const n = parseInt(m[m.length - 1], 10);
  return Number.isNaN(n) ? NaN : n;
};

/** Roll / Part / Serial mapping */
const getRPS = (r) =>
  pick(r, [
    "RPS",
    "RollPartSerial",
    "Roll/Part/Serial",
    "Roll / Part / Serial",
    "R/P/S",
    "Roll-Part-Serial",
    "Roll_Part_Serial",
  ]) || "";

/** Serial as number (for sorting) */
const getSerialNum = (r) => {
  const t = getSerialText(r);
  if (t) return parseLastNumber(t);
  const rps = getRPS(r);
  if (rps && /\d+\/\d+\/\d+/.test(rps)) {
    const last = rps.split("/").pop();
    return parseLastNumber(last);
  }
  return NaN;
};

const getHouseNo = (r) =>
  pick(r, ["House No", "House", "HouseNumber"]) ||
  pick(r?.__raw, ["घर क्रमांक", "घर क्र.", "House No", "House Number"]) ||
  "";

const getAge = (r) =>
  pick(r, ["Age", "age"]) || pick(r?.__raw, ["Age", "age", "वय"]) || "";

const getAgeNum = (r) => {
  const raw = getAge(r);
  const m = String(raw || "").match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isNaN(n) ? null : n;
};

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

const getCareOf = (r) =>
  pick(r, ["CareOf", "careof", "C/O", "CO", "Father", "Husband"]) ||
  pick(r?.__raw, [
    "Father",
    "Husband",
    "Care Of",
    "C/O",
    "वडील",
    "पती",
    "पुत्र",
    "पु...",
  ]) ||
  "";

/* Mobile – stored in our local DB */
const getMobile = (r) =>
  r?.mobile ||
  pick(r, ["Mobile", "mobile", "Phone"]) ||
  pick(r?.__raw, ["Mobile", "mobile", "Phone"]) ||
  "";

/* Image URL – used in WhatsApp share text */
const getPhotoUrl = (r) =>
  pick(r, [
    "photoUrl",
    "photo",
    "Photo",
    "image",
    "Image",
    "img",
    "Img",
    "avatar",
    "Avatar",
  ]) ||
  pick(r?.__raw, ["photoUrl", "photo", "Photo", "image", "Image", "img"]) ||
  "";

// NEW: caste / political interest / volunteer getters
const getCaste = (r) =>
  pick(r, ["caste", "Caste"]) ||
  pick(r?.__raw, ["caste", "Caste", "जात"]) ||
  "";

const getPoliticalInterest = (r) =>
  pick(r, ["politicalInterest", "PoliticalInterest", "interest"]) ||
  pick(r?.__raw, ["politicalInterest", "PoliticalInterest", "interest"]) ||
  "";

const getVolunteer = (r) =>
  pick(r, ["volunteer", "Volunteer", "assignedVolunteer"]) ||
  pick(r?.__raw, ["volunteer", "Volunteer", "assignedVolunteer"]) ||
  "";

/* Normalize phone for tel:/WhatsApp */
const normalizePhone = (raw) => {
  if (!raw) return "";
  let d = String(raw).replace(/[^\d]/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? d : "";
};

/* Simple transliteration: Devanagari to Latin (approx) – for text search */
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

/* Share text for WhatsApp – includes photo, caste, interest, volunteer, DB */
const buildShareText = (r, collectionName) => {
  const name = getName(r);
  const epic = getEPIC(r); // EPIC = Voter ID
  const part = getPart(r);
  const serial = getSerialNum(r);
  const rps = getRPS(r);
  const age = getAge(r);
  const gender = getGender(r);
  const house = getHouseNo(r);
  const co = getCareOf(r);
  const photo = getPhotoUrl(r);

  const caste = getCaste(r) || "OPEN";
  const interest = getPoliticalInterest(r) || "—";
  const volunteer = getVolunteer(r) || "";
  const dbName = collectionName || "";

  const lines = [
    "Voter Details",
    `Name: ${name}`,
    `EPIC: ${epic}`,
    `Part: ${part || "—"}  Serial: ${!Number.isNaN(serial) ? serial : "—"
    }`,
    rps ? `R/P/S: ${rps}` : null,
    `Age: ${age || "—"}  Sex: ${gender || "—"}`,
    house ? `House: ${house}` : null,
    co ? `C/O: ${co}` : null,
    `Caste: ${caste}`,
    `Political interest: ${interest}`,
    volunteer ? `Volunteer: ${volunteer}` : null,
    dbName ? `Database: ${dbName}` : null,
    photo ? `Photo: ${photo}` : null, // image URL
  ].filter(Boolean);
  return lines.join("\n");
};

/* ---------------- Small mobile edit modal (local + push) --------------- */

const CASTE_OPTIONS = ["OPEN", "OBC", "SC", "ST", "NT", "VJ", "SBC"];

const INTEREST_OPTIONS = [
  "Pro ruling party",
  "Pro opposition",
  "Neutral",
  "Non voter",
];

function MobileEditModal({ open, voter, onClose, onSynced }) {
  const [mobile, setMobile] = useState(getMobile(voter));

  useEffect(() => {
    setMobile(getMobile(voter));
  }, [voter]);

  if (!open || !voter) return null;

  const handleSave = async () => {
    const n = normalizePhone(mobile);
    if (!n) {
      alert("Enter a valid 10-digit mobile.");
      return;
    }

    // 1) Save locally
    await updateVoterLocal(voter._id, { mobile: n });

    // 2) Immediately push to server for active DB
    let msg = "Mobile saved locally.";
    try {
      const dbId = getActiveDatabase && getActiveDatabase();
      if (dbId) {
        const res = await pushOutbox({ databaseId: dbId });
        const pushed =
          res?.pushed ?? res?.count ?? res?.synced ?? null;
        if (pushed != null) {
          msg = `Saved & pushed ${pushed} change(s) to server.`;
        } else {
          msg = "Saved & sync triggered.";
        }
      } else {
        msg = "Saved locally. No active database assigned.";
      }
    } catch (e) {
      msg = "Saved locally. Sync failed, will retry from Push.";
    }

    if (onSynced) onSynced(msg);
    onClose(true);
  };

  return (
    <Dialog open={open} onClose={() => onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>Mobile number</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="subtitle1" fontWeight={600}>
            {getName(voter)}
          </Typography>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography variant="caption" color="text.secondary">
              EPIC
            </Typography>
            <Typography fontFamily="monospace">
              {getEPIC(voter)}
            </Typography>
          </Stack>
          <TextField
            label="Mobile number"
            value={mobile || ""}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="10-digit mobile"
            inputProps={{ inputMode: "numeric", maxLength: 10 }}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save & Sync
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ---------------- Voter tags (caste / interest / volunteer) ----------- */

function VoterTagsModal({ open, voter, onClose }) {
  const [caste, setCaste] = useState(getCaste(voter) || "OPEN");
  const [interest, setInterest] = useState(getPoliticalInterest(voter) || "");
  const [volunteer, setVolunteer] = useState(getVolunteer(voter) || "");

  useEffect(() => {
    if (voter) {
      setCaste(getCaste(voter) || "OPEN");
      setInterest(getPoliticalInterest(voter) || "");
      setVolunteer(getVolunteer(voter) || "");
    }
  }, [voter]);

  if (!open || !voter) return null;

  const handleSave = async () => {
    await updateVoterLocal(voter._id, {
      caste: caste || "OPEN",
      politicalInterest: interest || "",
      volunteer: volunteer || "",
    });
    onClose(true);
  };

  return (
    <Dialog open={open} onClose={() => onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>Voter tags</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {getName(voter)}
          </Typography>

          <TextField
            select
            label="Caste"
            value={caste}
            onChange={(e) => setCaste(e.target.value)}
            fullWidth
          >
            {CASTE_OPTIONS.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Political interest"
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
            fullWidth
          >
            {INTEREST_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Volunteer"
            value={volunteer}
            onChange={(e) => setVolunteer(e.target.value)}
            placeholder="Volunteer / party worker name"
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save tags
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ---------------- Full Record Details modal ---------------- */
function RecordModal({ open, voter, onClose, collectionName }) {
  if (!open || !voter) return null;
  const fields = [
    ["Name", getName(voter)],
    ["EPIC", getEPIC(voter)],
    ["R/P/S", getRPS(voter) || "—"],
    ["Age", getAge(voter) || "—"],
    ["Sex", getGender(voter) || "—"],
  ];
  const shareText = buildShareText(voter, collectionName);

  const mob = getMobile(voter);
  const waUrl = mob
    ? `https://wa.me/91${mob}?text=${encodeURIComponent(shareText)}`
    : `whatsapp://send?text=${encodeURIComponent(shareText)}`;

  return (
    <Dialog open={open} onClose={() => onClose(false)} fullWidth maxWidth="sm">
      <DialogTitle>Record details</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {fields.map(([k, v]) => (
            <Stack
              key={k}
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Typography variant="caption" color="text.secondary">
                {k}
              </Typography>
              <Typography fontWeight={600}>{String(v)}</Typography>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          href={waUrl}
          target="_blank"
          rel="noreferrer"
          variant="contained"
          startIcon={<WhatsAppIcon />}
        >
          Share on WhatsApp
        </Button>
        <Button onClick={() => onClose(false)} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ================================== PAGE ================================== */
export default function Search() {
  // auth for server Pull/Push
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (t) setAuthToken(t);
  }, []);

  // username and collection
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

  const voiceLang = "hi-IN"; // Hindi voice search (for button)
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);

  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all"); // all | male | female
  const [ageBand, setAgeBand] = useState("all");
  const [allRows, setAllRows] = useState([]);
  const [visibleCount, setVisibleCount] = useState(200);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState(null);
  const [tagsVoter, setTagsVoter] = useState(null);
  const [detail, setDetail] = useState(null);
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
    arr.sort((a, b) => {
      const sa = getSerialNum(a);
      const sb = getSerialNum(b);
      if (!Number.isNaN(sa) && !Number.isNaN(sb)) return sa - sb;
      return 0;
    });
    setAllRows(arr);
  }, []);

  useEffect(() => {
    loadAll().catch(() => { });
  }, [loadAll]);

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
  }, [allRows.length]);

  // filters + search
  const filtered = useMemo(() => {
    const term = q.trim();
    const lt = term ? devToLatin(term) : "";

    return allRows.filter((r) => {
      // gender filter
      const g = getGender(r);
      if (tab === "male" && g !== "M") return false;
      if (tab === "female" && g !== "F") return false;

      // age band filter
      const ageNum = getAgeNum(r);
      if (ageBand === "18-25" && !(ageNum >= 18 && ageNum <= 25)) return false;
      if (ageBand === "26-35" && !(ageNum >= 26 && ageNum <= 35)) return false;
      if (ageBand === "36-50" && !(ageNum >= 36 && ageNum <= 50)) return false;
      if (ageBand === "51+" && !(ageNum >= 51)) return false;

      if (!term) return true;

      const fields = [
        getName(r),
        getEPIC(r),
        getPart(r),
        getSerialText(r),
        getHouseNo(r),
        getCareOf(r),
        getMobile(r),
      ];

      const hay = fields
        .filter(Boolean)
        .map((x) => String(x).toLowerCase())
        .join(" ");

      if (hay.includes(term.toLowerCase())) return true;

      const devHay = devToLatin(hay);
      return devHay.includes(lt);
    });
  }, [allRows, q, tab, ageBand]);

  const { male, female, total } = useMemo(() => {
    let maleCount = 0;
    let femaleCount = 0;
    for (const row of filtered) {
      const g = getGender(row);
      if (g === "M") maleCount += 1;
      if (g === "F") femaleCount += 1;
    }
    return { male: maleCount, female: femaleCount, total: filtered.length };
  }, [filtered]);

  const onPull = async () => {
    setBusy(true);
    try {
      const id = getActiveDatabase();
      if (!id) {
        showSnack("No voter database is assigned to this device.");
      } else {
        const res = await pullAll({ databaseId: id });
        await loadAll();
        const pulled = res?.pulled ?? res?.count ?? res?.synced ?? null;
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


  const filterTabs = [
    { key: "all", label: "All" },
    { key: "male", label: "Male" },
    { key: "female", label: "Female" },
  ];

  const visible = filtered.slice(0, visibleCount);

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

      {/* Menu for logout and DB info */}
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

      {/* Results */}
      <Container
        maxWidth="lg"
        sx={{
          pt: 1.5,
          pb: 10,
        }}
      >
        <Stack spacing={1.0}>
          {/* Stats + filters */}
          <Box
            sx={{
              borderRadius: 0,
              position: "sticky",
              top: 40,                 // adjust based on navbar height
              zIndex: 20,
              bgcolor: "#2E2E2E",      // dark grey background
              color: "white",          // text turns white for contrast
              pb: 1,
              pt: 1,
              px: 1.5,
              width: "100%",
              display: "flex",
              justifyContent: "center",   // center horizontally
              alignItems: "center",       // center vertically
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)", // soft shadow
            }}
          >
            <Stack
              spacing={1}
              sx={{
                width: "100%",          // makes inner content full width
                maxWidth: 600,          // centers nicely like mobile apps
                mx: "auto",             // auto-center stack
              }}
            >
              {/* Search box */}
              <TextField
                id="searchBoxHindi"
                fullWidth
                size="medium"
                placeholder="नाम, EPIC, घर, मोबाइल से खोजें..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" htmlColor="white" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <VoiceSearchButton
                        onResult={(text) => setQ(text)}
                        lang={voiceLang}
                        disabled={busy}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  "& .MuiInputBase-root": {
                    backgroundColor: "#444",      // input darker
                    color: "white",
                  },
                  "& .MuiInputBase-input::placeholder": {
                    color: "#ccc",
                  },
                }}
              />

              {/* Tabs */}
              <Tabs
                value={tab}
                onChange={(_, value) => setTab(value)}
                variant="scrollable"
                allowScrollButtonsMobile
                sx={{
                  minHeight: 32,
                  "& .MuiTab-root": {
                    minHeight: 32,
                    paddingY: 0,
                    fontSize: 13,
                    color: "#ddd",
                  },
                  "& .Mui-selected": {
                    color: "white !important",
                  },
                  "& .MuiTabs-indicator": {
                    backgroundColor: "white",
                  },
                }}
              >
                {filterTabs.map((filter) => (
                  <Tab key={filter.key} label={filter.label} value={filter.key} />
                ))}
              </Tabs>

              {/* Age Filter */}
              <ToggleButtonGroup
                value={ageBand}
                exclusive
                onChange={(_, val) => val && setAgeBand(val)}
                size="small"
                sx={{
                  flexWrap: "wrap",
                  "& .MuiToggleButton-root": {
                    color: "white",
                    borderColor: "#777",
                  },
                  "& .Mui-selected": {
                    backgroundColor: "#555 !important",
                    color: "white !important",
                  },
                }}
              >
                <ToggleButton value="all">All</ToggleButton>
                <ToggleButton value="18-25">18–25</ToggleButton>
                <ToggleButton value="26-35">26–35</ToggleButton>
                <ToggleButton value="36-50">36–50</ToggleButton>
                <ToggleButton value="51+">51+</ToggleButton>
              </ToggleButtonGroup>

              {/* Stats */}
              {visible.length === 0 ? (
                <Typography color="#ddd" variant="caption" textAlign="center">
                  No voters match your filters yet.
                </Typography>
              ) : (
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 500, color: "#ddd", textAlign: "center" }}
                >
                  M {male.toLocaleString()} · F {female.toLocaleString()} · Total{" "}
                  {total.toLocaleString()} · Synced {allRows.length.toLocaleString()}
                </Typography>
              )}
            </Stack>
          </Box>


          {/* Search box */}

          <Stack spacing={1}>

          </Stack>


          {/* Voter list */}
          <Stack spacing={0.75}>
            {visible.map((r, i) => {
              const name = getName(r);
              const serialTxt = getSerialText(r);
              const serialNum = getSerialNum(r);
              const age = getAge(r);
              const gender = getGender(r);
              const mobRaw = getMobile(r);
              const mob = normalizePhone(mobRaw);
              const shareText = buildShareText(r, collectionName);
              const waHref = mob
                ? `https://wa.me/91${mob}?text=${encodeURIComponent(
                  shareText
                )}`
                : `whatsapp://send?text=${encodeURIComponent(shareText)}`;

              const serialDisplay = !Number.isNaN(serialNum)
                ? serialNum
                : serialTxt || "—";

              return (
                <Paper
                  key={r._id || `${i}-${serialTxt}`}
                  sx={{
                    p: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 0.2,
                    borderRadius: 1,
                  }}
                >
                  {/* Row 1: Serial · Age · Sex + + button */}
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    justifyContent="space-between"
                    flexWrap="wrap"
                  >
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      <Typography variant="caption" color="text.secondary">
                        Serial {serialDisplay}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        · Age {age || "—"} · {gender || "—"}
                      </Typography>
                    </Stack>

                    <IconButton
                      size="small"
                      onClick={() => setTagsVoter(r)}
                      sx={{ ml: 1 }}
                    >
                      <AddRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>

                  {/* Row 2: Name + Call + WhatsApp + Edit (Merged Row 3 inside Row 2) */}
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ width: "100%" }}
                  >
                    {/* Name */}
                    <Typography
                      variant="subtitle2"
                      fontWeight={600}
                      sx={{
                        cursor: "pointer",
                        textDecoration: "none",
                        "&:hover": { textDecoration: "underline" },
                        flex: 1,
                        pr: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      onClick={() => setDetail(r)}
                    >
                      {name}
                    </Typography>

                    {/* Actions */}
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<CallRoundedIcon />}
                        disabled={!mob}
                        component={mob ? "a" : "button"}
                        href={mob ? `tel:${mob}` : undefined}
                        sx={{ minWidth: "24px", px: 1 }}
                      />

                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<WhatsAppIcon />}
                        component="a"
                        href={waHref}
                        target="_blank"
                        rel="noreferrer"
                        sx={{ minWidth: "24px", px: 1 }}
                      />

                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => setSelected(r)}
                      >
                        <EditRoundedIcon />
                      </IconButton>
                    </Stack>
                  </Stack>
                </Paper>

              );
            })}
            <Box ref={sentinelRef} sx={{ height: 32 }} />
          </Stack>
        </Stack>
      </Container>

      <MobileEditModal
        open={!!selected}
        voter={selected}
        onClose={async (ok) => {
          setSelected(null);
          if (ok) await loadAll();
        }}
        onSynced={showSnack}
      />
      <VoterTagsModal
        open={!!tagsVoter}
        voter={tagsVoter}
        onClose={async (ok) => {
          setTagsVoter(null);
          if (ok) await loadAll();
        }}
      />
      <RecordModal
        open={!!detail}
        voter={detail}
        onClose={() => setDetail(null)}
        collectionName={collectionName}
      />

      {/* Sync + info messages */}
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
