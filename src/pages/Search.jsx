// client/src/pages/Search.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api";
import { clearToken } from "../auth";
import VoiceSearchButton from "../components/VoiceSearchButton.jsx";
import PWAInstallPrompt from "../components/PWAInstallPrompt.jsx";
import AdminUsers from "./AdminUsers.jsx";
import "./Search.css";

/* ---------- helpers for mixed EN/MR datasets ---------- */
const pick = (obj, keys) => {
  for (const k of keys) if (obj?.[k] !== undefined && obj?.[k] !== null) return obj[k];
  return "";
};
const getName = (r) =>
  pick(r, ["name", "Name"]) || pick(r.__raw, ["Name", "नाव", "नाव + मोबा/ ईमेल नं."]) || "—";
const getEPIC = (r) => pick(r, ["voter_id", "EPIC"]) || pick(r.__raw, ["EPIC", "कार्ड नं"]) || "";
const getPart = (r) => pick(r.__raw, ["भाग नं.", "Part No", "Part", "Booth"]) || "";
const getSerial = (r) => pick(r.__raw, ["अनु. नं.", "Serial No", "Serial", "Sr No"]) || "";
const getGender = (r) => {
  const g = (pick(r.__raw, ["Gender", "gender", "लिंग"]) || r.gender || r.Gender || "")
    .toString()
    .toLowerCase();
  if (!g) return "";
  if (g.startsWith("m") || g.includes("पुरुष")) return "M";
  if (g.startsWith("f") || g.includes("स्त्री")) return "F";
  return g.toUpperCase();
};
const getAge = (r) => (pick(r.__raw, ["Age", "age", "वय"]) || r.Age || r.age || "").toString();

/* Phone extractor */
const getPhone = (r) => {
  const candidatesRaw =
    pick(r, ["mobile", "phone", "Mobile", "Phone", "contact", "Contact"]) ||
    pick(r.__raw, [
      "mobile",
      "phone",
      "Mobile",
      "Phone",
      "Mobile No",
      "Contact No",
      "Contact",
      "मोबाइल",
      "मोबा",
      "मोबा/ ईमेल नं.",
      "संपर्क",
    ]) ||
    "";

  const extraPool = Object.values(r.__raw || {})
    .filter((v) => typeof v === "string")
    .join(" ");
  const pool = [String(candidatesRaw), extraPool].join(" | ");

  const matches = pool.match(/(?:\+?91[-\s]*)?(\d[\d\s\-]{8,16}\d)/g) || [];
  const cleaned = matches
    .map((m) => m.replace(/[^\d]/g, ""))
    .map((d) => {
      if (d.length === 12 && d.startsWith("91")) return d.slice(2);
      return d;
    })
    .filter((d) => d.length === 10 || d.length === 11 || d.length === 12);

  const tenDigit = cleaned.find((d) => d.length === 10);
  return tenDigit || cleaned[0] || "";
};

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

