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
    <div className="modal-backdrop" onClick={() => onClose(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{getMobile(voter) ? 'Edit mobile' : 'Add mobile'}</h3>
          <button className="btn btn--icon" onClick={() => onClose(false)} type="button">✕</button>
        </header>
        <div className="record-grid">
          <strong>{getName(voter)}</strong>
          <div className="record-row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>EPIC</span>
            <span style={{ fontFamily: 'monospace' }}>{getEPIC(voter)}</span>
          </div>
          <input
            className="input-field"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="10-digit mobile"
            inputMode="numeric"
          />
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn--ghost" onClick={() => onClose(false)} type="button">
            Cancel
          </button>
          <button
            className="btn btn--primary"
            style={{ flex: 1 }}
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
    <div className="modal-backdrop" onClick={() => onClose(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Record details</h3>
          <button className="btn btn--icon" onClick={() => onClose(false)} type="button">✕</button>
        </header>
        <div className="record-grid">
          {fields.map(([k, v]) => (
            <div key={k} className="record-row">
              <span style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{k}</span>
              <span>{String(v)}</span>
            </div>
          ))}
          <textarea className="textarea-field" readOnly value={shareText} />
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a className="btn btn--primary" style={{ flex: 1 }} href={waUrl} target="_blank" rel="noreferrer">
            Share on WhatsApp
          </a>
          <button className="btn btn--ghost" onClick={() => onClose(false)} type="button">
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

  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'male', label: 'Male' },
    { key: 'female', label: 'Female' },
    { key: 'surname', label: 'Surname' },
  ];
  const ageFilters = [
    { key: 'all', label: 'All' },
    { key: '18-30', label: '18–30' },
    { key: '30-45', label: '30–45' },
    { key: '45-60', label: '45–60' },
    { key: '60+', label: '60+' },
  ];

  return (
    <div className="search-shell">
      <header className="search-header">
        <div className="search-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn--icon" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu" type="button">
              ☰
            </button>
            <span style={{ fontWeight: 600, color: 'var(--muted-dark)' }}>Hello, {userName}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn--icon"
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
              className="btn btn--icon"
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
          <div className="search-toolbar" ref={menuRef} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Voice language</span>
              <select className="select-field" value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)}>
                <option value="mr-IN">Marathi (mr-IN)</option>
                <option value="hi-IN">Hindi (hi-IN)</option>
                <option value="en-IN">English (en-IN)</option>
              </select>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn--ghost" type="button" onClick={logout}>
                Logout ⎋
              </button>
            </div>
          </div>
        )}

        <div className="search-bar">
          <input
            className="input-field"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === 'surname' ? 'Type surname (last name)' : 'Search by name, EPIC, booth or phone'}
            autoComplete="off"
          />
          <VoiceSearchButton onResult={setQ} lang={voiceLang} disabled={busy} />
          <button className="btn btn--icon" aria-label="Clear search" onClick={() => setQ('')} disabled={!q} type="button">
            ✕
          </button>
        </div>

        <div className="search-filters">
          {filterTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`chip-button${tab === t.key ? ' active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="search-filters">
          {ageFilters.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAgeBand(a.key)}
              className={`chip-button${ageBand === a.key ? ' active' : ''}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </header>

      <main className="results-container">
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
            <div className="voter-card" key={r._id || `${i}-${serialTxt}`}>
              <div className="voter-meta">
                <span style={{ fontWeight: 600, color: 'var(--brand-dark)' }}>
                  {!Number.isNaN(serialNum) ? serialNum : serialTxt || '—'}
                </span>
                <span>{age ? `Age ${age}` : 'Age —'}</span>
                <span>{gender || '—'}</span>
                <button
                  className="btn btn--tiny"
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

              <div className="voter-main">
                <button className="voter-name" title={name} onClick={() => setDetail(r)} type="button">
                  {name}
                </button>

                {mob ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a className="btn btn--tiny" href={`tel:${mob}`} onClick={(e) => e.stopPropagation()} title={`Call ${mob}`}>
                      📞
                    </a>
                    <a
                      className="btn btn--tiny"
                      href={waHref}
                      onClick={(e) => e.stopPropagation()}
                      title="WhatsApp"
                      target="_blank"
                      rel="noreferrer"
                    >
                      🟢
                    </a>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a className="btn btn--tiny" href={waHref} onClick={(e) => e.stopPropagation()} title="Share to WhatsApp">
                      🟢
                    </a>
                    <button
                      className="btn btn--tiny"
                      title="Add mobile"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(r);
                      }}
                      type="button"
                    >
                      ＋
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={sentinelRef} style={{ height: 32 }} />
      </main>

      <footer className="footer-stats">
        <div className="stats-grid">
          <div className="stats-tile">
            <small>Male</small>
            <strong>{male.toLocaleString()}</strong>
          </div>
          <div className="stats-tile">
            <small>Female</small>
            <strong>{female.toLocaleString()}</strong>
          </div>
          <div className="stats-tile">
            <small>Total</small>
            <strong>{total.toLocaleString()}</strong>
          </div>
          <div className="stats-tile">
            <small>Visible</small>
            <strong>{visibleTotal.toLocaleString()}</strong>
          </div>
          <div className="stats-tile">
            <small>Matches</small>
            <strong>{matchedTotal.toLocaleString()}</strong>
          </div>
          <div className="stats-tile">
            <small>Synced</small>
            <strong>{syncedTotal.toLocaleString()}</strong>
          </div>
        </div>
      </footer>

      <MobileEditModal
        open={!!selected}
        voter={selected}
        onClose={async (ok) => {
          setSelected(null);
          if (ok) await loadAll();
        }}
      />
      <RecordModal open={!!detail} voter={detail} onClose={() => setDetail(null)} />

      <PWAInstallPrompt bottom={120} />
    </div>
  );
}
