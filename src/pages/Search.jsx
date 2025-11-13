// client/src/pages/Search.jsx 
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
  MenuItem,
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
import { setAuthToken } from "../services/api";
import { lockSession, getActiveDatabase, getUser } from "../auth"; // ✅ added getUser
import { db } from "../db/indexedDb";
import { pullAll, pushOutbox, updateVoterLocal } from "../services/sync";
import VoiceSearchButton from "../components/VoiceSearchButton.jsx";
import PWAInstallPrompt from "../components/PWAInstallPrompt.jsx";

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

/* Serial */
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
const num = (s) => {
  const m = String(s || "").match(/\d+/g);
  if (!m) return NaN;
  const n = parseInt(m[m.length - 1], 10);
  return Number.isNaN(n) ? NaN : n;
};
const getSerialNum = (r) => {
  const t = getSerialText(r);
  if (t) return num(t);
  const rps = getRPS(r);
  if (rps && /\d+\/\d+\/\d+/.test(rps)) {
    const last = rps.split("/").pop();
    return num(last);
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
    "পতির নাম",
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
    `Voter Details`,
    `Name: ${name}`,
    `EPIC: ${epic}`,
    `Part: ${part || "—"}  Serial: ${!Number.isNaN(serial) ? serial : "—"}`,
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

/* ================================== PAGE ================================== */
export default function Search() {
  // auth for server Pull/Push
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (t) setAuthToken(t);
  }, []);

  // ✅ Proper username (from auth + localStorage)
  const [userName, setUserName] = useState("User");
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

  // ✅ read active DB id for pull/push
  const [activeDb, setActiveDb] = useState(() => getActiveDatabase() || "");
  useEffect(() => {
    // in case it was changed elsewhere (e.g., Home auto-select)
    const id = getActiveDatabase() || "";
    if (id && id !== activeDb) setActiveDb(id);
  }, [activeDb]);

  const [voiceLang, setVoiceLang] = useState("mr-IN");
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);

  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all"); // all | male | female | surname
  const [ageBand, setAgeBand] = useState("all"); // all | 18-30 | 30-45 | 45-60 | 60+
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
    location.href = "/login";
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

  // surname helper (last token)
  const getSurname = (r) => {
    const n = (getName(r) || "").trim();
    if (!n) return "";
    const parts = n.split(/\s+/);
    return parts[parts.length - 1].toLowerCase();
  };

  // Combined filter: text + tab + age band
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
      if (tab === "surname") {
        if (!term) return true; // if no term, show all (age filter still applies)
        return getSurname(r).startsWith(term);
      }
      return true; // 'all'
    };

    const textMatch = (r) => {
      if (!term) return true;
      if (tab === "surname") {
        // surname tab uses surname-only matching
        return getSurname(r).startsWith(term);
      }
      // normal wide search
      const name = getName(r).toLowerCase();
      const epic = getEPIC(r).toLowerCase();
      const mob = (getMobile(r) || "").toLowerCase();
      const rps = (getRPS(r) || "").toLowerCase();
      const part = (getPart(r) || "").toLowerCase();
      const serialTxt = String(getSerialText(r) ?? "").toLowerCase();
      return (
        name.includes(term) ||
        epic.includes(term) ||
        mob.includes(term) ||
        rps.includes(term) ||
        part.includes(term) ||
        serialTxt.includes(term)
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

  const visibleTotal = visible.length;
  const matchedTotal = filtered.length;
  const syncedTotal = allRows.length;

  const filterTabs = [
    { key: "all", label: "All" },
    { key: "male", label: "Male" },
    { key: "female", label: "Female" },
    { key: "surname", label: "Surname" },
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
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(15,23,42,0.08)",
        }}
      >
        <Toolbar sx={{ justifyContent: "space-between", minHeight: 72 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <IconButton onClick={handleMenuOpen} color="inherit">
              <MenuRoundedIcon />
            </IconButton>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Assigned search
              </Typography>
              <Typography variant="h6">Hello, {userName}</Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Pull latest">
              <span>
                <IconButton
                  color="primary"
                  onClick={async () => {
                    if (!activeDb) return alert("No database selected.");
                    setBusy(true);
                    try {
                      const c = await pullAll({ databaseId: activeDb });
                      alert(`Pulled ${c} changes from server.`);
                      await loadAll();
                    } catch (e) {
                      alert("Pull failed: " + (e?.message || e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                >
                  <CloudDownloadRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Push offline updates">
              <span>
                <IconButton
                  color="primary"
                  onClick={async () => {
                    if (!activeDb) return alert("No database selected.");
                    setBusy(true);
                    try {
                      const res = await pushOutbox({ databaseId: activeDb });
                      alert(
                        `Pushed: ${res.pushed}${
                          res.failed?.length
                            ? `, Failed: ${res.failed.length}`
                            : ""
                        }`
                      );
                    } catch (e) {
                      alert("Push failed: " + (e?.message || e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                >
                  <CloudUploadRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>

      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
        keepMounted
      >
        <Box sx={{ px: 2, py: 1.5, width: 280 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Voice language
          </Typography>
          <TextField
            select
            size="small"
            fullWidth
            sx={{ mt: 1.5 }}
            value={voiceLang}
            onChange={(e) => setVoiceLang(e.target.value)}
          >
            <MenuItem value="mr-IN">Marathi (mr-IN)</MenuItem>
            <MenuItem value="hi-IN">Hindi (hi-IN)</MenuItem>
            <MenuItem value="en-IN">English (en-IN)</MenuItem>
          </TextField>
          <Button
            variant="outlined"
            startIcon={<LogoutRoundedIcon />}
            sx={{ mt: 2 }}
            onClick={logout}
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
                  placeholder="Search by name, EPIC or phone"
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
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip label={`Visible ${visibleTotal.toLocaleString()}`} />
                  <Chip label={`Matches ${matchedTotal.toLocaleString()}`} />
                  <Chip label={`Synced ${syncedTotal.toLocaleString()}`} />
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={1.5}>
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

                    return (
                      <Paper
                        key={r._id || `${i}-${serialTxt}`}
                        sx={{
                          p: 1.5, // ✅ slightly smaller padding for narrower card
                          display: "flex",
                          flexDirection: {
                            xs: "column",
                            md: "row",
                          },
                          justifyContent: "space-between",
                          gap: 1.5, // slightly tighter gap
                        }}
                      >
                        <Stack spacing={0.25}>
                          <Typography variant="overline" color="text.secondary">
                            Serial / Part
                          </Typography>
                          <Typography variant="subtitle1">
                            {!Number.isNaN(serialNum)
                              ? serialNum
                              : serialTxt || "—"}{" "}
                            · {getPart(r) || "—"}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Age {age || "—"} · {gender || "—"}
                          </Typography>
                        </Stack>
                        <Stack
                          spacing={0.5}
                          alignItems={{ xs: "flex-start", md: "flex-end" }}
                        >
                          <Typography variant="subtitle1">{name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            EPIC {getEPIC(r)}
                          </Typography>
                          <Stack
                            direction="row"
                            spacing={1}
                            flexWrap="wrap"
                            sx={{ mt: 0.5 }}
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
                            <Button
                              variant="text"
                              size="small"
                              startIcon={<SearchRoundedIcon />}
                              onClick={() => setDetail(r)}
                            >
                              Details
                            </Button>
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
