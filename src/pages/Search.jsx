// client/src/pages/Search.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { setAuthToken } from "../services/api";
import { clearToken } from "../auth";
import { db } from "../db/indexedDb";
import { pullAll, pushOutbox, updateVoterLocal } from "../services/sync";
import VoiceSearchButton from "../components/VoiceSearchButton.jsx";
import PWAInstallPrompt from "../components/PWAInstallPrompt.jsx";
import "./Search.css";

/* ---------------- Robust getters: EN + MR + __raw fallbacks ---------------- */
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

const getMobile = (r) =>
  pick(r, ["mobile", "Mobile", "phone", "Phone", "contact", "Contact"]) ||
  pick(r?.__raw, ["Mobile", "Mobile No", "मोबाइल", "Contact"]) ||
  "";

const getBooth = (r) =>
  pick(r, ["booth", "Booth"]) ||
  pick(r?.__raw, ["Booth", "Part", "Part No", "भाग नं."]) ||
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
          <div className="sx-row">
            <span className="sx-k">EPIC</span>
            <span className="sx-v">{getEPIC(voter)}</span>
          </div>
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
  // auth for any server calls (Pull/Push)
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
  const [visibleCount, setVisibleCount] = useState(200); // infinite scroll window
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState(null); // for MobileEditModal
  const sentinelRef = useRef(null);

  const logout = () => {
    clearToken();
    location.href = "/login";
  };

  // Load ALL from IndexedDB, sorted by name
  const loadAll = useCallback(async () => {
    const arr = await db.voters.toArray();
    arr.sort((a, b) => getName(a).localeCompare(getName(b)));
    setAllRows(arr);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Filter locally
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return allRows;
    return allRows.filter((r) => {
      const name = getName(r).toLowerCase();
      const epic = getEPIC(r).toLowerCase();
      const mob = getMobile(r).toLowerCase();
      return name.includes(term) || epic.includes(term) || mob.includes(term);
    });
  }, [q, allRows]);

  // Reset infinite window when query changes
  useEffect(() => setVisibleCount(200), [q]);

  // Infinite scroll sentinel
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

  // Stats (from current visible list)
  const male = visible.reduce((n, r) => (getGender(r) === "M" ? n + 1 : n), 0);
  const female = visible.reduce((n, r) => (getGender(r) === "F" ? n + 1 : n), 0);

  return (
    <div className="sx-page">
      {/* ===== Top bar (YOUR OLD UI bits: menu + voice + clear) ===== */}
      <header className="sx-header">
        <div className="sx-header-row">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="sx-icon" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">☰</button>
            <h1 style={{ margin: 0 }}>All Voters</h1>
          </div>
          <div className="sx-subline">Offline • IndexedDB</div>
        </div>

        {/* Dropdown menu (voice language + logout) */}
        {menuOpen && (
          <div ref={menuRef} className="menu-sheet" style={{
            position: "absolute", top: "56px", left: "12px",
            background: "var(--card,#fff)", border: "1px solid var(--border)",
            borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.15)", padding: 10, zIndex: 10
          }}>
            <div style={{ padding: "6px 6px 10px" }}>
              <label className="field" style={{ width: "100%" }}>
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
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="sx-btn" onClick={logout}>Logout ⎋</button>
            </div>
          </div>
        )}

        {/* Search row with Voice and Clear (mobile-first) */}
        <div className="sx-search" style={{ gridTemplateColumns: "1fr auto auto" }}>
          <input
            className="sx-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name / EPIC / mobile"
            autoComplete="off"
          />
          <VoiceSearchButton
            onResult={setQ}
            lang={voiceLang}
            className="sx-icon"
            disabled={busy}
            title="Voice search"
          />
          <button className="sx-icon" aria-label="Clear" onClick={() => setQ("")} disabled={!q}>✕</button>
        </div>

        <div className="sx-stats">
          Showing <b>{visible.length.toLocaleString()}</b> of{" "}
          <b>{filtered.length.toLocaleString()}</b>
          {filtered.length !== allRows.length ? (
            <span className="sx-muted"> (from {allRows.length.toLocaleString()})</span>
          ) : null}
        </div>
      </header>

      {/* ===== Scrollable content: mobile-first cards with + edit and phone icon ===== */}
      <main className="sx-content">
        <div className="sx-cards">
          {visible.map((r) => {
            const name = getName(r);
            const epic = getEPIC(r);
            const mob = getMobile(r);
            const booth = getBooth(r);

            return (
              <div className="sx-card" key={r._id}>
                <div className="sx-card-head">
                  <div className="sx-name" title={name}>{name}</div>
                  <div style={{ display: "flex", gap: 8 }}>
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
                    <button className="sx-chip" onClick={() => setSelected(r)} title={mob ? "Edit mobile" : "Add mobile"}>＋</button>
                  </div>
                </div>

                <div className="sx-row">
                  <span className="sx-k">EPIC</span>
                  <span className="sx-v">{epic}</span>
                </div>
                <div className="sx-row">
                  <span className="sx-k">Mobile</span>
                  <span className="sx-v">{mob ? `📱 ${mob}` : <i>—</i>}</span>
                </div>
                {booth ? (
                  <div className="sx-row">
                    <span className="sx-k">Booth</span>
                    <span className="sx-v">{booth}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Infinite scroll grow point */}
        <div ref={sentinelRef} className="sx-sentinel" />
      </main>

      {/* ===== Floating Pull / Push (same as new flow) ===== */}
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
        >
          ⬆ Push
        </button>
      </div>

      {/* Modal for + edit */}
      <MobileEditModal
        open={!!selected}
        voter={selected}
        onClose={async (ok) => {
          setSelected(null);
          if (ok) await loadAll();
        }}
      />

      {/* PWA prompt kept */}
      <PWAInstallPrompt bottom={96} />

      {/* Footer stats like your old UI (male/female from current visible window) */}
      <footer
        className="footer-bar"
        style={{
          position: "sticky",
          bottom: 0,
          background: "var(--panel,#fff)",
          borderTop: "1px solid var(--hairline,#e5e7eb)",
          padding: "8px 12px",
          zIndex: 4,
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className="badge badge--muted">Male: <strong>{male}</strong></span>
            <span className="badge badge--muted">Female: <strong>{female}</strong></span>
            <span className="badge badge--accent">Visible: <strong>{visible.length}</strong></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
