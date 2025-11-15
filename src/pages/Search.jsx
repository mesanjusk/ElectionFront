// client/src/pages/Search.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
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
  clearToken,
  getUser,
  getAvailableDatabases,
  getActiveDatabase,
  setActiveDatabase,
} from "../auth";
import { pullAll, pushOutbox } from "../services/sync";
import { loadLocalData, updateVoterLocal } from "../services/localDb";
import PWAInstallPrompt from "../components/PWAInstallPrompt";
import VoiceSearchButton from "../components/VoiceSearchButton";
import TopNavbar from "../components/TopNavbar";

/* ---------------- Helper pick ---------------- */
function pick(obj, keys, fallback = "") {
  if (!obj) return fallback;
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== "") return obj[k];
  }
  return fallback;
}

/* ---------------- Field getters ---------------- */
const getName = (r) =>
  pick(r, ["name", "Name"]) ||
  pick(r?.__raw, ["name", "Name"]) ||
  "—";

const getEPIC = (r) =>
  pick(r, ["epic", "EPIC", "epic_no", "epicNo", "Epic"]) ||
  pick(r?.__raw, ["epic", "EPIC", "epic_no", "epicNo", "Epic"]) ||
  "—";

const getMobile = (r) =>
  pick(r, ["mobile", "Mobile", "phone", "Phone"]) ||
  pick(r?.__raw, ["mobile", "Mobile", "phone", "Phone"]) ||
  "";

const getAge = (r) =>
  pick(r, ["age", "Age"]) || pick(r?.__raw, ["age", "Age"]) || "";

const getAgeNum = (r) => {
  const a = getAge(r);
  const n = Number(a);
  return Number.isNaN(n) ? null : n;
};

const getGender = (r) =>
  pick(r, ["gender", "Gender", "sex", "Sex"]) ||
  pick(r?.__raw, ["gender", "Gender", "sex", "Sex"]) ||
  "";

const getPart = (r) =>
  pick(r, ["part", "Part", "part_no", "partNo"]) ||
  pick(r?.__raw, ["part", "Part", "part_no", "partNo"]) ||
  "";

const getSerialText = (r) =>
  pick(r, ["serial", "Serial", "serial_no", "serialNo"]) ||
  pick(r?.__raw, ["serial", "Serial", "serial_no", "serialNo"]) ||
  "";

const getSerialNum = (r) => {
  const s = getSerialText(r);
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
};

const getRPS = (r) =>
  pick(r, ["rps", "RPS"]) || pick(r?.__raw, ["rps", "RPS"]) || "";

const getHouseNo = (r) =>
  pick(r, ["house", "House", "houseNo", "house_no"]) ||
  pick(r?.__raw, ["house", "House", "houseNo", "house_no"]) ||
  "";

const getCareOf = (r) =>
  pick(r, ["careOf", "CareOf", "c/o", "co"]) ||
  pick(r?.__raw, ["careOf", "CareOf", "c/o", "co"]) ||
  "";

// cloudinary config
const CLOUDINARY_CLOUD_NAME =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "";
const CLOUDINARY_BASE_URL = CLOUDINARY_CLOUD_NAME
  ? `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/`
  : "";

const getPhotoUrl = (r) => {
  const raw = r?.photo || r?.photoUrl || r?.photo_url || r?.image;
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (CLOUDINARY_BASE_URL) return CLOUDINARY_BASE_URL + raw;
  return raw;
};

const getCaste = (r) =>
  pick(r, ["caste", "Caste"]) ||
  pick(r?.__raw, ["caste", "Caste"]) ||
  "";

const getPoliticalInterest = (r) =>
  pick(r, ["politicalInterest", "PoliticalInterest", "interest"]) ||
  pick(r?.__raw, ["politicalInterest", "PoliticalInterest", "interest"]) ||
  "";

const getVolunteer = (r) =>
  pick(r, ["volunteer", "Volunteer", "assignedVolunteer"]) ||
  pick(r?.__raw, ["volunteer", "Volunteer", "assignedVolunteer"]) ||
  "";

