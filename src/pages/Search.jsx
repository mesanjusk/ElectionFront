// client/src/pages/Search.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  AppBar,
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
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import CloudDownloadRoundedIcon from "@mui/icons-material/CloudDownloadRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
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
  setActiveDatabase,
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
  pick(r, ["name", "Name"]) ||
  pick(r?.__raw, ["Name", "नाव", "नाव + मोबा/ ईमेल नं."]) ||
  "—";

const getEPIC = (r) =>
  pick(r, ["voter_id", "EPIC"]) ||
  pick(r?.__raw, ["EPIC", "voter_id", "कार्ड नं"]) ||
  "—";

const getRPS = (r) =>
  pick(r, ["RPS", "RollPartSerial"]) ||
  pick(r?.__raw, [
    "RPS",
    "Roll/Part/Serial",
    "Roll / Part / Serial",
    "R/P/S",
    "Roll-Part-Serial",
  ]) ||
  "";

const getPart = (r) =>
  pick(r, ["Part", "part", "Booth", "booth"]) ||
  pick(r?.__raw, ["Part", "Part No", "Booth", "भाग नं."]) ||
  "";

/* Serial helpers */
const getSerialText = (r) => {
  const v =
    pick(r, ["Serial No", "serial", "Serial", "Sr No", "SrNo"]) ||
    pick(r?.__raw, [
      "Serial No",
      "Serial",
      "Sr No",
      "SrNo",
      "अनु. नं.",
      "अनुक्रमांक",
      "अनुक्रमांक नं.",
    ]) ||
    "";
  return v == null ? "" : String(v);
};

const parseLastNumber = (s) => {
  const m = String(s || "").match(/\d+/g);
  if (!m) return NaN;
  const n = parseInt(m[m.length - 1], 10);
  return Number.isNaN(n) ? NaN : n;
};

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
    pick(r?.__raw, ["Gender", "gender", "লিংগ", "लिंग"]) ||
    "";
  const s = String(g).toLowerCase();
  if (!s) return "";
  if (s.startsWith("m") || s.includes("पुरुष")) return "M";
  if (s.startsWith("f") || s.includes("स्त्री")) return "F";
  return s.toUpperCase();
};

const getCareOf = (r) =>
  pick(r, [
    "Father Name",
    "Husband Name",
    "Guardian Name",
    "CareOf",
    "C_O",
    "C/O",
  ]) ||
  pick(r?.__raw, [
    "वडिलांचे नाव",
    "वडिलांचे नांव",
    "पतीचे नाव",
    "पतीचे नांव",
    "Guardians Name",
    "Guardian Name",
    "Father Name",
    "Father's Name",
    "Husband Name",
    "Husband's Name",
  ]) ||
  "";

/* Phone (DB fields only) */
const getMobile = (r) =>
  pick(r, ["mobile", "Mobile", "phone", "Phone", "contact", "Contact"]) || "";

const normalizePhone = (raw) => {
  if (!raw) return "";
  let d = String(raw).replace(/[^\d]/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? d : "";
};

/* Share text for WhatsApp */
const buildShareText = (r) => {
  const name = getName(r);
  const epic = getEPIC(r);
  const part = getPart(r);
  const serial = getSerialNum(r);
  const rps = getRPS(r);
  const age = getAge(r);
  const gender = getGender(r);
  const house = getHouseNo(r);
  const co = getCareOf(r);

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
  ].filter(Boolean);
  return lines.join("\n");
};