/* ---------- Modal component ---------- */
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
        <div
          className="modal-header"
          style={{ padding: "12px 16px", borderBottom: "1px solid var(--hairline,#e5e7eb)" }}
        >
          <strong>Full record</strong>
        </div>
        <div className="modal-body" style={{ padding: 16, overflow: "auto" }}>
          <pre style={{ margin: 0, fontSize: 13 }}>{JSON.stringify(data, null, 2)}</pre>
        </div>
        <div
          className="modal-footer"
          style={{
            padding: 12,
            borderTop: "1px solid var(--hairline,#e5e7eb)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button className="btn btn--subtle" type="button" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- single result card ---------- */
function ResultCard({ r, index, page, limit, onPasteToSearch, onOpen }) {
  const name = getName(r);
  const epic = getEPIC(r);
  const part = getPart(r);
  const serial = getSerial(r);
  const gender = getGender(r);
  const age = getAge(r);
  const phone = getPhone(r);
  const tag = gender ? `${gender}${age ? "-" + age : ""}` : age || "—";

  const copyToClipboard = async (text, e) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      console.debug("Copied to clipboard:", text);
    } catch {
      alert("Could not copy. Your browser may have blocked clipboard access.");
    }
  };

  const pasteIntoSearch = (e) => {
    e?.stopPropagation();
    if (typeof onPasteToSearch === "function" && phone) onPasteToSearch(phone);
  };

  const openDialer = (e) => {
    e?.stopPropagation();
    if (phone) window.location.href = `tel:${phone}`;
  };

  const handleCardKey = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen?.(r);
    }
  };

  return (
    <article
      className="result-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(r)}
      onKeyDown={handleCardKey}
    >
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

      {/* Phone actions (do not open modal) */}
      <div className="phone-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {phone ? (
          <>
            <button
              className="btn btn--primary"
              type="button"
              onClick={openDialer}
              aria-label={`Call ${phone}`}
              title="Call"
            >
              📞 {phone}
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={(e) => copyToClipboard(phone, e)}
              aria-label={`Copy ${phone}`}
              title="Copy to clipboard"
            >
              📋 Copy
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={pasteIntoSearch}
              aria-label={`Paste ${phone} into search`}
              title="Paste into search box"
            >
              ⎘ Paste
            </button>
          </>
        ) : (
          <span className="badge badge--muted">No phone</span>
        )}
      </div>
    </article>
  );
}