const CASTE_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "SC", label: "SC" },
  { value: "ST", label: "ST" },
  { value: "OBC", label: "OBC" },
  { value: "NT", label: "NT / VJNT" },
  { value: "OTHER", label: "Other" },
];

const INTEREST_OPTIONS = [
  { value: "OUR", label: "Our supporter" },
  { value: "OPPOSITION", label: "Opposition" },
  { value: "SWING", label: "Swing / Neutral" },
];

/* Normalize mobile */
const normalizePhone = (mob) => {
  if (!mob) return "";
  const digits = String(mob).replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

const buildShareText = (r, collectionName) => {
  const name = getName(r);
  const epic = getEPIC(r);
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
    `Part: ${part || "—"}  Serial: ${
      !Number.isNaN(serial) ? serial : "—"
    }`,
    rps ? `R/P/S: ${rps}` : null,
    `Age: ${age || "—"}  Sex: ${gender || "—"}`,
    house ? `House: ${house}` : null,
    co ? `C/O: ${co}` : null,
    `Caste: ${caste}`,
    `Political interest: ${interest}`,
    volunteer ? `Volunteer: ${volunteer}` : null,
    dbName ? `Database: ${dbName}` : null,
    photo ? `Photo: ${photo}` : null, // 👈 image URL included for WhatsApp
  ].filter(Boolean);
  return lines.join("\n");
};

