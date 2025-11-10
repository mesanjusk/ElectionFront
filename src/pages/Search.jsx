// client/src/pages/Search.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { setAuthToken } from "../services/api";
import { clearToken } from "../auth";
import { db } from "../db/indexedDb";
import { pullAll, pushOutbox, updateVoterLocal } from "../services/sync";
import VoiceSearchButton from "../components/VoiceSearchButton.jsx";
import PWAInstallPrompt from "../components/PWAInstallPrompt.jsx";
import "./Search.css";

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

/* R/P/S combined token and parts */
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

/* Part/Booth */
const getPart = (r) =>
  pick(r, ["Part", "part", "Booth", "booth"]) ||
  pick(r?.__raw, ["Part", "Part No", "Booth", "भाग नं."]) ||
  "";

/* Serial (text & numeric) */
const getSerialText = (r) =>
  // include top-level "Serial No" (with space) because some datasets store it exactly like that
  pick(r, ["Serial No", "serial", "Serial", "Sr No", "SrNo"]) ||
  pick(r?.__raw, ["Serial No", "Serial", "Sr No", "SrNo", "अनु. नं.", "अनुक्रमांक", "अनुक्रमांक नं."]) ||
  "";
const num = (s) => {
  const m = String(s || "").match(/\d+/g);
  if (!m) return NaN;
  // prefer last number token (handles "अनु. नं. 514")
  const n = parseInt(m[m.length - 1], 10);
  return Number.isNaN(n) ? NaN : n;
};
const getSerialNum = (r) => {
  const t = getSerialText(r);
  if (t) return num(t);
  // sometimes present only inside RPS as roll/part/serial
  const rps = getRPS(r);
  if (rps && /\d+\/\d+\/\d+/.test(rps)) {
    const last = rps.split("/").pop();
    return num(last);
  }
  return NaN;
};

/* House No */
const getHouseNo = (r) =>
  pick(r, ["House No", "House", "HouseNumber"]) ||
  pick(r?.__raw, ["घर क्रमांक", "घर क्र.", "House No", "House Number"]) ||
  "";

/* Age & Gender */
const getAge = (r) =>
  pick(r, ["Age", "age"]) ||
  pick(r?.__raw, ["Age", "age", "वय"]) ||
  "";

const getGender = (r) => {
  const g =
    pick(r, ["gender", "Gender"]) ||
    pick(r?.__raw, ["Gender", "gender", "लिंग", "লিংগ"]) ||
    "";
  const s = String(g).toLowerCase();
  if (!s) return "";
  if (s.startsWith("m") || s.includes("पुरुष")) return "M";
  if (s.startsWith("f") || s.includes("स्त्री")) return "F";
  return s.toUpperCase();
};

/* Care-of (father/husband/guardian) */
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

/* Phone (only DB fields, not guessed from __raw) */
const getMobile = (r) =>
  pick(r, ["mobile", "Mobile", "phone", "Phone", "contact", "Contact"]) || "";
