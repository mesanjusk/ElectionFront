// client/src/pages/Search.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import { clearToken } from "../auth";
import VoiceSearchButton from "../components/VoiceSearchButton.jsx";
import PWAInstallPrompt from "../components/PWAInstallPrompt.jsx";
import AdminUsers from "./AdminUsers.jsx"; // (kept if you show it elsewhere)
import "./Search.css";

// NEW: offline helpers
import { searchOffline, upsertVoters } from "../offline/db";

/* ---------- helpers for mixed EN/MR datasets ---------- */
const pick = (obj, keys) => {
  for (const k of keys) if (obj?.[k] !== undefined && obj?.[k] !== null) return obj[k];
  return "";
};
const getName = (r) =>
  pick(r, ["name", "Name"]) || pick(r?.__raw || {}, ["Name", "नाव", "नाव + मोबा/ ईमेल नं."]) || "—";
const getEPIC = (r) => pick(r, ["voter_id", "EPIC"]) || pick(r?.__raw || {}, ["EPIC", "कार्ड नं"]) || "";
const getPart = (r) => pick(r?.__raw || {}, ["भाग नं.", "Part No", "Part", "Booth"]) || (r?.Booth ?? "");
const getSerial = (r) => pick(r?.__raw || {}, ["अनु. नं.", "Serial No", "Serial", "Sr No"]) || "";
const getGender = (r) => {
  const g = (pick(r?.__raw || {}, ["Gender", "gender", "লিংগ", "लिंग"]) || r.gender || r.Gender || "")
    .toString()
    .toLowerCase();
  if (!g) return "";
  if (g.startsWith("m") || g.includes("पुरुष")) return "M";
  if (g.startsWith("f") || g.includes("स्त्री")) return "F";
  return g.toUpperCase();
};
const getAge = (r) => (pick(r?.__raw || {}, ["Age", "age", "वय"]) || r.Age || r.age || "").toString();

/* Only read phone from DB fields (NOT from __raw). This avoids showing guessed numbers. */
const getDBPhone = (r) => {
  const fromDb = pick(r, ["mobile", "Mobile", "phone", "Phone", "contact", "Contact"]) || "";
  const d = String(fromDb).replace(/[^\d]/g, "");
  if (!d) return "";
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  return d.length === 10 ? d : "";
};

