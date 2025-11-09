// client/src/pages/Search.jsx
import React, { useEffect, useMemo, useState } from "react";
import api from "../api";
import { clearToken } from "../auth";
import VoiceSearchButton from "../components/VoiceSearchButton.jsx";
import PWAInstallPrompt from "../components/PWAInstallPrompt.jsx";

/* ---------- helpers for mixed EN/MR datasets ---------- */
const pick = (obj, keys) => {
  for (const k of keys) if (obj?.[k] !== undefined && obj?.[k] !== null) return obj[k];
  return "";
};
const getName   = (r) => pick(r, ["name", "Name"]) || pick(r.__raw, ["Name","नाव","नाव + मोबा/ ईमेल नं."]) || "—";
const getEPIC   = (r) => pick(r, ["voter_id","EPIC"]) || pick(r.__raw, ["EPIC","कार्ड नं"]) || "";
const getPart   = (r) => pick(r.__raw, ["भाग नं.","Part No","Part","Booth"]) || "";
const getSerial = (r) => pick(r.__raw, ["अनु. नं.","Serial No","Serial","Sr No"]) || "";
const getGender = (r) => {
  const g = (pick(r.__raw, ["Gender","gender","लिंग"]) || r.gender || r.Gender || "").toString().toLowerCase();
  if (!g) return "";
  if (g.startsWith("m") || g.includes("पुरुष")) return "M";
  if (g.startsWith("f") || g.includes("स्त्री")) return "F";
  return g.toUpperCase();
};
const getAge    = (r) => (pick(r.__raw, ["Age","age","वय"]) || r.Age || r.age || "").toString();

/* ---------- single result card ---------- */
function ResultCard({ r, index, page, limit }) {
  const name   = getName(r);
  const epic   = getEPIC(r);
  const part   = getPart(r);
  const serial = getSerial(r);
  const gender = getGender(r);
  const age    = getAge(r);
  const tag    = gender ? `${gender}${age ? "-" + age : ""}` : (age || "—");

  return (
    <div style={st.card}>
      <div style={st.cardTopRow}>
        <div style={st.indexPill}>{(page - 1) * limit + index + 1}</div>
        <div style={st.idPills}>
          {part && <span style={st.pillMuted}>भाग {part}</span>}
          {serial && <span style={st.pillMuted}>अनु {serial}</span>}
          {tag && <span style={st.pill}>{tag}</span>}
        </div>
      </div>

      <div style={st.nameLine}>{name}</div>
      {epic ? <div style={st.epicLine}>EPIC: <strong>{epic}</strong></div> : null}

      <details style={st.details}>
        <summary style={st.viewBtn}>Details</summary>
        <pre style={st.json}>{JSON.stringify(r.__raw || r, null, 2)}</pre>
      </details>
    </div>
  );
}

