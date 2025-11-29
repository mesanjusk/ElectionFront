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
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";

import api from "../api";
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

// ✅ EPIC / Voter ID
const getEPIC = (r) =>
  pick(r, ["EPIC", "Voter ID", "Voter Id", "Voter id", "VoterID", "VoterId"]) ||
  pick(r?.__raw, ["EPIC", "Epic", "Voter ID", "Voter Id", "voter_id", "कार्ड नं"]) ||
  "";

const getPart = (r) =>
  pick(r, ["Part No", "Part", "part", "Booth", "booth"]) ||
  pick(r?.__raw, ["Part No", "Part", "Booth", "भाग नं."]) ||
  "";

// 🔹 Booth getter – Mongo column is exactly "Booth No"
const getBooth = (r) =>
  pick(r, ["Booth No", "booth", "Booth", "BoothNo"]) ||
  pick(r?.__raw, ["Booth No", "Booth", "booth", "BoothNo"]) ||
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

// 🔹 Address getter (from "Address" column)
const getAddress = (r) =>
  pick(r, ["Address", "address", "Address Line", "Address1"]) ||
  pick(r?.__raw, ["Address", "address", "पत्ता"]) ||
  "";

// 🔹 Second serial from "Source File" column (last number in the string)
const getSourceSerial = (r) => {
  const raw =
    pick(r, ["Source File", "SourceFile", "sourceFile", "Source", "source"]) ||
    pick(r?.__raw, ["Source File", "SourceFile", "sourceFile", "Source", "source"]) ||
    "";
  if (!raw) return "";
  const m = String(raw).match(/\d+/g);
  if (!m || m.length === 0) return "";
  return m[m.length - 1]; // last number
};

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
    "पु...",
  ]) ||
  "";

/* Mobile – stored in our local DB */
const getMobile = (r) =>
  r?.mobile ||
  pick(r, ["Mobile", "mobile", "Phone"]) ||
  pick(r?.__raw, ["Mobile", "mobile", "Phone"]) ||
  "";

/* Image URL – from voter (NOT used in text anymore, per requirement) */
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

// caste / political interest / volunteer getters
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

/* Share text for WhatsApp – voter details only */
const buildShareText = (r, collectionName) => {
  const name = getName(r);
  const epic = getEPIC(r); // EPIC = Voter ID
  const rps = getRPS(r);
  const age = getAge(r);
  const gender = getGender(r);
  const booth = getBooth(r);

  const serialNum = getSerialNum(r);
  const serialTxt = getSerialText(r);
  const numberStr = !Number.isNaN(serialNum) ? serialNum : serialTxt || "";

  const lines = [
    "Voter Details",
    `Name: ${name}`,
    `EPIC: ${epic}`,
    booth ? `Booth: ${booth}` : null,
    numberStr ? `Number: ${numberStr}` : null,
    rps ? `R/P/S: ${rps}` : null,
    `Age: ${age || "—"}  Sex: ${gender || "—"}`,
  ].filter(Boolean);
  return lines.join("\n");
};

/* ---------------- Small mobile edit modal (local + push) --------------- */

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
        const pushed = res?.pushed ?? res?.count ?? res?.synced ?? null;
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
            <Typography fontFamily="monospace">{getEPIC(voter)}</Typography>
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

/* ---------------- Separate modals: Caste / Interest / Volunteer -------- */