/* ---------------- Small mobile edit modal (local only) ---------------- */
function MobileEditModal({ open, voter, onClose }) {
  const [mobile, setMobile] = useState(getMobile(voter));
  useEffect(() => setMobile(getMobile(voter)), [voter]);

  if (!open || !voter) return null;

  const handleSave = async () => {
    const n = normalizePhone(mobile);
    if (!n) {
      alert("Enter a valid 10-digit mobile.");
      return;
    }
    await updateVoterLocal(voter._id, { mobile: n });
    onClose(true);
  };

  return (
    <Dialog open={open} onClose={() => onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>
        {getMobile(voter) ? "Edit mobile" : "Add mobile"}
      </DialogTitle>
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
            <Typography fontFamily="monospace">{getEPIC(voter)}</Typography>
          </Stack>
          <TextField
            label="Mobile number"
            value={mobile || ""}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="10-digit mobile"
            inputProps={{ inputMode: "numeric" }}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save (local)
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ---------------- Full Record Details modal ---------------- */
function RecordModal({ open, voter, onClose }) {
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
    ["Age", getAge(voter) || "—"],
    ["Sex", getGender(voter) || "—"],
    ["House", getHouseNo(voter) || "—"],
    ["C/O", getCareOf(voter) || "—"],
    ["Mobile", getMobile(voter) || "—"],
  ];
  const shareText = buildShareText(voter);

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
          <TextField
            label="Share text"
            value={shareText}
            multiline
            minRows={3}
            fullWidth
            InputProps={{ readOnly: true }}
          />
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

/* ---------------- Reusable Top Navbar component ---------------- */
<TopNavbar
  collectionName={collectionName}
  userName={userName}
  busy={busy}
  onMenuOpen={handleMenuOpen}
  onPull={handlePull}
  onPush={handlePush}
/>


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

  const voiceLang = "mr-IN"; // fixed (no selector)
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);

  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all"); // all | male | female
  const [ageBand, setAgeBand] = useState("all");
  const [allRows, setAllRows] = useState([]);
  const [visibleCount, setVisibleCount] = useState(200);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const sentinelRef = useRef(null);

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
      const aNaN = Number.isNaN(sa);
      const bNaN = Number.isNaN(sb);
      if (aNaN && bNaN) return 0;
      if (aNaN) return 1;
      if (bNaN) return -1;
      return sa - sb;
    });
    setAllRows(arr);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handlePull = async () => {
    const id = getActiveDatabase();
    if (!id) return alert("No database selected.");
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
    if (!id) return alert("No database selected.");
    if (id !== activeDb) {
      setActiveDatabase(id);
      setActiveDbState(id);
    }
    setBusy(true);
    try {
      const res = await pushOutbox({ databaseId: id });
      alert(
        `Pushed: ${res.pushed}${
          res.failed?.length ? `, Failed: ${res.failed.length}` : ""
        }`
      );
    } catch (e) {
      alert("Push failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  // Combined filter: text + tab + age band (no transliteration, exact match)
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

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

    const passesTab = (r) => {
      if (tab === "male") return getGender(r) === "M";
      if (tab === "female") return getGender(r) === "F";
      return true; // all
    };

    const textMatch = (r) => {
      if (!term) return true;

      const name = getName(r) || "";
      const epic = getEPIC(r) || "";
      const mob = getMobile(r) || "";
      const rps = getRPS(r) || "";
      const part = getPart(r) || "";
      const serialTxt = String(getSerialText(r) ?? "");

      const nameL = name.toLowerCase();
      const epicL = epic.toLowerCase();
      const mobL = mob.toLowerCase();
      const rpsL = rps.toLowerCase();
      const partL = part.toLowerCase();
      const serialL = serialTxt.toLowerCase();

      return (
        nameL.includes(term) ||
        epicL.includes(term) ||
        mobL.includes(term) ||
        rpsL.includes(term) ||
        partL.includes(term) ||
        serialL.includes(term)
      );
    };

    return allRows.filter((r) => textMatch(r) && passesTab(r) && inAgeBand(r));
  }, [q, tab, ageBand, allRows]);

  // Reset window on any filter change
  useEffect(() => setVisibleCount(200), [q, tab, ageBand]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount((c) =>
          Math.min(c + 300, filtered.length || c + 300)
        );
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

  const matchedTotal = filtered.length;
  const syncedTotal = allRows.length;

  const filterTabs = [
    { key: "all", label: "All" },
    { key: "male", label: "Male" },
    { key: "female", label: "Female" },
  ];
  const ageFilters = [
    { key: "all", label: "All" },
    { key: "18-30", label: "18–30" },
    { key: "30-45", label: "30–45" },
    { key: "45-60", label: "45–60" },
    { key: "60+", label: "60+" },
  ];

  return (
    <Box sx={{ minHeight: "100vh", pb: 8 }}>
      <TopNavbar
        collectionName={collectionName}
        userName={userName}
        busy={busy}
        onMenuOpen={handleMenuOpen}
        onPull={handlePull}
        onPush={handlePush}
      />

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

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <TextField
                  label="Search voters"
                  placeholder="Type name in Marathi/Hindi, or EPIC / phone"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  InputProps={{
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
                />
                <Tabs
                  value={tab}
                  onChange={(_, value) => setTab(value)}
                  variant="scrollable"
                  allowScrollButtonsMobile
                >
                  {filterTabs.map((filter) => (
                    <Tab
                      key={filter.key}
                      label={filter.label}
                      value={filter.key}
                    />
                  ))}
                </Tabs>
                <ToggleButtonGroup
                  value={ageBand}
                  exclusive
                  onChange={(_, value) => value && setAgeBand(value)}
                  size="small"
                >
                  {ageFilters.map((filter) => (
                    <ToggleButton key={filter.key} value={filter.key}>
                      {filter.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                {/* Visible / Matches / Synced chips hidden as requested */}
              </Stack>
            </CardContent>
          </Card>

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
                    const mob = getMobile(r);
                    const shareText = buildShareText(r);
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
                    const part = getPart(r) || "—";

                    return (
                      <Paper
                        key={r._id || `${i}-${serialTxt}`}
                        sx={{
                          p: 1.25,
                          display: "flex",
                          flexDirection: "column",
                          gap: 0.5,
                        }}
                      >
                        {/* Row 1: Serial · Part · Age · Sex + + button on right */}
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          flexWrap="wrap"
                        >
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            Serial {serialDisplay} · Part {part}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            · Age {age || "—"} · {gender || "—"}
                          </Typography>
                          <Box sx={{ flexGrow: 1 }} />
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => setSelected(r)}
                          >
                            <AddRoundedIcon fontSize="small" />
                          </IconButton>
                        </Stack>

                        {/* Row 2: Name (clickable -> details) */}
                        <Typography
                          variant="subtitle1"
                          fontWeight={600}
                          sx={{
                            cursor: "pointer",
                            textDecoration: "none",
                            "&:hover": {
                              textDecoration: "underline",
                            },
                          }}
                          onClick={() => setDetail(r)}
                        >
                          {name}
                        </Typography>

                        {/* Row 3: EPIC removed from list card */}                        

                        {/* Row 4: Actions - Call, Share, Edit icon in one row */}
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
                            onClick={() => setSelected(r)}
                          >
                            <EditRoundedIcon />
                          </IconButton>
                        </Stack>
                      </Paper>
                    );
                  })
                )}
                <Box ref={sentinelRef} sx={{ height: 32 }} />
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6">Totals</Typography>
              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                sx={{ mt: 1 }}
              >
                <Chip label={`Male ${male.toLocaleString()}`} />
                <Chip label={`Female ${female.toLocaleString()}`} />
                <Chip label={`All records ${total.toLocaleString()}`} />
              </Stack>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 1 }}
              >
                {syncedTotal.toLocaleString()} voters synced locally. Filters
                show {matchedTotal.toLocaleString()} matches.
              </Typography>
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
      <RecordModal
        open={!!detail}
        voter={detail}
        onClose={() => setDetail(null)}
      />

      <PWAInstallPrompt bottom={120} />
    </Box>
  );
}