export default function Search() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const [voiceLang, setVoiceLang] = useState("mr-IN");

  // simple equals filter
  const [filterKey, setFilterKey] = useState("");
  const [filterVal, setFilterVal] = useState("");
  const filters = useMemo(() => (filterKey && filterVal ? { [filterKey]: filterVal } : {}), [filterKey, filterVal]);

  const runSearchOnline = async () => {
    const params = { q, page, limit };
    Object.entries(filters).forEach(([k, v]) => (params[`filters[${k}]`] = v));
    const { data } = await api.get("/api/voters/search", { params });
    setRows(data.results || []);
    setTotal(data.total || 0);
  };

  const search = async () => {
    setLoading(true);
    try {
      await runSearchOnline();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const id = setTimeout(search, 220);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page, limit, filterKey, filterVal]);

  useEffect(() => setPage(1), [q, filterKey, filterVal]);

  const male   = rows.reduce((n, r) => (getGender(r) === "M" ? n + 1 : n), 0);
  const female = rows.reduce((n, r) => (getGender(r) === "F" ? n + 1 : n), 0);

  return (
    <div style={st.app}>
      {/* top app bar */}
      <div style={st.appbar}>
        <div style={st.appbarLeft}>
          <button style={st.iconButton} aria-label="menu">☰</button>
          <div style={st.brand}>Voter</div>
        </div>
        <div style={st.appbarRight}>
          <select value={voiceLang} onChange={(e)=>setVoiceLang(e.target.value)} style={st.langSelect}>
            <option value="mr-IN">MR</option>
            <option value="hi-IN">HI</option>
            <option value="en-IN">EN</option>
          </select>
          <button
            onClick={()=>{ clearToken(); location.href="/login"; }}
            style={st.iconButton}
            aria-label="logout"
          >⎋</button>
        </div>
      </div>

      {/* search area */}
      <div style={st.searchWrap}>
        <div style={st.searchBox}>
          <input
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            placeholder="Search by name / EPIC / mobile…"
            style={st.searchInput}
          />
          <div style={st.searchActions}>
            <VoiceSearchButton onResult={setQ} lang={voiceLang} />
            <button onClick={()=>setQ("")} style={st.clear}>✕</button>
          </div>
        </div>

        {/* filter chips */}
        <div style={st.filters}>
          <input
            value={filterKey}
            onChange={(e)=>setFilterKey(e.target.value)}
            placeholder="Field (e.g. भाग नं.)"
            style={st.chip}
          />
          <input
            value={filterVal}
            onChange={(e)=>setFilterVal(e.target.value)}
            placeholder="Value (e.g. 1)"
            style={st.chip}
          />
          <button onClick={search} style={st.primaryBtn}>Apply</button>
        </div>

        {/* page size / meta */}
        <div style={st.metaRow}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{opacity:.8}}>Per page</span>
            <select value={limit} onChange={(e)=>setLimit(parseInt(e.target.value,10))} style={st.pageSize}>
              {[10,20,50,100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{marginLeft:"auto", opacity:.9}}>
            {loading ? "Searching…" : `Found ${total}`}
          </div>
        </div>
      </div>

      {/* column strip */}
      <div style={st.listHead}>
        <span>#</span><span>Part</span><span>Sr</span><span>Name / EPIC</span><span>G/A</span>
      </div>

      {/* results */}
      <div style={st.list}>
        {rows.map((r, i) => (
          <ResultCard key={i} r={r} index={i} page={page} limit={limit} />
        ))}
        {!rows.length && !loading && <div style={st.empty}>No results</div>}
      </div>

      {/* pager */}
      <div style={st.pager}>
        <button onClick={()=>setPage(1)}              disabled={page<=1}    style={st.pBtn}>⏮</button>
        <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}    style={st.pBtn}>◀</button>
        <div style={st.pInfo}>Page {page}/{pages}</div>
        <button onClick={()=>setPage(p=>Math.min(pages,p+1))} disabled={page>=pages} style={st.pBtn}>▶</button>
        <button onClick={()=>setPage(pages)}          disabled={page>=pages} style={st.pBtn}>⏭</button>
      </div>

      {/* bottom stats */}
      <div style={st.bottom}>
        <div style={st.stat}><span>Male</span><strong>{male}</strong></div>
        <div style={st.stat}><span>Female</span><strong>{female}</strong></div>
        <div style={st.stat}><span>Total</span><strong>{total}</strong></div>
      </div>

      {/* Floating Install App */}
      <PWAInstallPrompt bottom={72} />
    </div>
  );
}

/* styles (same as before) */
const primary   = "#155EEF";
const primaryD  = "#0B4DB3";
const bg        = "#0F172A";
const bg2       = "#111827";
const surface   = "#FFFFFF";
const border    = "#E5E7EB";
const muted     = "#6B7280";
const pillBg    = "#EEF2FF";
const pillBr    = "#C7D2FE";