function CasteModal({ open, voter, onClose, options = [] }) {
  const [caste, setCaste] = useState(getCaste(voter) || "");
  const [customCaste, setCustomCaste] = useState("");

  useEffect(() => {
    if (voter) {
      setCaste(getCaste(voter) || "");
      setCustomCaste("");
    }
  }, [voter]);

  if (!open || !voter) return null;

  const handleSave = async () => {
    const finalCaste =
      (customCaste && customCaste.trim()) || (caste && caste.trim()) || "OPEN";

    await updateVoterLocal(voter._id, {
      caste: finalCaste,
    });
    onClose(true);
  };

  const casteList = options && options.length ? options : [];

  return (
    <Dialog open={open} onClose={() => onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>Update caste</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {getName(voter)}
          </Typography>

          <TextField
            select
            label="Select caste"
            value={caste}
            onChange={(e) => setCaste(e.target.value)}
            fullWidth
          >
            <MenuItem value="">
              <em>(None)</em>
            </MenuItem>
            {casteList.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Or type new caste"
            value={customCaste}
            onChange={(e) => setCustomCaste(e.target.value)}
            placeholder="e.g. कश्यप, अत्रि..."
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

function InterestModal({ open, voter, onClose, options = [] }) {
  const [interest, setInterest] = useState(getPoliticalInterest(voter) || "");
  const [customInterest, setCustomInterest] = useState("");

  useEffect(() => {
    if (voter) {
      setInterest(getPoliticalInterest(voter) || "");
      setCustomInterest("");
    }
  }, [voter]);

  if (!open || !voter) return null;

  const handleSave = async () => {
    const finalInterest =
      (customInterest && customInterest.trim()) ||
      (interest && interest.trim()) ||
      "";

    await updateVoterLocal(voter._id, {
      politicalInterest: finalInterest,
    });
    onClose(true);
  };

  const interestList = options && options.length ? options : [];

  return (
    <Dialog open={open} onClose={() => onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>Political interest</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {getName(voter)}
          </Typography>

          <TextField
            select
            label="Political interest (party)"
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
            fullWidth
            helperText="Party from Party master DB"
          >
            <MenuItem value="">
              <em>Choose party</em>
            </MenuItem>
            {interestList.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Or type custom interest"
            value={customInterest}
            onChange={(e) => setCustomInterest(e.target.value)}
            placeholder="e.g. Pro local independent, issue-based..."
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

function VolunteerModal({ open, voter, onClose, options = [] }) {
  const [volunteerName, setVolunteerName] = useState(getVolunteer(voter) || "");
  const [selectedVolunteerId, setSelectedVolunteerId] = useState("");

  useEffect(() => {
    if (voter) {
      const vName = getVolunteer(voter) || "";
      setVolunteerName(vName);

      const matched = options.find(
        (o) => o.name && o.name.toLowerCase() === vName.toLowerCase()
      );
      setSelectedVolunteerId(matched ? matched.id || matched._id || "" : "");
    }
  }, [voter, options]);

  if (!open || !voter) return null;

  const handleSave = async () => {
    const nameFromList =
      options.find(
        (o) =>
          o.id === selectedVolunteerId ||
          o._id === selectedVolunteerId ||
          o.uuid === selectedVolunteerId
      )?.name || "";

    const finalName =
      (nameFromList && nameFromList.trim()) ||
      (volunteerName && volunteerName.trim()) ||
      "";

    await updateVoterLocal(voter._id, {
      volunteer: finalName,
      assignedVolunteer: finalName,
      volunteerId: selectedVolunteerId || undefined,
    });

    onClose(true);
  };

  const volunteers = options || [];

  return (
    <Dialog open={open} onClose={() => onClose(false)} fullWidth maxWidth="xs">
      <DialogTitle>Assigned volunteer</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {getName(voter)}
          </Typography>

          <TextField
            select
            label="Select volunteer"
            value={selectedVolunteerId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedVolunteerId(id);
              const found = volunteers.find(
                (o) => o.id === id || o._id === id || o.uuid === id
              );
              if (found?.name) {
                setVolunteerName(found.name);
              }
            }}
            fullWidth
            helperText="Volunteers assigned to this candidate"
          >
            <MenuItem value="">
              <em>(None)</em>
            </MenuItem>
            {volunteers.map((v) => (
              <MenuItem
                key={v.id || v._id || v.name}
                value={v.id || v._id || v.uuid || v.name}
              >
                {v.name}
                {v.phone ? ` (${v.phone})` : ""}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Or type volunteer name"
            value={volunteerName}
            onChange={(e) => {
              setVolunteerName(e.target.value);
              if (selectedVolunteerId) setSelectedVolunteerId("");
            }}
            placeholder="Volunteer / party worker name"
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

/* ---------------- Full Record Details modal ---------------- */
function RecordModal({ open, voter, onClose, collectionName }) {
  if (!open || !voter) return null;

  const serialTxt = getSerialText(voter);
  const serialNum = getSerialNum(voter);
  const serialDisplay = !Number.isNaN(serialNum)
    ? serialNum
    : serialTxt || "—";

  const fields = [
    ["Name", getName(voter)],
    ["EPIC", getEPIC(voter)],
    ["Booth", getBooth(voter) || "—"],          // 🔹 Booth in details
    ["Number", serialDisplay || "—"],           // 🔹 Number in details
    ["R/P/S", getRPS(voter) || "—"],
    ["Address", getAddress(voter) || "—"],
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
  const [shareImageUrl, setShareImageUrl] = useState("");

  useEffect(() => {
    try {
      const authUser = getUser && getUser();
      if (authUser?.name) setUserName(authUser.name);
      else if (authUser?.username) setUserName(authUser.username);

      // 🔗 same image as Home page banner/avatar for share
      if (authUser) {
        const url =
          authUser.bannerUrl ||
          authUser.coverUrl ||
          authUser.posterUrl ||
          authUser.avatarUrl ||
          authUser.avatar ||
          "";
        if (url) setShareImageUrl(url);
      }
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

  // 🔴 UPDATED activeDb logic: auto-pick single allowed DB for volunteers
  const [activeDb, setActiveDbState] = useState(() => {
    const id = (getActiveDatabase && getActiveDatabase()) || "";
    return id;
  });

  // Keep activeDb + label in sync with auth + available DBs
  useEffect(() => {
    try {
      const currentId = (getActiveDatabase && getActiveDatabase()) || "";
      let effectiveId = currentId || activeDb || "";

      // 🟢 Auto-pick DB if none is active but exactly ONE is available (typical volunteer case)
      if (!effectiveId && getAvailableDatabases) {
        const dbs = getAvailableDatabases() || [];
        if (Array.isArray(dbs) && dbs.length === 1) {
          const only = dbs[0];
          const onlyId =
            only.id || only._id || only.collection || only.name || "";
          if (onlyId) {
            effectiveId = onlyId;
            if (onlyId !== activeDb) {
              setActiveDbState(onlyId);
            }
          }
        }
      } else if (currentId && currentId !== activeDb) {
        // If auth has a newer active DB, sync our state
        setActiveDbState(currentId);
      }

      const dbs = (getAvailableDatabases && getAvailableDatabases()) || [];
      const found = dbs.find(
        (d) => (d.id || d._id || d.collection) === effectiveId
      );

      const label =
        found?.name ||
        found?.title ||
        found?.label ||
        (effectiveId ? `Collection ${effectiveId}` : "Unassigned collection");

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
  const [partFilter, setPartFilter] = useState("all"); // Part-wise filter
  const [boothFilter, setBoothFilter] = useState("all"); // Booth-wise filter
  const [allRows, setAllRows] = useState([]);
  const [visibleCount, setVisibleCount] = useState(200);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState(null); // mobile edit
  const [detail, setDetail] = useState(null); // full record

  const [casteVoter, setCasteVoter] = useState(null);
  const [interestVoter, setInterestVoter] = useState(null);
  const [volunteerVoter, setVolunteerVoter] = useState(null);

  const [casteOptions, setCasteOptions] = useState([]); // from local records
  const [partyOptions, setPartyOptions] = useState([]); // from Party collection
  const [volunteerOptions, setVolunteerOptions] = useState([]); // from Users table

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
    loadAll().catch(() => {});
  }, [loadAll]);

  // Build caste options from local voter records
  useEffect(() => {
    const set = new Set();
    for (const r of allRows) {
      const c = getCaste(r);
      if (c) set.add(String(c).trim());
    }
    const list = Array.from(set).filter(Boolean);
    list.sort((a, b) => String(a).localeCompare(String(b), "en-IN"));
    setCasteOptions(list);
  }, [allRows]);

  // Part tabs (from "Part No" / Part field)
  const partTabs = useMemo(() => {
    const set = new Set();
    for (const r of allRows) {
      const p = getPart(r);
      if (p) set.add(String(p).trim());
    }
    const arr = Array.from(set);
    arr.sort((a, b) => {
      const ma = String(a).match(/\d+/);
      const mb = String(b).match(/\d+/);
      const na = ma ? parseInt(ma[0], 10) : NaN;
      const nb = mb ? parseInt(mb[0], 10) : NaN;
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b), "en-IN", { numeric: true });
    });
    return arr;
  }, [allRows]);

  // Booth tabs (from "Booth No" field)
  const boothTabs = useMemo(() => {
    const set = new Set();
    for (const r of allRows) {
      const b = getBooth(r);
      if (b) set.add(String(b).trim());
    }
    const arr = Array.from(set);
    arr.sort((a, b) => {
      const ma = String(a).match(/\d+/);
      const mb = String(b).match(/\d+/);
      const na = ma ? parseInt(ma[0], 10) : NaN;
      const nb = mb ? parseInt(mb[0], 10) : NaN;
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b), "en-IN", { numeric: true });
    });
    return arr;
  }, [allRows]);

  // Load party options from Party collection (same as AdminUsers)
  useEffect(() => {
    let cancelled = false;

    async function fetchParties() {
      try {
        const res = await api.get("/api/admin/parties");
        const data = Array.isArray(res.data) ? res.data : [];
        const names = Array.from(
          new Set(
            data
              .map(
                (p) =>
                  p.name ||
                  p.englishName ||
                  p.shortName ||
                  p.code ||
                  p.abbr
              )
              .filter(Boolean)
          )
        );
        names.sort((a, b) => String(a).localeCompare(String(b), "en-IN"));
        if (!cancelled) setPartyOptions(names);
      } catch (err) {
        console.error("Failed to load parties:", err?.response?.data || err);
      }
    }

    fetchParties();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load volunteers from Users table (only volunteer role, assigned to this candidate)
  useEffect(() => {
    let cancelled = false;

    async function fetchVolunteers() {
      try {
        const res = await api.get("/api/admin/users");
        const raw =
          Array.isArray(res.data) ? res.data : res.data?.users || [];

        // current logged-in user (candidate / parent)
        let myId = null;
        try {
          const authUser = getUser && getUser();
          myId =
            authUser?.id ||
            authUser?._id ||
            authUser?.userId ||
            authUser?.user?.id ||
            null;
        } catch {
          // ignore
        }

        const list = raw
          .filter((u) => {
            const role = (u.role || u.type || "")
              .toString()
              .toLowerCase();

            // only users with volunteer role
            if (!role.includes("volunteer")) return false;

            // if we know current user's id, show only volunteers linked to this parent
            if (myId) {
              const parent = u.parentUserId ? String(u.parentUserId) : "";
              return parent === String(myId);
            }

            // fallback: admin view sees all volunteers
            return true;
          })
          .map((u) => ({
            id: u.id || u._id || u.uuid,
            name: u.name || u.fullName || u.username,
            phone:
              u.mobile ||
              u.phone ||
              u.contactNumber ||
              u.whatsapp ||
              u.whatsappNumber,
          }))
          .filter((v) => v.name);

        if (!cancelled) {
          setVolunteerOptions(list);
        }
      } catch (err) {
        console.error("Failed to load volunteers:", err?.response?.data || err);
      }
    }

    fetchVolunteers();
    return () => {
      cancelled = true;
    };
  }, []);

  // Only party names from Party collection
  const interestOptions = useMemo(() => {
    return Array.from(
      new Set(
        (partyOptions || [])
          .map((p) => String(p))
          .filter(Boolean)
      )
    );
  }, [partyOptions]);

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
      if (ageBand === "36-45" && !(ageNum >= 36 && ageNum <= 45)) return false;
      if (ageBand === "46-60" && !(ageNum >= 46 && ageNum <= 60)) return false;
      if (ageBand === "61+" && !(ageNum >= 61)) return false;

      // Part-wise filter
      if (partFilter !== "all") {
        const p = getPart(r);
        if (!p || String(p).trim() !== partFilter) return false;
      }

      // Booth-wise filter
      if (boothFilter !== "all") {
        const b = getBooth(r);
        if (!b || String(b).trim() !== boothFilter) return false;
      }

      if (!term) return true;

      const fields = [
        getName(r),
        getEPIC(r),
        getPart(r),
        getSerialText(r),
        getHouseNo(r),
        getCareOf(r),
        getMobile(r),
        getAddress(r),
      ];

      const hay = fields
        .filter(Boolean)
        .map((x) => String(x).toLowerCase())
        .join(" ");

      if (hay.includes(term.toLowerCase())) return true;

      const devHay = devToLatin(hay);
      return devHay.includes(lt);
    });
  }, [allRows, q, tab, ageBand, partFilter, boothFilter]);

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

  // 🔴 UPDATED onPull: auto-use the single allowed DB if activeDb is empty
  const onPull = async () => {
    setBusy(true);
    try {
      // 1) Try auth active DB, then local state
      let id = (getActiveDatabase && getActiveDatabase()) || activeDb || "";

      // 2) If still nothing, but exactly ONE DB is available, auto-use that
      if (!id && getAvailableDatabases) {
        const dbs = getAvailableDatabases() || [];
        if (Array.isArray(dbs) && dbs.length === 1) {
          const only = dbs[0];
          id = only.id || only._id || only.collection || only.name || "";
          if (id && id !== activeDb) {
            setActiveDbState(id);
          }
        }
      }

      // 3) If still nothing, show message
      if (!id) {
        showSnack(
          "No voter database is assigned to this device. Ask your candidate/admin to assign one."
        );
        return;
      }

      console.log("[SYNC] onPull clicked", { databaseId: id });
      const res = await pullAll({
        databaseId: id,
        onProgress: ({ page, batch, total }) => {
          console.log("[SYNC] pullAll progress", { page, batch, total });
        },
      });
      await loadAll();
      const pulled =
        res?.pulled ?? res?.count ?? (typeof res === "number" ? res : null);
      console.log("[SYNC] pullAll finished", { databaseId: id, res, pulled });
      if (pulled != null) {
        showSnack(`Pulled ${pulled.toLocaleString()} records from server.`);
      } else {
        showSnack("Pull completed.");
      }
    } catch (e) {
      console.error("[SYNC] pullAll error", e);
      showSnack("Pull failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // 🔴 UPDATED onPush: same auto-selection logic
  const onPush = async () => {
    setBusy(true);
    try {
      // 1) Try auth active DB, then local state
      let id = (getActiveDatabase && getActiveDatabase()) || activeDb || "";

      // 2) If still nothing, but exactly ONE DB is available, auto-use that
      if (!id && getAvailableDatabases) {
        const dbs = getAvailableDatabases() || [];
        if (Array.isArray(dbs) && dbs.length === 1) {
          const only = dbs[0];
          id = only.id || only._id || only.collection || only.name || "";
          if (id && id !== activeDb) {
            setActiveDbState(id);
          }
        }
      }

      // 3) If still nothing, show message
      if (!id) {
        showSnack(
          "No voter database is assigned to this device. Ask your candidate/admin to assign one."
        );
        return;
      }

      console.log("[SYNC] onPush clicked", { databaseId: id });
      const res = await pushOutbox({ databaseId: id });
      const pushed =
        res?.pushed ??
        res?.count ??
        res?.synced ??
        (typeof res === "number" ? res : null);
      console.log("[SYNC] pushOutbox finished", { databaseId: id, res, pushed });
      if (pushed != null) {
        showSnack(`Pushed ${pushed.toLocaleString()} record(s) to server.`);
      } else {
        showSnack("Push completed.");
      }
      await loadAll();
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e.message ||
        "Push failed. Please try again.";
      console.error("[SYNC] pushOutbox error", e?.response || e);
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

  // 🔹 Share via WhatsApp: TRY image + details via Web Share, else text fallback
  const handleShareWhatsApp = async (r) => {
    const mobRaw = getMobile(r);
    const mob = normalizePhone(mobRaw);
    const shareText = buildShareText(r, collectionName);

    // 1️⃣ BEST TRY: Web Share with image file + text (caption)
    if (
      typeof navigator !== "undefined" &&
      navigator.share &&
      shareImageUrl
    ) {
      try {
        const resp = await fetch(shareImageUrl);
        const blob = await resp.blob();
        const file = new File([blob], "candidate.jpg", {
          type: blob.type || "image/jpeg",
        });

        const data = {
          files: [file],
          text: shareText,
          title: "Voter Details",
        };

        const canShare =
          !navigator.canShare || navigator.canShare(data);

        if (canShare) {
          await navigator.share(data);
          return; // ✅ done, user picks WhatsApp from sheet
        }
      } catch (err) {
        console.error(
          "Image + text Web Share failed, falling back to WhatsApp text link:",
          err
        );
      }
    }

    // 2️⃣ FALLBACK: classic WhatsApp URL with ONLY text
    const base = mob ? `https://wa.me/91${mob}` : "https://wa.me/";
    const waHref = `${base}?text=${encodeURIComponent(shareText)}`;

    window.open(waHref, "_blank");
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

      {/* 🔹 FULL-WIDTH sticky search + filters header */}
      <Box
        sx={{
          position: "sticky",
          top: 56, // height of TopNavbar
          zIndex: 20,
          bgcolor: "#f3f4f6",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          px: 1,
          py: 1,
          width: "100%",
        }}
      >
        <Container maxWidth="lg">
          <Stack
            spacing={0.75}
            sx={{
              width: "100%",
            }}
          >
            {/* SEARCH BOX with X button */}
            <TextField
              id="searchBoxHindi"
              fullWidth
              size="medium"
              placeholder="नाम, EPIC, घर, पता, मोबाइल से खोजें..."
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
                      {/* CLEAR (X) BUTTON */}
                      {q?.length > 0 && (
                        <IconButton
                          size="small"
                          onClick={() => setQ("")}
                          sx={{ mr: 0.5 }}
                        >
                          ✕
                        </IconButton>
                      )}

                      {/* Voice Search */}
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

            {/* Gender Tabs */}
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
                },
                "& .MuiTabs-indicator": {
                  backgroundColor: "black",
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
              }}
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="18-25">18–25</ToggleButton>
              <ToggleButton value="26-35">26–35</ToggleButton>
              <ToggleButton value="36-45">36–45</ToggleButton>
              <ToggleButton value="46-60">46–60</ToggleButton>
              <ToggleButton value="61+">61+</ToggleButton>
            </ToggleButtonGroup>

            {/* Part-wise Tabs (scrollable, uses "Part No" from DB) */}
            {partTabs.length > 0 && (
              <Tabs
                value={partFilter}
                onChange={(_, value) => {
                  if (value !== null) setPartFilter(value);
                }}
                variant="scrollable"
                allowScrollButtonsMobile
                sx={{
                  minHeight: 32,
                  "& .MuiTab-root": {
                    minHeight: 32,
                    paddingY: 0,
                    fontSize: 12,
                    textTransform: "none",
                  },
                  "& .MuiTabs-indicator": {
                    backgroundColor: "black",
                  },
                }}
              >
                <Tab key="all-parts" label="All Part" value="all" />
                {partTabs.map((p) => (
                  <Tab key={p} label={String(p)} value={p} />
                ))}
              </Tabs>
            )}

            {/* Booth-wise Tabs (scrollable, uses "Booth No" from DB) */}
            {boothTabs.length > 0 && (
              <Tabs
                value={boothFilter}
                onChange={(_, value) => {
                  if (value !== null) setBoothFilter(value);
                }}
                variant="scrollable"
                allowScrollButtonsMobile
                sx={{
                  minHeight: 32,
                  "& .MuiTab-root": {
                    minHeight: 32,
                    paddingY: 0,
                    fontSize: 12,
                    textTransform: "none",
                  },
                  "& .MuiTabs-indicator": {
                    backgroundColor: "black",
                  },
                }}
              >
                <Tab key="all-booths" label="All Booth" value="all" />
                {boothTabs.map((b) => (
                  <Tab key={b} label={String(b)} value={b} />
                ))}
              </Tabs>
            )}
          </Stack>
        </Container>
      </Box>

      {/* Results */}
      <Container
        maxWidth="lg"
        sx={{
          pt: 1.5,
          pb: 10,
        }}
      >
        <Stack spacing={0.5}>
          {/* Voter list */}
          <Stack spacing={0.4}>
            {visible.map((r, i) => {
              const name = getName(r);
              const epic = getEPIC(r);
              const serialTxt = getSerialText(r);
              const serialNum = getSerialNum(r);
              const age = getAge(r);
              const gender = getGender(r);
              const mobRaw = getMobile(r);
              const mob = normalizePhone(mobRaw);
              const booth = getBooth(r);
              const addr = getAddress(r);
              const sourceSerial = getSourceSerial(r);

              const serialDisplay = !Number.isNaN(serialNum)
                ? serialNum
                : serialTxt || "—";

              return (
                <Paper
                  key={r._id || `${i}-${serialTxt}`}
                  sx={{
                    p: 0.5, // narrower padding
                    display: "flex",
                    flexDirection: "column",
                    gap: 0.15,
                    borderRadius: 0.5, // smaller radius
                  }}
                >
                  {/* Row 1: Sn · Age · Sex · EPIC + Booth + Source Serial + 3 icons */}
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
                        Sn. {serialDisplay}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        · Age {age || "—"} · {gender || "—"} ·  {epic || "—"}
                        {booth ? ` · Booth ${booth}` : ""}
                        {sourceSerial ? ` ·  ${sourceSerial}` : ""}
                      </Typography>
                    </Stack>

                    <Stack direction="row" spacing={0.25} alignItems="center">
                      {/* 1) Caste (via + icon) */}
                      <IconButton size="small" onClick={() => setCasteVoter(r)}>
                        <AddRoundedIcon fontSize="small" />
                      </IconButton>

                      {/* 2) Political interest */}
                      <IconButton
                        size="small"
                        onClick={() => setInterestVoter(r)}
                      >
                        <FlagRoundedIcon fontSize="small" />
                      </IconButton>

                      {/* 3) Volunteer assigned */}
                      <IconButton
                        size="small"
                        onClick={() => setVolunteerVoter(r)}
                      >
                        <GroupRoundedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>

                  {/* Row 2: Name + Call + WhatsApp + Edit */}
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ width: "100%", mt: 0.15 }}
                  >
                    {/* Name */}
                    <Typography
                      variant="subtitle1"
                      fontWeight={700}
                      sx={{
                        cursor: "pointer",
                        textDecoration: "none",
                        "&:hover": { textDecoration: "underline" },
                        flex: 1,
                        pr: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "primary.main",
                      }}
                      onClick={() => setDetail(r)}
                    >
                      {name}
                    </Typography>

                    {/* Actions */}
                    <Stack direction="row" spacing={0.25} alignItems="center">
                      <IconButton
                        size="small"
                        disabled={!mob}
                        component={mob ? "a" : "button"}
                        href={mob ? `tel:${mob}` : undefined}
                      >
                        <CallRoundedIcon fontSize="small" />
                      </IconButton>

                      {/* WhatsApp share: TRY image + text, fallback text */}
                      <IconButton
                        size="small"
                        onClick={() => handleShareWhatsApp(r)}
                      >
                        <WhatsAppIcon fontSize="small" />
                      </IconButton>

                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => setSelected(r)}
                      >
                        <EditRoundedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>

                  {/* Row 3 – Address (small, single line) */}
                  {addr && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        mt: 0.2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      📍 {addr}
                    </Typography>
                  )}
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

      <CasteModal
        open={!!casteVoter}
        voter={casteVoter}
        options={casteOptions}
        onClose={async (ok) => {
          setCasteVoter(null);
          if (ok) await loadAll();
        }}
      />

      <InterestModal
        open={!!interestVoter}
        voter={interestVoter}
        options={interestOptions}
        onClose={async (ok) => {
          setInterestVoter(null);
          if (ok) await loadAll();
        }}
      />

      <VolunteerModal
        open={!!volunteerVoter}
        voter={volunteerVoter}
        options={volunteerOptions}
        onClose={async (ok) => {
          setVolunteerVoter(null);
          if (ok) await loadAll();
        }}
      />

      <RecordModal
        open={!!detail}
        voter={detail}
        onClose={() => setDetail(null)}
        collectionName={collectionName}
      />

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
        {visible.length === 0 ? (
          <Typography
            color="text.secondary"
            variant="caption"
            textAlign="center"
          >
            No voters match your filters yet.
          </Typography>
        ) : (
          <Typography
            variant="caption"
            color="text.secondary"
            textAlign="center"
            sx={{ fontWeight: 500 }}
          >
            M {male.toLocaleString()} · F {female.toLocaleString()} · Total{" "}
            {total.toLocaleString()} · Synced{" "}
            {allRows.length.toLocaleString()}
          </Typography>
        )}
      </Box>

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
