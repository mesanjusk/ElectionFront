// client/src/pages/Search.jsx
import React, { useEffect, useState } from 'react';
import { setAuthToken } from '../services/api';
import { searchLocal, pullAll, pushOutbox, updateVoterLocal } from '../services/sync';
import './Search.css';

function MobileEditModal({ open, onClose, voter }) {
  const [mobile, setMobile] = useState(voter?.mobile || '');

  useEffect(() => {
    setMobile(voter?.mobile || '');
  }, [voter]);

  if (!open) return null;
  return (
    <div className="modal">
      <div className="card">
        <h4>Edit Mobile</h4>
        <p>{voter?.name} ({voter?.voter_id})</p>
        <input value={mobile} onChange={e=>setMobile(e.target.value)} placeholder="Mobile number" />
        <div className="row">
          <button onClick={() => onClose(false)}>Cancel</button>
          <button
            onClick={async () => {
              await updateVoterLocal(voter._id, { mobile });
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

export default function Search() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) setAuthToken(token);
  }, []);

  async function doSearch() {
    const data = await searchLocal({ q, limit });
    setRows(data);
  }

  useEffect(() => { doSearch(); }, [q, limit]);

  return (
    <div style={{ padding: 16 }}>
      <h2>Offline Search</h2>
      <div className="toolbar">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by name or EPIC (offline)" />
        <select value={limit} onChange={e=>setLimit(parseInt(e.target.value,10))}>
          <option value={50}>50</option>
          <option value={200}>200</option>
          <option value={1000}>1000</option>
        </select>
        <button disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const count = await pullAll();
              alert(`Pulled ${count} changes from server.`);
              await doSearch();
            } catch (e) {
              alert('Pull failed: ' + e.message);
            } finally {
              setBusy(false);
            }
          }}>
          Pull (Server → Local)
        </button>
        <button disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await pushOutbox();
              const msg = `Pushed: ${res.pushed}` + (res.failed?.length ? `, Failed: ${res.failed.length}` : '');
              alert(msg);
              await doSearch();
            } catch (e) {
              alert('Push failed: ' + e.message);
            } finally {
              setBusy(false);
            }
          }}>
          Push (Local → Server)
        </button>
      </div>
      <div className="grid">
        {rows.map(r => (
          <div className="card" key={r._id}>
            <div className="card-top">
              <strong>{r.name || r.__raw?.Name || '—'}</strong>
              <button className="icon-btn" title="Edit mobile" onClick={()=>setSelected(r)}>＋</button>
            </div>
            <div>EPIC: {r.voter_id || r.__raw?.EPIC || '—'}</div>
            <div>Mobile: {r.mobile ? <span>📱 {r.mobile}</span> : <i>none</i>}</div>
            {r.booth ? <div>Booth: {r.booth}</div> : null}
          </div>
        ))}
      </div>
      <MobileEditModal
        open={!!selected}
        voter={selected}
        onClose={async (updated) => {
          setSelected(null);
          if (updated) await doSearch();
        }}
      />
    </div>
  );
}