const st = {
  app: { minHeight:"100vh", display:"grid", gridTemplateRows:"auto auto 44px 1fr auto auto", background:"#F6F7FB", fontFamily:"Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" },
  appbar: { position:"sticky", top:0, zIndex:20, background:`linear-gradient(180deg, ${bg} 0%, ${bg2} 100%)`, color:"#fff", padding:"10px 12px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid rgba(255,255,255,0.08)" },
  appbarLeft: { display:"flex", alignItems:"center", gap:10 }, brand:{ fontWeight:800, letterSpacing:0.4 },
  appbarRight: { display:"flex", alignItems:"center", gap:8 },
  iconButton: { background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", borderRadius:10, padding:"6px 10px", fontSize:16 },
  langSelect: { appearance:"none", background:"transparent", color:"#fff", border:"1px solid rgba(255,255,255,0.25)", borderRadius:8, padding:"4px 10px", fontSize:12 },

  searchWrap: { background:surface, borderBottom:`1px solid ${border}`, padding:"12px 12px 8px", display:"grid", gap:10 },
  searchBox: { display:"grid", gridTemplateColumns:"1fr auto", gap:8 },
  searchInput: { border:`1px solid ${border}`, borderRadius:12, padding:"12px 14px", fontSize:15, background:"#fff" },
  searchActions: { display:"flex", alignItems:"center", gap:8 },
  clear: { background:"#FEE2E2", border:"1px solid #FECACA", color:"#991B1B", borderRadius:10, padding:"10px 12px", fontWeight:700 },

  filters: { display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:8 },
  chip: { border:`1px solid ${pillBr}`, background:pillBg, color:primaryD, borderRadius:12, padding:"10px 12px", fontSize:14 },
  primaryBtn: { background:"#E0EAFF", border:`1px solid ${pillBr}`, color:primaryD, borderRadius:12, padding:"10px 14px", fontWeight:700 },

  metaRow: { display:"flex", alignItems:"center", gap:10, fontSize:13 },
  pageSize: { border:`1px solid ${border}`, borderRadius:10, padding:"6px 10px", background:"#fff" },

  listHead: { position:"sticky", top:108, zIndex:10, display:"grid", gridTemplateColumns:"40px 54px 54px 1fr 64px", gap:8, padding:"6px 12px", background:"#F3F4F6", color:"#111827", fontWeight:700, fontSize:12, borderTop:`1px solid ${border}`, borderBottom:`1px solid ${border}` },
  list: { background: surface },

  card: { margin:"8px 12px", padding:"10px 12px", border:`1px solid ${border}`, borderRadius:12, background:"#fff", boxShadow:"0 1px 2px rgba(16,24,40,.04)" },
  cardTopRow: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 },
  indexPill: { background:"#EFF6FF", color:primaryD, border:`1px solid ${pillBr}`, borderRadius:999, padding:"2px 10px", fontWeight:700, fontSize:12 },
  idPills: { display:"flex", gap:6, flexWrap:"wrap" },
  pillMuted: { background:"#F1F5F9", color:"#334155", border:"1px solid #E2E8F0", borderRadius:999, padding:"2px 8px", fontSize:12 },
  pill: { background:"#DCFCE7", color:"#166534", border:"1px solid #BBF7D0", borderRadius:999, padding:"2px 8px", fontSize:12, fontWeight:700 },
  nameLine: { fontSize:16, fontWeight:800, color:"#0F172A", lineHeight:1.15 },
  epicLine: { marginTop:4, fontSize:13, color:muted },

  details: { marginTop:8 },
  viewBtn: { color:primary, cursor:"pointer", fontSize:13 },
  json: { marginTop:6, border:`1px solid ${border}`, background:"#F9FAFB", borderRadius:8, padding:8, fontSize:12, whiteSpace:"pre-wrap" },
  empty: { padding:20, textAlign:"center", color:muted },

  pager: { position:"sticky", bottom:52, zIndex:9, background:"#fff", borderTop:`1px solid ${border}`, display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:8 },
  pBtn: { padding:"8px 12px", borderRadius:10, border:`1px solid ${border}`, background:"#F8FAFC" },
  pInfo:{ fontSize:13, color:"#334155", minWidth:90, textAlign:"center" },

  bottom: { position:"sticky", bottom:0, zIndex:10, background:primaryD, color:"#fff", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", textAlign:"center", padding:"8px 0" },
  stat: { display:"grid", gap:2 },
};
