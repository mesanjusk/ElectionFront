// client/src/pages/Search.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { setAuthToken } from "../services/api";
import { lockSession } from "../auth";
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

// 💡 numeric age (null if not parseable)
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
    pick(r?.__raw, ["Gender", "gender", "लिंग", "লিংগ"]) ||
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
    <div className="sx-modal" onClick={() => onClose(false)}>
      <div className="sx-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="sx-dialog-head">
          <div className="sx-title">
            {getMobile(voter) ? "Edit mobile" : "Add mobile"}
          </div>
          <button className="sx-icon" onClick={() => onClose(false)}>
            ✕
          </button>
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
          <button className="sx-btn ghost" onClick={() => onClose(false)}>
            Cancel
          </button>
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

/* ---------------- Full Record Details modal ---------------- */
function RecordModal({ open, voter, onClose }) {
  if (!open || !voter) return null;
  const fields = [
    ["Name", getName(voter)],
    ["EPIC", getEPIC(voter)],
    ["R/P/S", getRPS(voter) || "—"],
    ["Part", getPart(voter) || "—"],
    ["Serial", !Number.isNaN(getSerialNum(voter)) ? getSerialNum(voter) : (getSerialText(voter) || "—")],
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
    <div className="sx-modal" onClick={() => onClose(false)}>
      <div className="sx-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="sx-dialog-head">
          <div className="sx-title">Record details</div>
          <button className="sx-icon" onClick={() => onClose(false)}>✕</button>
        </div>
        <div className="sx-dialog-body">
          {fields.map(([k, v]) => (
            <div className="sx-row" key={k}>
              <span className="sx-k">{k}</span>
              <span className="sx-v">{String(v)}</span>
            </div>
          ))}
          <textarea className="sx-textarea" readOnly value={shareText} />
        </div>
        <div className="sx-dialog-foot">
          <a className="sx-btn primary" href={waUrl} target="_blank" rel="noreferrer">
            Share on WhatsApp
          </a>
          <button className="sx-btn ghost" onClick={() => onClose(false)}>Close</button>
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

  const [voiceLang, setVoiceLang] = useState("mr-IN");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setMenuOpen(false));

  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all"); // ⭐ new filter tab: all | male | female | 18-35 | 35+
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

  // Apply text filter + tab filter together
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    const passesTab = (r) => {
      if (tab === "all") return true;
      if (tab === "male") return getGender(r) === "M";
      if (tab === "female") return getGender(r) === "F";
      if (tab === "18-35") {
        const a = getAgeNum(r);
        return a !== null && a >= 18 && a <= 35;
      }
      if (tab === "35+") {
        const a = getAgeNum(r);
        return a !== null && a >= 36;
      }
      return true;
    };

    const textMatch = (r) => {
      if (!term) return true;
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

    return allRows.filter((r) => textMatch(r) && passesTab(r));
  }, [q, tab, allRows]);

  // Reset window on search or tab change
  useEffect(() => setVisibleCount(200), [q, tab]);

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

  return (
    <div className="sx-page">
      {/* Top Appbar */}
      <header className="sx-appbar sx-appbar--single">
        <div className="sx-left">
          <button
            className="sx-appbar__icon"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
            type="button"
          >
            ☰
          </button>
          <span className="sx-username" title={userName}>{userName}</span>
        </div>

        <div className="sx-right">
          <button
            className="sx-appbar__action"
            type="button"
            aria-label="Pull"
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
            ⬇
          </button>
          <button
            className="sx-appbar__action"
            type="button"
            aria-label="Push"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await pushOutbox();
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
            }}
          >
            ⬆
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

      {/* Search bar */}
      <div className="sx-toolbar">
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

      {/* ⭐ Tab row (WhatsApp-style) */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          padding: "8px 12px",
          borderBottom: "1px solid #eee",
          background: "#fff",
          position: "sticky",
          top: 56, // just below the appbar height
          zIndex: 5,
        }}
      >
        {[
          { key: "all", label: "All" },
          { key: "male", label: "Male" },
          { key: "female", label: "Female" },
          { key: "18-35", label: "18–35" },
          { key: "35+", label: "35+" },
        ].map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                border: "none",
                background: active ? "#e8f0ff" : "transparent",
                color: active ? "#1f4cff" : "#374151",
                fontWeight: active ? 700 : 500,
                padding: "8px 12px",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <main className="sx-body sx-body--with-footer">
        <section className="sx-content">
          <div className="sx-cards sx-cards--compact">
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
                <div className="sx-card sx-card--readable" key={r._id || `${i}-${serialTxt}`}>
                  {/* Row 1: Serial · Age · Sex · Edit */}
                  <div className="sx-row-compact">
                    <div className="sx-serial-pill">
                      {!Number.isNaN(serialNum) ? serialNum : serialTxt || "—"}
                    </div>
                    <div className="sx-mini">{age ? `Age ${age}` : "Age —"}</div>
                    <div className="sx-mini">{gender || "—"}</div>
                    <button
                      className="sx-mini-btn"
                      onClick={(e) => { e.stopPropagation(); setSelected(r); }}
                      title={mob ? "Edit mobile" : "Add mobile"}
                      type="button"
                    >
                      ✎
                    </button>
                  </div>

                  {/* Row 2: Name + actions */}
                  <div className="sx-row-compact">
                    <button
                      className="sx-name-compact sx-name-button"
                      title={name}
                      onClick={() => setDetail(r)}
                      type="button"
                    >
                      {name}
                    </button>

                    {mob ? (
                      <>
                        <a
                          className="sx-mini-btn"
                          href={`tel:${mob}`}
                          onClick={(e) => e.stopPropagation()}
                          title={`Call ${mob}`}
                        >
                          📞
                        </a>
                        <a
                          className="sx-mini-btn"
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
                          className="sx-mini-btn"
                          href={waHref}
                          onClick={(e) => e.stopPropagation()}
                          title="Share to WhatsApp"
                        >
                          🟢
                        </a>
                        <button
                          className="sx-mini-btn"
                          title="Add mobile"
                          onClick={(e) => { e.stopPropagation(); setSelected(r); }}
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
          </div>

          <div ref={sentinelRef} className="sx-sentinel" />
        </section>
      </main>

      {/* Fixed bottom footer stats */}
      <footer className="sx-footer-stats sx-footer--one-row">
        <div className="sx-footer-stat"><span className="k">Male</span><strong className="v">{male.toLocaleString()}</strong></div>
        <div className="sx-footer-stat"><span className="k">Female</span><strong className="v">{female.toLocaleString()}</strong></div>
        <div className="sx-footer-stat"><span className="k">Total</span><strong className="v">{total.toLocaleString()}</strong></div>
        <div className="sx-footer-stat"><span className="k">Visible</span><strong className="v">{visibleTotal.toLocaleString()}</strong></div>
        <div className="sx-footer-stat"><span className="k">Matches</span><strong className="v">{matchedTotal.toLocaleString()}</strong></div>
        <div className="sx-footer-stat"><span className="k">Synced</span><strong className="v">{syncedTotal.toLocaleString()}</strong></div>
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

      <PWAInstallPrompt bottom={90} />
    </div>
  );
}