const normalizePhoneInput = (raw) => {
  if (!raw) return "";
  let d = String(raw).replace(/[^\d]/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? d : "";
};

const getId = (r) => r?._id || r?.id || r?.__raw?._id || r?.__raw?.id || "";

/* ---------- small util: normalize axios/network errors ---------- */
function getReadableError(err) {
  if (err?.isAxiosError) {
    if (err.response) {
      const code = err.response.status;
      const msg =
        (err.response.data && (err.response.data.message || err.response.data.error)) ||
        `Server responded with ${code}`;
      return `${msg}`;
    }
    if (err.request) return "Network error: cannot reach API (check internet / base URL / CORS).";
    return err.message || "Request error.";
  }
  if (typeof err?.message === "string") return err.message;
  return "Something went wrong while fetching results.";
}

/* ---------- Small phone editor modal ---------- */
function PhoneModal({ open, onClose, initialValue, onSave }) {
  const [val, setVal] = useState(initialValue || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setVal(initialValue || "");
      setErr("");
    }
  }, [open, initialValue]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Edit mobile"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
    >
      <div
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel, #fff)",
          color: "inherit",
          width: "min(380px, 92vw)",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="modal-header" style={{ padding: "10px 14px", borderBottom: "1px solid var(--hairline,#e5e7eb)" }}>
          <strong>{initialValue ? "Edit mobile" : "Add mobile"}</strong>
        </div>
        <div className="modal-body" style={{ padding: 14 }}>
          <label className="field" style={{ width: "100%" }}>
            <span className="field__label">Mobile (India, 10 digits)</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder="e.g. 9876543210"
              value={val}
              onChange={(e) => setVal(e.target.value)}
            />
          </label>
          {err ? (
            <div className="alert alert--error" style={{ marginTop: 8 }}>
              <span aria-hidden>⚠️</span>
              <span style={{ marginLeft: 6 }}>{err}</span>
            </div>
          ) : null}
        </div>
        <div
          className="modal-footer"
          style={{ padding: 10, borderTop: "1px solid var(--hairline,#e5e7eb)", display: "flex", justifyContent: "flex-end", gap: 8 }}
        >
          <button className="btn btn--subtle" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--primary"
            type="button"
            disabled={saving}
            onClick={async () => {
              setErr("");
              const normalized = normalizePhoneInput(val);
              if (!normalized) {
                setErr("Enter a valid 10-digit mobile.");
                return;
              }
              try {
                setSaving(true);
                await onSave(normalized);
              } catch (e) {
                setErr(getReadableError(e));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Full record modal ---------- */
function RecordModal({ open, onClose, record }) {
  if (!open) return null;
  const data = record?.__raw || record || {};
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Full record"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel, #fff)",
          color: "inherit",
          width: "min(960px, 92vw)",
          maxHeight: "86vh",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="modal-header" style={{ padding: "12px 16px", borderBottom: "1px solid var(--hairline,#e5e7eb)" }}>
          <strong>Full record</strong>
        </div>
        <div className="modal-body" style={{ padding: 16, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 13 }}>{JSON.stringify(data, null, 2)}</pre>
        </div>
        <div className="modal-footer" style={{ padding: 12, borderTop: "1px solid var(--hairline,#e5e7eb)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn--subtle" type="button" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- single result card ---------- */
function ResultCard({ r, index, page, limit, onOpen, onPhoneSaved }) {
  const name = getName(r);
  const epic = getEPIC(r);
  const part = getPart(r);
  const serial = getSerial(r);
  const gender = getGender(r);
  const age = getAge(r);
  const dbPhone = getDBPhone(r); // ONLY DB phone
  const tag = gender ? `${gender}${age ? "-" + age : ""}` : age || "—";

  const [phoneModalOpen, setPhoneModalOpen] = useState(false);

  const handleCardKey = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen?.(r);
    }
  };

  const handleSavePhone = async (normalized) => {
    const id = getId(r);
    const epicVal = getEPIC(r);

    const tryPaths = id
      ? [{ url: `/api/voters/${id}`, body: { mobile: normalized } }]
      : epicVal
      ? [{ url: `/api/voters/by-epic/${encodeURIComponent(epicVal)}`, body: { mobile: normalized } }]
      : [];

    if (!tryPaths.length) throw new Error("Record id/EPIC not found; cannot update.");

    let success = false;
    let lastErr = null;
    for (const p of tryPaths) {
      try {
        const { data } = await api.patch(p.url, p.body);
        onPhoneSaved?.(index, normalized, data);
        success = true;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!success) throw lastErr || new Error("Update failed");
    setPhoneModalOpen(false);
  };

  return (
    <article
      className="result-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(r)}
      onKeyDown={handleCardKey}
      style={{ position: "relative" }}
    >
      {/* Top-right + icon (always visible for add/edit); does NOT open record modal */}
      <button
        type="button"
        className="icon-button"
        aria-label={dbPhone ? "Edit mobile" : "Add mobile"}
        title={dbPhone ? "Edit mobile" : "Add mobile"}
        onClick={(e) => {
          e.stopPropagation();
          setPhoneModalOpen(true);
        }}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: "var(--panel, #fff)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        +
      </button>

      {/* Round phone icon if DB number present (does NOT open record modal) */}
      {dbPhone ? (
        <a
          href={`tel:${dbPhone}`}
          onClick={(e) => e.stopPropagation()}
          className="round-phone"
          aria-label={`Call ${dbPhone}`}
          title={`Call ${dbPhone}`}
          style={{
            position: "absolute",
            top: 8,
            right: 44,
            width: 28,
            height: 28,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: "var(--accent, #10b981)",
            color: "#fff",
            textDecoration: "none",
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          📞
        </a>
      ) : null}

      <div className="result-card__header">
        <span className="result-card__index">{(page - 1) * limit + index + 1}</span>
        <div className="result-card__pills">
          {part && <span className="badge badge--muted">भाग {part}</span>}
          {serial && <span className="badge badge--muted">अनु {serial}</span>}
          {tag && <span className="badge badge--accent">{tag}</span>}
        </div>
      </div>

      <h3 className="result-card__title">{name}</h3>

      {epic ? (
        <p className="result-card__epic">
          EPIC: <strong>{epic}</strong>
        </p>
      ) : null}

      {/* Small phone editor modal */}
      <PhoneModal
        open={phoneModalOpen}
        onClose={() => setPhoneModalOpen(false)}
        initialValue={dbPhone}
        onSave={handleSavePhone}
      />
    </article>
  );
}

/* ---------- click-outside helper for menu ---------- */
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

/* ==================== MAIN PAGE (OFFLINE-FIRST) ==================== */
export default function Search() {
  // Search + UI state
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loadingOffline, setLoadingOffline] = useState(false);
  const [loadingOnline, setLoadingOnline] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  // page index used only for index display
  const [page] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);

  const [voiceLang, setVoiceLang] = useState("mr-IN");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setMenuOpen(false));

  const trimmedQuery = q.trim();
  const shouldSearch = trimmedQuery.length >= 2;

  const openRecord = (record) => {
    setSelectedRecord(record);
    setModalOpen(true);
  };
  const closeRecord = () => {
    setModalOpen(false);
    setSelectedRecord(null);
  };

  /* ------------ 1) OFFLINE instant results from IndexedDB ------------ */
  const doOfflineSearch = useCallback(async () => {
    setErrMsg("");
    if (!shouldSearch) {
      setRows([]);
      setTotal(0);
      return;
    }
    setLoadingOffline(true);
    try {
      const res = await searchOffline({ q: trimmedQuery, page: 1, limit });
      const items = res?.items || [];
      setRows(items);
      setTotal(items.length); // offline count for the page; total unknown without full scan
    } catch (err) {
      // do not block UI; just show message
      setErrMsg(getReadableError(err));
      setRows([]);
      setTotal(0);
    } finally {
      setLoadingOffline(false);
    }
  }, [shouldSearch, trimmedQuery, limit]);

  /* ------------ 2) ONLINE refresh (if connected) ------------ */
  const doOnlineRefresh = useCallback(async () => {
    if (!shouldSearch || !navigator.onLine) return;
    setLoadingOnline(true);
    try {
      const { data } = await api.get("/api/voters/search", {
        params: { q: trimmedQuery, page: 1, limit },
      });
      const fresh = data?.items || data?.results || data || [];
      if (Array.isArray(fresh) && fresh.length) {
        await upsertVoters(fresh); // keep cache warm
        setRows(fresh);
        setTotal(typeof data?.total === "number" ? data.total : fresh.length);
      }
    } catch (err) {
      // Ignore network errors; offline results are already shown
      // Optionally display a subtle hint:
      // setErrMsg(prev => prev || getReadableError(err));
    } finally {
      setLoadingOnline(false);
    }
  }, [shouldSearch, trimmedQuery, limit]);

  // Debounced trigger when query changes
  useEffect(() => {
    const t = setTimeout(() => {
      doOfflineSearch().then(() => doOnlineRefresh());
    }, 200);
    return () => clearTimeout(t);
  }, [doOfflineSearch, doOnlineRefresh, trimmedQuery]);

  // Gender counts from current rows
  const male = rows.reduce((n, r) => (getGender(r) === "M" ? n + 1 : n), 0);
  const female = rows.reduce((n, r) => (getGender(r) === "F" ? n + 1 : n), 0);

  const logout = () => {
    clearToken();
    window.location.href = "/login";
  };

  // Merge updated phone into UI row (and mirror __raw keys commonly used)
  const handlePhoneSaved = (rowIndex, newMobile, serverData) => {
    setRows((prev) => {
      const next = [...prev];
      const current = { ...(next[rowIndex] || {}) };
      current.mobile = newMobile;
      current.Mobile = newMobile;
      current.phone = newMobile;
      current.Phone = newMobile;
      if (current.__raw) {
        current.__raw.Mobile = newMobile;
        current.__raw["Mobile No"] = newMobile;
        current.__raw["मोबाइल"] = newMobile;
        current.__raw["Contact"] = newMobile;
      }
      if (serverData && typeof serverData === "object") {
        Object.assign(current, serverData);
      }
      next[rowIndex] = current;
      return next;
    });
  };

  const subtitle = useMemo(() => {
    if (loadingOffline) return "Loading offline…";
    if (loadingOnline) return "Refreshing from server…";
    return "";
  }, [loadingOffline, loadingOnline]);

  return (
    <div className="app-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ---------- TOP NAVBAR with Search ---------- */}
      <header className="top-bar" style={{ position: "sticky", top: 0, zIndex: 50 }}>
        <div className="top-bar__group">
          {/* Toggle menu */}
          <div style={{ position: "relative" }}>
            <button
              className="icon-button"
              type="button"
              aria-label="Open menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span aria-hidden>☰</span>
            </button>

            {menuOpen && (
              <div
                ref={menuRef}
                className="menu-sheet"
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 6,
                  minWidth: 200,
                  background: "var(--panel,#fff)",
                  color: "inherit",
                  borderRadius: 10,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                  padding: 10,
                }}
              >
                <div style={{ padding: "6px 6px 10px" }}>
                  <label className="field" style={{ width: "100%" }}>
                    <span className="field__label"></span>
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
                  <button className="btn btn--subtle" type="button" onClick={logout} aria-label="Sign out">
                    Logout ⎋
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SEARCH bar */}
        <div
          className="top-bar__group"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            justifyContent: "flex-end",
          }}
        >
          <label className="sr-only" htmlFor="search-query">
            Search voters
          </label>

          <input
            id="search-query"
            className="input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, EPIC or phone"
            autoComplete="off"
            style={{ width: "60%", minWidth: 220 }}
          />

          {/* Voice */}
          <div style={{ width: "10%", minWidth: 40, display: "flex", justifyContent: "center" }}>
            <VoiceSearchButton
              onResult={setQ}
              lang={voiceLang}
              className="icon-button"
              disabled={loadingOffline || loadingOnline}
            />
          </div>

          {/* Clear */}
          <button
            className="icon-button"
            type="button"
            onClick={() => setQ("")}
            disabled={!q}
            aria-label="Clear search"
            style={{ width: "10%", minWidth: 40 }}
          >
            ✖
          </button>
        </div>
      </header>

      {/* ---------- MAIN CONTENT (records) ---------- */}
      <main className="app-content" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <section className="panel search-panel" aria-labelledby="search-panel-title" style={{ paddingBottom: 8 }}>
          <div className="panel__header" style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <h1 className="panel__title" id="search-panel-title">
              {/* blank to save vertical space */}
            </h1>
            {subtitle ? <span style={{ fontSize: 12, opacity: 0.7 }}>— {subtitle}</span> : null}
          </div>

          {errMsg ? (
            <div className="alert alert--error" role="alert">
              <span aria-hidden>⚠️</span>
              <span>{errMsg}</span>
            </div>
          ) : null}
        </section>

        <section style={{ flex: 1, minHeight: 0 }}>
          <div className="results-list">
            {rows.map((r, i) => (
              <ResultCard
                key={r.id || i}
                r={r}
                index={i}
                page={page}
                limit={limit}
                onOpen={openRecord}
                onPhoneSaved={handlePhoneSaved}
              />
            ))}
            {!rows.length && shouldSearch && !loadingOffline && !loadingOnline && !errMsg && (
              <div className="empty-state">No results yet. Try refining your search.</div>
            )}
          </div>
        </section>
      </main>

      {/* ---------- FOOTER: breakdown ---------- */}
      <footer
        className="footer-bar"
        style={{
          position: "sticky",
          bottom: 0,
          background: "var(--panel,#fff)",
          borderTop: "1px solid var(--hairline,#e5e7eb)",
          padding: "8px 12px",
          zIndex: 40,
        }}
      >
        <div
          className="footer-row"
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          {/* Left: result breakdown */}
          <div className="stats-inline" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="badge badge--muted">
              Male: <strong>{male}</strong>
            </span>
            <span className="badge badge--muted">
              Female: <strong>{female}</strong>
            </span>
            <span className="badge badge--accent">
              Total: <strong>{total}</strong>
            </span>
            <span className="meta-row__count" style={{ marginLeft: 6 }}>
              {loadingOffline || loadingOnline ? "Searching…" : ""}
            </span>
          </div>
        </div>
      </footer>

      <PWAInstallPrompt bottom={96} />

      {/* Modal for full record */}
      <RecordModal open={modalOpen} onClose={closeRecord} record={selectedRecord} />
    </div>
  );
}