const normalizePhone = (raw) => {
  if (!raw) return "";
  let d = String(raw).replace(/[^\d]/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? d : "";
};

/* ---------------- Small mobile edit modal (local only) ---------------- */
function MobileEditModal({ open, voter, onClose }) {
  const [mobile, setMobile] = useState(getMobile(voter));
  useEffect(() => setMobile(getMobile(voter)), [voter]);

  if (!open) return null;
  return (
    <div className="sx-modal" onClick={() => onClose(false)}>
      <div className="sx-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="sx-dialog-head">
          <div className="sx-title">{getMobile(voter) ? "Edit mobile" : "Add mobile"}</div>
          <button className="sx-icon" onClick={() => onClose(false)}>✕</button>
        </div>
        <div className="sx-dialog-body">
          <div className="sx-sub">{getName(voter)}</div>
          <div className="sx-row"><span className="sx-k">EPIC</span><span className="sx-v">{getEPIC(voter)}</span></div>
          <input
            className="sx-input"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="10-digit mobile"
            inputMode="numeric"
          />
        </div>
        <div className="sx-dialog-foot">
          <button className="sx-btn ghost" onClick={() => onClose(false)}>Cancel</button>
          <button
            className="sx-btn primary"
            onClick={async () => {
              const n = normalizePhone(mobile);
              if (!n) return alert("Enter a valid 10-digit mobile.");
              await updateVoterLocal(voter._id, { mobile: n });
              onClose(true);
            }}
          >
            Save (Local)
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

  const [voiceLang, setVoiceLang] = useState("mr-IN");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setMenuOpen(false));

  const [q, setQ] = useState("");
  const [allRows, setAllRows] = useState([]);
  const [visibleCount, setVisibleCount] = useState(200);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState(null);
  const sentinelRef = useRef(null);

  const logout = () => {
    clearToken();
    location.href = "/login";
  };

  // Load ALL from IndexedDB, **sorted by Serial Number only**
  const loadAll = useCallback(async () => {
    const arr = await db.voters.toArray();
    arr.sort((a, b) => {
      const sa = getSerialNum(a);
      const sb = getSerialNum(b);
      const aNaN = Number.isNaN(sa);
      const bNaN = Number.isNaN(sb);
      if (aNaN && bNaN) return 0;
      if (aNaN) return 1;     // NaNs go to the end
      if (bNaN) return -1;
      return sa - sb;
    });
    setAllRows(arr);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Filter locally by name/epic/mobile (order preserved after filter)
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return allRows;
    return allRows.filter((r) => {
      const name = getName(r).toLowerCase();
      const epic = getEPIC(r).toLowerCase();
      const mob = (getMobile(r) || "").toLowerCase();
      const rps = (getRPS(r) || "").toLowerCase();
      const part = (getPart(r) || "").toLowerCase();
      const serialTxt = (getSerialText(r) || "").toLowerCase();
      return (
        name.includes(term) ||
        epic.includes(term) ||
        mob.includes(term) ||
        rps.includes(term) ||
        part.includes(term) ||
        serialTxt.includes(term)
      );
    });
  }, [q, allRows]);

  useEffect(() => setVisibleCount(200), [q]);

  // Infinite scroll
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

  // Stats (current window)
  const male = visible.reduce((n, r) => (getGender(r) === "M" ? n + 1 : n), 0);
  const female = visible.reduce((n, r) => (getGender(r) === "F" ? n + 1 : n), 0);

  const visibleTotal = visible.length;
  const matchedTotal = filtered.length;
  const syncedTotal = allRows.length;

  return (
    <div className="sx-page">
      <header className="sx-appbar">
        <div className="sx-appbar__brand">
          <button
            className="sx-appbar__icon"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Open quick settings"
            type="button"
          >
            ☰
          </button>
          <div className="sx-appbar__titles">
            <h1 className="sx-appbar__title">Voter Explorer</h1>
            <span className="sx-appbar__meta">Offline • IndexedDB</span>
          </div>
        </div>
        <div className="sx-appbar__actions">
          <button
            className="sx-appbar__action"
            type="button"
            aria-label="Refresh local records"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await loadAll();
              } finally {
                setBusy(false);
              }
            }}
          >
            ⟳
          </button>
        </div>
      </header>

      {menuOpen && (
        <div ref={menuRef} className="sx-menu-sheet">
          <label className="field">
            <span className="field__label">Voice language</span>
            <select
              className="select"
              value={voiceLang}
              onChange={(e) => setVoiceLang(e.target.value)}
            >
              <option value="mr-IN">Marathi (mr-IN)</option>
              <option value="hi-IN">Hindi (hi-IN)</option>
              <option value="en-IN">English (en-IN)</option>
            </select>
          </label>
          <div className="sx-menu-sheet__actions">
            <button className="btn btn--ghost" onClick={logout} type="button">
              Logout ⎋
            </button>
          </div>
        </div>
      )}

      <main className="sx-body">
        <section className="sx-glance">
          <article className="sx-glance-card">
            <span className="sx-glance-card__label">Visible now</span>
            <span className="sx-glance-card__value">{visibleTotal.toLocaleString()}</span>
          </article>
          <article className="sx-glance-card">
            <span className="sx-glance-card__label">Matches</span>
            <span className="sx-glance-card__value">{matchedTotal.toLocaleString()}</span>
          </article>
          <article className="sx-glance-card">
            <span className="sx-glance-card__label">Synced offline</span>
            <span className="sx-glance-card__value">{syncedTotal.toLocaleString()}</span>
          </article>
        </section>

        <section className="sx-content">
          <div className="sx-cards">
            {visible.map((r, i) => {
              const name = getName(r);
              const epic = getEPIC(r);
              const rps = getRPS(r);
            const part = getPart(r);
            const serialTxt = getSerialText(r);
            const serialNum = getSerialNum(r);
            const house = getHouseNo(r);
            const age = getAge(r);
            const gender = getGender(r);
            const mob = getMobile(r);

            const topRight = [
              epic || null,
              rps || (part && !Number.isNaN(serialNum) ? `${part}/${serialNum}` : part || null),
            ].filter(Boolean).join("   ");

              return (
                <div className="sx-card" key={r._id || `${i}-${epic}`}>
                  <div className="sx-card-top">
                    <div className="sx-serial-badge">{!Number.isNaN(serialNum) ? serialNum : serialTxt || "—"}</div>
                    <div className="sx-topline">{topRight}</div>
                  </div>

                  <div className="sx-card-head">
                    <div className="sx-name" title={name}>{name}</div>
                    <div className="sx-chip-group">
                      {mob ? (
                        <a
                          className="sx-chip"
                          href={`tel:${mob}`}
                          onClick={(e) => e.stopPropagation()}
                          title={`Call ${mob}`}
                        >
                          📞
                        </a>
                      ) : null}
                      <button
                        className="sx-chip"
                        onClick={() => setSelected(r)}
                        title={mob ? "Edit mobile" : "Add mobile"}
                        type="button"
                      >
                        ✎
                      </button>
                    </div>
                  </div>

                  <div className="sx-row"><span className="sx-k">वय</span><span className="sx-v">{age || "—"}</span></div>
                  <div className="sx-row"><span className="sx-k">लिंग</span><span className="sx-v">{gender || "—"}</span></div>
                  <div className="sx-row"><span className="sx-k">C/O</span><span className="sx-v">{getCareOf(r) || "—"}</span></div>

                  <div className="sx-row">
                    <span className="sx-k">EPIC</span>
                    <span className="sx-v">{epic}</span>
                  </div>
                  {rps ? (
                    <div className="sx-row">
                      <span className="sx-k">R/P/S</span>
                      <span className="sx-v">{rps}</span>
                    </div>
                  ) : null}
                  <div className="sx-row">
                    <span className="sx-k">Mobile</span>
                    <span className="sx-v">{mob ? `📱 ${mob}` : <i>—</i>}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div ref={sentinelRef} className="sx-sentinel" />
        </section>
      </main>

      <div className="sx-fab-wrap">
        <button
          className="sx-fab"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const c = await pullAll();
              alert(`Pulled ${c} changes from server.`);
              await loadAll();
            } catch (e) {
              alert("Pull failed: " + (e?.message || e));
            } finally {
              setBusy(false);
            }
          }}
          type="button"
        >
          ⬇ Pull
        </button>
        <button
          className="sx-fab"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await pushOutbox();
              alert(`Pushed: ${res.pushed}${res.failed?.length ? `, Failed: ${res.failed.length}` : ""}`);
            } catch (e) {
              alert("Push failed: " + (e?.message || e));
            } finally {
              setBusy(false);
            }
          }}
          type="button"
        >
          ⬆ Push
        </button>
      </div>

      <MobileEditModal
        open={!!selected}
        voter={selected}
        onClose={async (ok) => {
          setSelected(null);
          if (ok) await loadAll();
        }}
      />

      <PWAInstallPrompt bottom={150} />

      <footer className="sx-bottom-bar">
        <div className="sx-bottom-bar__stats">
          <div className="sx-bottom-bar__stat">
            Male<strong>{male.toLocaleString()}</strong>
          </div>
          <div className="sx-bottom-bar__stat">
            Female<strong>{female.toLocaleString()}</strong>
          </div>
          <div className="sx-bottom-bar__stat">
            Total<strong>{visibleTotal.toLocaleString()}</strong>
          </div>
        </div>
        <div className="sx-bottom-bar__search">
          <input
            className="sx-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, EPIC, booth or phone"
            autoComplete="off"
          />
          <VoiceSearchButton
            onResult={setQ}
            lang={voiceLang}
            className="sx-search-action"
            disabled={busy}
            title="Voice search"
          />
          <button
            className="sx-search-action"
            aria-label="Clear search"
            onClick={() => setQ("")}
            disabled={!q}
            type="button"
          >
            ✕
          </button>
        </div>
      </footer>
    </div>
  );
}