export default function Search() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const [voiceLang, setVoiceLang] = useState("mr-IN");

  const [filterKey, setFilterKey] = useState("");
  const [filterVal, setFilterVal] = useState("");
  const filters = useMemo(() => {
    const key = filterKey.trim();
    const value = filterVal.trim();
    if (!key || !value) return {};
    return { [key]: value };
  }, [filterKey, filterVal]);

  const trimmedQuery = q.trim();
  const shouldSearch = trimmedQuery.length >= 2 || Object.keys(filters).length > 0;

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const openRecord = (record) => {
    setSelectedRecord(record);
    setModalOpen(true);
  };
  const closeRecord = () => {
    setModalOpen(false);
    setSelectedRecord(null);
  };

  const runSearchOnline = useCallback(async () => {
    const params = { page, limit };
    if (trimmedQuery) params.q = trimmedQuery;
    Object.entries(filters).forEach(([k, v]) => (params[`filters[${k}]`] = v));
    const { data } = await api.get("/api/voters/search", { params });
    setRows(data.results || []);
    setTotal(data.total || 0);
  }, [filters, limit, page, trimmedQuery]);

  const search = useCallback(async () => {
    setLoading(true);
    setErrMsg("");
    try {
      await runSearchOnline();
    } catch (err) {
      console.error("Search failed:", err);
      setRows([]);
      setTotal(0);
      setErrMsg(getReadableError(err));
    } finally {
      setLoading(false);
    }
  }, [runSearchOnline]);

  useEffect(() => {
    if (!shouldSearch) {
      setLoading(false);
      setRows([]);
      setTotal(0);
      setErrMsg("");
      return;
    }
    const id = setTimeout(search, 240);
    return () => clearTimeout(id);
  }, [shouldSearch, search, trimmedQuery, filters]);

  useEffect(() => {
    setPage(1);
  }, [q, filterKey, filterVal]);

  const male = rows.reduce((n, r) => (getGender(r) === "M" ? n + 1 : n), 0);
  const female = rows.reduce((n, r) => (getGender(r) === "F" ? n + 1 : n), 0);

  const logout = () => {
    clearToken();
    window.location.href = "/login";
  };

  const handlePasteToSearch = (value) => setQ(value || "");

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar__group">
          <button className="icon-button" type="button" aria-label="Toggle menu">
            <span aria-hidden>☰</span>
          </button>
          <div className="brand">
            <span className="brand__mark">VS</span>
            <span className="brand__title">Voter Console</span>
          </div>
        </div>
        <div className="top-bar__group">
          <label className="sr-only" htmlFor="voice-lang">
            Voice search language
          </label>
          <select
            id="voice-lang"
            className="select select--compact"
            value={voiceLang}
            onChange={(e) => setVoiceLang(e.target.value)}
          >
            <option value="mr-IN">MR</option>
            <option value="hi-IN">HI</option>
            <option value="en-IN">EN</option>
          </select>
          <button className="icon-button" type="button" onClick={logout} aria-label="Sign out">
            <span aria-hidden>⎋</span>
          </button>
        </div>
      </header>

      <main className="app-content">
        <div className="app-content__main">
          <section className="panel search-panel" aria-labelledby="search-panel-title">
            <div className="panel__header">
              <h1 className="panel__title" id="search-panel-title">
                Search Voter Name
              </h1>
            </div>

            <div className="search-field">
              <div className="search-field__row">
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
                />
                <div className="search-field__actions">
                  <VoiceSearchButton onResult={setQ} lang={voiceLang} className="btn btn--ghost" disabled={loading} />
                  <button className="btn btn--subtle" type="button" onClick={() => setQ("")} disabled={!q}>
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {!shouldSearch && !loading && !errMsg && (
              <p className="help-text">Type at least two characters or add a filter to start searching.</p>
            )}

            {errMsg ? (
              <div className="alert alert--error" role="alert">
                <span aria-hidden>⚠️</span>
                <span>{errMsg}</span>
              </div>
            ) : null}

            <div className="filters-grid">
              <label className="field">
                <span className="field__label">Filter field</span>
                <input
                  className="input"
                  value={filterKey}
                  onChange={(e) => setFilterKey(e.target.value)}
                  placeholder="e.g. भाग नं."
                />
              </label>
              <label className="field">
                <span className="field__label">Filter value</span>
                <input
                  className="input"
                  value={filterVal}
                  onChange={(e) => setFilterVal(e.target.value)}
                  placeholder="e.g. 1"
                />
              </label>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={search}
                disabled={loading || !filterKey.trim() || !filterVal.trim()}
              >
                Apply filter
              </button>
            </div>

            <div className="meta-row">
              <div className="meta-row__per-page">
                <span>Results per page</span>
                <select
                  className="select select--compact"
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="meta-row__group">
                <span>Status:</span>
                <span className="meta-row__count">{loading ? "Searching…" : `Found ${total}`}</span>
              </div>
            </div>
          </section>

          <section className="panel results-panel" aria-live="polite">
            <div className="results-list">
              {rows.map((r, i) => (
                <ResultCard
                  key={i}
                  r={r}
                  index={i}
                  page={page}
                  limit={limit}
                  onPasteToSearch={handlePasteToSearch}
                  onOpen={openRecord}
                />
              ))}
              {!rows.length && shouldSearch && !loading && !errMsg && (
                <div className="empty-state">No results yet. Try refining your search.</div>
              )}
            </div>

            <nav className="pager" aria-label="Pagination">
              <button className="btn btn--subtle" type="button" onClick={() => setPage(1)} disabled={page <= 1}>
                ⏮ First
              </button>
              <button
                className="btn btn--subtle"
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ◀ Prev
              </button>
              <span className="pager__info">
                Page {page} of {pages}
              </span>
              <button
                className="btn btn--subtle"
                type="button"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
              >
                Next ▶
              </button>
              <button className="btn btn--subtle" type="button" onClick={() => setPage(pages)} disabled={page >= pages}>
                Last ⏭
              </button>
            </nav>
          </section>
        </div>

        <aside className="app-content__aside">
          <section className="panel stats-panel" aria-live="polite">
            <h2 className="stats-panel__title">Result breakdown</h2>
            <div className="stats-cards">
              <div className="stat-card">
                <span className="stat-card__label">Male</span>
                <span className="stat-card__value">{male}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Female</span>
                <span className="stat-card__value">{female}</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__label">Total</span>
                <span className="stat-card__value">{total}</span>
              </div>
            </div>
          </section>
        </aside>
      </main>

      <PWAInstallPrompt bottom={96} />

      {/* Modal for full record */}
      <RecordModal open={modalOpen} onClose={closeRecord} record={selectedRecord} />
    </div>
  );
}
