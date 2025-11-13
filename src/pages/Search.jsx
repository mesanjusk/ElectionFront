// client/src/pages/Search.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { setAuthToken } from "../services/api";
import { lockSession, getActiveDatabase } from "../auth"; // ✅ read active DB id
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

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-8"
      onClick={() => onClose(false)}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-emerald-100 bg-white p-6 shadow-2xl shadow-emerald-900/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <p className="text-lg font-semibold text-slate-900">
            {getMobile(voter) ? 'Edit mobile' : 'Add mobile'}
          </p>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            onClick={() => onClose(false)}
            type="button"
          >
            ✕
          </button>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-600">
          <div className="text-base font-semibold text-slate-900">{getName(voter)}</div>
          <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
            <span className="text-xs uppercase tracking-wide text-slate-500">EPIC</span>
            <span className="font-mono text-sm text-slate-800">{getEPIC(voter)}</span>
          </div>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="10-digit mobile"
            inputMode="numeric"
          />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={() => onClose(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex flex-1 items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-500/30"
            onClick={async () => {
              const n = normalizePhone(mobile);
              if (!n) return alert('Enter a valid 10-digit mobile.');
              await updateVoterLocal(voter._id, { mobile: n });
              onClose(true);
            }}
            type="button"
          >
            Save (Local)
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Full Record Details modal ---------------- */
function RecordModal({ open, voter, onClose }) {
  if (!open || !voter) return null;
  const fields = [
    ['Name', getName(voter)],
    ['EPIC', getEPIC(voter)],
    ['R/P/S', getRPS(voter) || '—'],
    ['Part', getPart(voter) || '—'],
    ['Serial', !Number.isNaN(getSerialNum(voter)) ? getSerialNum(voter) : getSerialText(voter) || '—'],
    ['Age', getAge(voter) || '—'],
    ['Sex', getGender(voter) || '—'],
    ['House', getHouseNo(voter) || '—'],
    ['C/O', getCareOf(voter) || '—'],
    ['Mobile', getMobile(voter) || '—'],
  ];
  const shareText = buildShareText(voter);

  const mob = getMobile(voter);
  const waUrl = mob
    ? `https://wa.me/91${mob}?text=${encodeURIComponent(shareText)}`
    : `whatsapp://send?text=${encodeURIComponent(shareText)}`;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-8"
      onClick={() => onClose(false)}
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-emerald-100 bg-white p-6 shadow-2xl shadow-emerald-900/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <p className="text-lg font-semibold text-slate-900">Record details</p>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            onClick={() => onClose(false)}
            type="button"
          >
            ✕
          </button>
        </div>
        <div className="mt-4 space-y-3 text-sm text-slate-600">
          {fields.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</span>
              <span className="text-slate-900">{String(v)}</span>
            </div>
          ))}
          <textarea
            className="h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
            readOnly
            value={shareText}
          />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            className="inline-flex flex-1 items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-500/30"
            href={waUrl}
            target="_blank"
            rel="noreferrer"
          >
            Share on WhatsApp
          </a>
          <button
            className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={() => onClose(false)}
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Click-outside helper for the top menu ---------------- */
function useClickOutside(ref, onOutside) {
  useEffect(() => {
    function handler(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) onOutside?.();
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [ref, onOutside]);
}

/* ================================== PAGE ================================== */
export default function Search() {
  // auth for server Pull/Push
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (t) setAuthToken(t);
  }, []);

  const [userName, setUserName] = useState("User");
  useEffect(() => {
    const u = localStorage.getItem("userName") ||
              localStorage.getItem("name") ||
              JSON.parse(localStorage.getItem("user") || "{}").name;
    if (u) setUserName(u);
  }, []);

  // ✅ read active DB id for pull/push
  const [activeDb, setActiveDb] = useState(() => getActiveDatabase() || "");
  useEffect(() => {
    // in case it was changed elsewhere (e.g., Home auto-select)
    const id = getActiveDatabase() || "";
    if (id && id !== activeDb) setActiveDb(id);
  }, [activeDb]);

  const [voiceLang, setVoiceLang] = useState("mr-IN");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setMenuOpen(false));

  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");     // all | male | female | surname
  const [ageBand, setAgeBand] = useState("all"); // all | 18-30 | 30-45 | 45-60 | 60+
  const [allRows, setAllRows] = useState([]);
  const [visibleCount, setVisibleCount] = useState(200);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const sentinelRef = useRef(null);

  const logout = () => {
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

  useEffect(() => { loadAll(); }, [loadAll]);

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
      if (ageBand === "60+")   return a >= 61;
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
      const mob  = (getMobile(r) || "").toLowerCase();
      const rps  = (getRPS(r) || "").toLowerCase();
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
        setVisibleCount((c) => Math.min(c + 300, filtered.length || c + 300));
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

  const iconButton =
    'inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-100 bg-white/80 text-lg text-emerald-600 shadow-sm transition hover:border-emerald-200 hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:opacity-50';
  const filterTabClass = (active) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition ${
      active
        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border border-transparent text-slate-600 hover:border-emerald-100'
    }`;
  const ageChipClass = (active) =>
    `rounded-full border px-3 py-1 text-sm font-semibold transition ${
      active
        ? 'border-emerald-200 bg-white text-emerald-700'
        : 'border-slate-200 text-slate-600 hover:border-emerald-100'
    }`;
  const cardClass = 'rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm shadow-emerald-900/5';
  const tinyBtn =
    'inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-sm font-semibold text-slate-600 transition hover:border-emerald-200 hover:text-emerald-700';

  return (
    <div className="flex min-h-screen flex-col bg-emerald-50/40">
      <header className="sticky top-0 z-30 border-b border-emerald-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              className={iconButton}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
              type="button"
            >
              ☰
            </button>
            <span className="text-sm font-semibold text-slate-700" title={userName}>
              Hello, {userName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={iconButton}
              type="button"
              aria-label="Pull"
              disabled={busy}
              onClick={async () => {
                if (!activeDb) return alert('No database selected.');
                setBusy(true);
                try {
                  const c = await pullAll({ databaseId: activeDb });
                  alert(`Pulled ${c} changes from server.`);
                  await loadAll();
                } catch (e) {
                  alert('Pull failed: ' + (e?.message || e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              ⬇
            </button>
            <button
              className={iconButton}
              type="button"
              aria-label="Push"
              disabled={busy}
              onClick={async () => {
                if (!activeDb) return alert('No database selected.');
                setBusy(true);
                try {
                  const res = await pushOutbox({ databaseId: activeDb });
                  alert(`Pushed: ${res.pushed}${res.failed?.length ? `, Failed: ${res.failed.length}` : ''}`);
                } catch (e) {
                  alert('Push failed: ' + (e?.message || e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              ⬆
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-emerald-100 bg-white/95">
            <div
              ref={menuRef}
              className="mx-auto w-full max-w-5xl rounded-3xl border border-emerald-100 bg-white p-5 shadow-xl shadow-emerald-900/10"
            >
              <label className="block text-sm font-semibold text-slate-600">
                Voice language
                <select
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900"
                  value={voiceLang}
                  onChange={(e) => setVoiceLang(e.target.value)}
                >
                  <option value="mr-IN">Marathi (mr-IN)</option>
                  <option value="hi-IN">Hindi (hi-IN)</option>
                  <option value="en-IN">English (en-IN)</option>
                </select>
              </label>
              <div className="mt-4 flex justify-end">
                <button
                  className="inline-flex items-center rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  onClick={logout}
                  type="button"
                >
                  Logout ⎋
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-emerald-100 bg-white/95">
          <div className="mx-auto flex w-full max-w-5xl gap-2 px-4 py-3">
            <input
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-base text-slate-900 shadow-inner focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tab === 'surname' ? 'Type surname (last name)' : 'Search by name, EPIC, booth or phone'}
              autoComplete="off"
            />
            <VoiceSearchButton onResult={setQ} lang={voiceLang} className={iconButton} disabled={busy} title="Voice search" />
            <button
              className={iconButton}
              aria-label="Clear search"
              onClick={() => setQ('')}
              disabled={!q}
              type="button"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="border-t border-emerald-100 bg-white/95">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap gap-2 px-4 py-2">
            {[
              { key: 'all', label: 'All' },
              { key: 'male', label: 'Male' },
              { key: 'female', label: 'Female' },
              { key: 'surname', label: 'Surname' },
            ].map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} className={filterTabClass(tab === t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-emerald-100 bg-white/95">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap gap-2 px-4 py-2">
            {[
              { key: 'all', label: 'All' },
              { key: '18-30', label: '18–30' },
              { key: '30-45', label: '30–45' },
              { key: '45-60', label: '45–60' },
              { key: '60+', label: '60+' },
            ].map((a) => (
              <button key={a.key} type="button" onClick={() => setAgeBand(a.key)} className={ageChipClass(ageBand === a.key)}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl space-y-3 px-4 py-5">
          {visible.map((r, i) => {
            const name = getName(r);
            const serialTxt = getSerialText(r);
            const serialNum = getSerialNum(r);
              const age = getAge(r);
              const gender = getGender(r);
              const mob = getMobile(r);

              const shareText = buildShareText(r);
              const waHref = mob
                ? `https://wa.me/91${mob}?text=${encodeURIComponent(shareText)}`
                : `whatsapp://send?text=${encodeURIComponent(shareText)}`;

              return (
                <div className={cardClass} key={r._id || `${i}-${serialTxt}`}>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                      {!Number.isNaN(serialNum) ? serialNum : serialTxt || '—'}
                    </span>
                    <span>{age ? `Age ${age}` : 'Age —'}</span>
                    <span>{gender || '—'}</span>
                    <button
                      className={tinyBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(r);
                      }}
                      title={mob ? 'Edit mobile' : 'Add mobile'}
                      type="button"
                    >
                      ✎
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <button
                      className="flex-1 text-left text-base font-semibold text-slate-900"
                      title={name}
                      onClick={() => setDetail(r)}
                      type="button"
                    >
                      {name}
                    </button>

                    {mob ? (
                      <>
                        <a
                          className={tinyBtn}
                          href={`tel:${mob}`}
                          onClick={(e) => e.stopPropagation()}
                          title={`Call ${mob}`}
                        >
                          📞
                        </a>
                        <a
                          className={`${tinyBtn} border-emerald-200 text-emerald-700`}
                          href={waHref}
                          onClick={(e) => e.stopPropagation()}
                          title="WhatsApp"
                          target="_blank"
                          rel="noreferrer"
                        >
                          🟢
                        </a>
                      </>
                    ) : (
                      <>
                        <a
                          className={`${tinyBtn} border-emerald-200 text-emerald-700`}
                          href={waHref}
                          onClick={(e) => e.stopPropagation()}
                          title="Share to WhatsApp"
                        >
                          🟢
                        </a>
                        <button
                          className={tinyBtn}
                          title="Add mobile"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(r);
                          }}
                          type="button"
                        >
                          ＋
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

          <div ref={sentinelRef} className="h-8 w-full" />
        </div>
      </main>

      <footer className="sticky bottom-0 z-30 border-t border-emerald-100 bg-white/95 px-4 py-3">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-3 text-center text-sm font-semibold text-slate-700 sm:grid-cols-6">
          <div>
            <p className="text-xs uppercase text-slate-500">Male</p>
            <p>{male.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Female</p>
            <p>{female.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Total</p>
            <p>{total.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Visible</p>
            <p>{visibleTotal.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Matches</p>
            <p>{matchedTotal.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Synced</p>
            <p>{syncedTotal.toLocaleString()}</p>
          </div>
        </div>
      </footer>

      {/* Modals */}
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
    </div>
  );
}