/* ---------------- Caste / interest / volunteer modal ---------------- */
function VoterTagsModal({ open, voter, onClose }) {
  const [caste, setCaste] = useState("");
  const [interest, setInterest] = useState("");
  const [volunteer, setVolunteer] = useState("");

  useEffect(() => {
    if (!voter) return;
    setCaste(getCaste(voter) || "OPEN");
    setInterest(getPoliticalInterest(voter) || "");
    setVolunteer(getVolunteer(voter) || "");
  }, [voter]);

  if (!open || !voter) return null;

  const handleSave = async () => {
    const payload = {
      caste: caste || "OPEN",
      politicalInterest: interest || "",
      volunteer: volunteer || "",
    };
    await updateVoterLocal(voter._id, payload);
    onClose(true);
  };

  return (
    <Dialog open={open} onClose={() => onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>Assign caste / interest / volunteer</DialogTitle>
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
            {CASTE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
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
            <MenuItem value="">Not set</MenuItem>
            {INTEREST_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Volunteer (name or code)"
            value={volunteer}
            onChange={(e) => setVolunteer(e.target.value)}
            fullWidth
            placeholder="e.g. Rahul 01"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ---------------- Small mobile edit modal (local only) ---------------- */
function MobileEditModal({ open, voter, onClose }) {
  const [form, setForm] = useState(() => ({
    name: "",
    mobile: "",
    house: "",
  }));

  useEffect(() => {
    if (!voter) return;
    setForm({
      name: getName(voter),
      mobile: getMobile(voter),
      house: getHouseNo(voter),
    });
  }, [voter]);

  if (!open || !voter) return null;

  const handleChange = (field, value) => {
    setForm((old) => ({ ...old, [field]: value }));
  };

  const handleSave = async () => {
    await updateVoterLocal(voter._id, {
      name: form.name,
      mobile: form.mobile,
      house: form.house,
    });
    onClose(true);
  };

  return (
    <Dialog open={open} onClose={() => onClose(false)} fullWidth maxWidth="sm">
      <DialogTitle>Edit voter</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            fullWidth
          />
          <TextField
            label="Mobile"
            value={form.mobile}
            onChange={(e) => handleChange("mobile", e.target.value)}
            fullWidth
          />
          <TextField
            label="House"
            value={form.house}
            onChange={(e) => handleChange("house", e.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ---------------- Record modal with share ---------------- */
function RecordModal({ open, voter, onClose, collectionName }) {
  if (!open || !voter) return null;
  const fields = [
    ["Name", getName(voter)],
    ["EPIC", getEPIC(voter)],
    ["R/P/S", getRPS(voter) || "—"],
    ["Part", getPart(voter) || "—"],
    [
      "Serial",
      !Number.isNaN(getSerialNum(voter))
        ? getSerialNum(voter)
        : getSerialText(voter) || "—",
    ],
    ["Age / Sex", `${getAge(voter) || "—"} / ${getGender(voter) || "—"}`],
    ["House", getHouseNo(voter) || "—"],
    ["C/O", getCareOf(voter) || "—"],
    ["Mobile", getMobile(voter) || "—"],
    ["Caste", getCaste(voter) || "OPEN"],
    ["Political interest", getPoliticalInterest(voter) || "—"],
    ["Volunteer", getVolunteer(voter) || "—"],
    ["Database", collectionName || "—"],
    ["Photo", getPhotoUrl(voter) || "—"],
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
              spacing={2}
            >
              <Typography variant="body2" color="text.secondary">
                {k}
              </Typography>
              <Typography
                variant="body2"
                sx={{ textAlign: "right", wordBreak: "break-word" }}
              >
                {v}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
        <Button
          component="a"
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
      const fromStorage =
        window.localStorage.getItem("userName") ||
        window.localStorage.getItem("name") ||
        (authUser && (authUser.username || authUser.name)) ||
        JSON.parse(window.localStorage.getItem("user") || "{}").name;
      if (fromStorage) setUserName(fromStorage);
    } catch {
      // ignore
    }
  }, []);

  const [activeDb, setActiveDbState] = useState(() => getActiveDatabase() || "");
  useEffect(() => {
    const id = getActiveDatabase() || "";
    if (id && id !== activeDb) {
      setActiveDbState(id);
    }
    try {
      const dbs = getAvailableDatabases ? getAvailableDatabases() : [];
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

  const voiceLang = "hi-IN"; // Hindi voice search
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);

  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all"); // all | male | female
  const [ageBand, setAgeBand] = useState("all");
  const [allRows, setAllRows] = useState([]);
  const [visibleCount, setVisibleCount] = useState(200);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tagsVoter, setTagsVoter] = useState(null);
  const sentinelRef = useRef(null);

  const handleMenuOpen = (event) => {
    setMenuAnchorEl(event.currentTarget);
  };
  const handleMenuClose = () => setMenuAnchorEl(null);

  const logout = () => {
    lockSession();
    clearToken();
    window.location.href = "/";
  };

  const loadAll = useCallback(async () => {
    setBusy(true);
    try {
      const rows = await loadLocalData();
      setAllRows(rows || []);
      setVisibleCount(200);
    } catch (e) {
      console.error(e);
      setAllRows([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handlePull = async () => {
    const id = getActiveDatabase();
    if (!id) {
      alert("No database selected.");
      return;
    }
    if (id !== activeDb) {
      setActiveDatabase(id);
      setActiveDbState(id);
    }
    setBusy(true);
    try {
      const c = await pullAll({ databaseId: id });
      alert(`Pulled ${c} changes from server.`);
      await loadAll();
    } catch (e) {
      alert("Pull failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const handlePush = async () => {
    const id = getActiveDatabase();
    if (!id) {
      alert("No database selected.");
      return;
    }
    if (id !== activeDb) {
      setActiveDatabase(id);
      setActiveDbState(id);
    }
    setBusy(true);
    try {
      const c = await pushOutbox({ databaseId: id });
      alert(`Pushed ${c} local changes to server.`);
    } catch (e) {
      alert("Push failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  // transliteration for search if needed
  const transliterate = (text) => text; // stub for now

  // Combined filter: text + tab + age band
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const termTrans = transliterate(term);

    const inAgeBand = (r) => {
      if (ageBand === "all") return true;
      const a = getAgeNum(r);
      if (a == null) return false;
      if (ageBand === "18-30") return a >= 18 && a <= 30;
      if (ageBand === "30-45") return a >= 30 && a <= 45;
      if (ageBand === "45-60") return a >= 45 && a <= 60;
      if (ageBand === "60+") return a >= 61;
      return true;
    };

    const inGenderTab = (r) => {
      const g = (getGender(r) || "").toUpperCase();
      if (tab === "all") return true;
      if (tab === "male") return g === "M";
      if (tab === "female") return g === "F";
      return true;
    };

    if (!term) {
      return allRows.filter((r) => inGenderTab(r) && inAgeBand(r));
    }

    const matches = (r) => {
      const name = getName(r).toLowerCase();
      const epic = getEPIC(r).toLowerCase();
      const mob = (getMobile(r) || "").toLowerCase();
      const house = (getHouseNo(r) || "").toLowerCase();
      return (
        name.includes(term) ||
        name.includes(termTrans) ||
        epic.includes(term) ||
        mob.includes(term) ||
        house.includes(term)
      );
    };

    return allRows.filter(
      (r) => matches(r) && inGenderTab(r) && inAgeBand(r)
    );
  }, [q, tab, ageBand, allRows]);

  // infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver((entries) => {
      const first = entries[0];
      if (first && first.isIntersecting) {
        setVisibleCount((prev) => prev + 200);
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const visible = filtered.slice(0, visibleCount);

  const { male, female, total } = useMemo(() => {
    let maleCount = 0;
    let femaleCount = 0;
    for (const row of filtered) {
      const g = getGender(row);
      if (g === "M") maleCount += 1;
      else if (g === "F") femaleCount += 1;
    }
    return { male: maleCount, female: femaleCount, total: filtered.length };
  }, [filtered]);

  const syncedTotal = allRows.length;

  const filterTabs = [
    { key: "all", label: "ALL" },
    { key: "male", label: "MALE" },
    { key: "female", label: "FEMALE" },
  ];
  const ageFilters = [
    { key: "all", label: "ALL" },
    { key: "18-30", label: "18–30" },
    { key: "30-45", label: "30–45" },
    { key: "45-60", label: "45–60" },
    { key: "60+", label: "60+" },
  ];

  const [ageFilterKey, setAgeFilterKey] = useState("all");

  useEffect(() => {
    setAgeBand(ageFilterKey);
  }, [ageFilterKey]);

  

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TopNavbar
        userName={userName}
        busy={busy}
        onMenuOpen={handleMenuOpen}
        onPull={handlePull}
        onPush={handlePush}
      />

      {/* Sticky block: filters + search, directly under navbar (no gap) */}
      <Box
        sx={{
          position: "sticky",
          top: 0, // 👈 no extra gap now
          zIndex: (theme) => theme.zIndex.appBar - 1,
          bgcolor: "background.paper",
          borderBottom: "1px solid rgba(15,23,42,0.08)",
        }}
      >
        <Container maxWidth="lg" sx={{ py: 0.75 }}>
          <Stack spacing={0.75}>
            {/* Row 1: ALL/MALE/FEMALE tabs + totals in ONE LINE */}
            <Stack
              direction="row"
              alignItems="flex-end"
              justifyContent="space-between"
              spacing={1}
            >
              <Tabs
                value={tab}
                onChange={(_, value) => setTab(value)}
                variant="scrollable"
                allowScrollButtonsMobile
                sx={{
                  minHeight: 32,
                  "& .MuiTab-root": {
                    minHeight: 32,
                    fontSize: 12,
                    paddingX: 1.5,
                  },
                }}
              >
                {filterTabs.map((f) => (
                  <Tab key={f.key} value={f.key} label={f.label} />
                ))}
              </Tabs>

              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  size="small"
                  label={`M: ${male}`}
                  color="primary"
                  variant="outlined"
                />
                <Chip
                  size="small"
                  label={`F: ${female}`}
                  color="secondary"
                  variant="outlined"
                />
                <Chip
                  size="small"
                  label={`Shown: ${visible.length}/${total} • Synced: ${syncedTotal}`}
                  variant="filled"
                />
              </Stack>
            </Stack>

            {/* Row 2: Age band chips + search bar + clear */}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <ToggleButtonGroup
                value={ageFilterKey}
                exclusive
                onChange={(_, value) => {
                  if (value) setAgeFilterKey(value);
                }}
                size="small"
              >
                {ageFilters.map((f) => (
                  <ToggleButton key={f.key} value={f.key}>
                    {f.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              <Box sx={{ flex: 1, display: "flex", gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Search voters (Hindi)"
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
                        <VoiceSearchButton
                          onResult={(text) => setQ(text)}
                          lang={voiceLang}
                          disabled={busy}
                        />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    maxWidth: { xs: "100%", sm: 420 },
                  }}
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setQ("")}
                  disabled={!q}
                >
                  Clear
                </Button>
              </Box>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* Menu for logout */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
        keepMounted
      >
        <Box sx={{ px: 2, py: 1.5, width: 280 }}>
          <Typography variant="subtitle2">{userName}</Typography>
          <Typography variant="caption" color="text.secondary">
            Database: {collectionName || "Unassigned"}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<LogoutRoundedIcon />}
            sx={{ mt: 1.5 }}
            onClick={logout}
            fullWidth
          >
            Logout
          </Button>
        </Box>
      </Menu>

      {/* Results */}
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack spacing={3}>
          <Card>
            <CardContent>
              <Stack spacing={1.25}>
                {visible.length === 0 ? (
                  <Typography color="text.secondary">
                    No voters match your filters yet.
                  </Typography>
                ) : (
                  visible.map((r, i) => {
                    const name = getName(r);
                    const serialTxt = getSerialText(r);
                    const serialNum = getSerialNum(r);
                    const age = getAge(r);
                    const gender = getGender(r);
                    const house = getHouseNo(r);
                    const rps = getRPS(r);
                    const mobRaw = getMobile(r);
                    const mob = normalizePhone(mobRaw);
                    const shareText = buildShareText(r, collectionName);
                    const waHref = mob
                      ? `https://wa.me/91${mob}?text=${encodeURIComponent(
                          shareText
                        )}`
                      : `whatsapp://send?text=${encodeURIComponent(
                          shareText
                        )}`;

                    const serialDisplay = !Number.isNaN(serialNum)
                      ? serialNum
                      : serialTxt || "—";

                    return (
                      <Paper
                        key={r._id || i}
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          borderRadius: 2,
                          display: "flex",
                          flexDirection: "column",
                          gap: 0.5,
                        }}
                      >
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          spacing={1}
                        >
                          <Typography variant="body2" color="text.secondary">
                            Part: {getPart(r) || "—"} • Serial: {serialDisplay}
                          </Typography>
                          {rps && (
                            <Chip
                              label={rps}
                              size="small"
                              color="default"
                              variant="outlined"
                            />
                          )}
                        </Stack>

                        <Typography
                          variant="subtitle1"
                          sx={{
                            fontWeight: 600,
                            cursor: "pointer",
                            textDecoration: "none",
                            "&:hover": { textDecoration: "underline" },
                          }}
                          onClick={() => setDetail(r)}
                        >
                          {name}
                        </Typography>

                        {/* Caste / interest / volunteer */}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mt: 0.5 }}
                        >
                          Caste: {getCaste(r) || "OPEN"} • Interest:{" "}
                          {getPoliticalInterest(r) || "—"}{" "}
                          {getVolunteer(r)
                            ? `• Volunteer: ${getVolunteer(r)}`
                            : ""}
                        </Typography>

                        {/* Row 3: Actions - Call, Share, Tags + Edit in one row */}
                        <Stack
                          direction="row"
                          spacing={1}
                          flexWrap="wrap"
                          sx={{ mt: 0.25 }}
                          alignItems="center"
                        >
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<CallRoundedIcon />}
                            disabled={!mob}
                            component={mob ? "a" : "button"}
                            href={mob ? `tel:${mob}` : undefined}
                          >
                            Call
                          </Button>
                          <Button
                            variant="contained"
                            color="success"
                            size="small"
                            startIcon={<WhatsAppIcon />}
                            component="a"
                            href={waHref}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Share
                          </Button>
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => setTagsVoter(r)}
                          >
                            <AddRoundedIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => setSelected(r)}
                          >
                            <EditRoundedIcon />
                          </IconButton>
                        </Stack>
                      </Paper>
                    );
                  })
                )}
                <Box ref={sentinelRef} sx={{ height: 1 }} />
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Container>

      <MobileEditModal
        open={!!selected}
        voter={selected}
        onClose={async (ok) => {
          setSelected(null);
          if (ok) await loadAll();
        }}
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
        collectionName={collectionName}
        onClose={() => setDetail(null)}
      />

      <PWAInstallPrompt bottom={120} />
    </Box>
  );
}
