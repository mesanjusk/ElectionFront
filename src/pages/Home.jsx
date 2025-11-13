// src/pages/Home.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getUser,
  getAvailableDatabases,
  getActiveDatabase,
  setActiveDatabase,
} from '../auth';
import { pullAll, resetSyncState } from '../services/sync';

export default function Home() {
  const [q, setQ] = useState('');
  const [databases, setDatabases] = useState(() => getAvailableDatabases());
  const [activeDb, setActiveDb] = useState(() => getActiveDatabase());
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const navigate = useNavigate();

  const user = useMemo(() => getUser(), []);

  // Pick the single assigned DB (no UI to change)
  const assignedDb = useMemo(() => {
    if (!databases || databases.length === 0) return null;
    if (databases.length === 1) return databases[0];
    const current = databases.find((db) => (db.id || db._id) === activeDb);
    return current || databases[0];
  }, [databases, activeDb]);

  const assignedId = assignedDb ? (assignedDb.id || assignedDb._id) : '';
  const assignedName =
    assignedDb
      ? (assignedDb.name || assignedDb.title || assignedDb.label || `Database ${assignedId}`)
      : null;

  // Load DBs & restore last sync count on mount
  useEffect(() => {
    const dbs = getAvailableDatabases();
    setDatabases(dbs);

    const existingActive = getActiveDatabase();
    if (!existingActive && dbs && dbs.length === 1) {
      const id = dbs[0].id || dbs[0]._id;
      setActiveDatabase(id);
      setActiveDb(id);
      // try read last count
      const cached = Number(localStorage.getItem(`lastSyncCount:${id}`) || 0);
      setTotalCount(Number.isFinite(cached) ? cached : 0);
    } else {
      const id = existingActive || (dbs[0] && (dbs[0].id || dbs[0]._id)) || '';
      setActiveDb(id);
      const cached = Number(localStorage.getItem(`lastSyncCount:${id}`) || 0);
      setTotalCount(Number.isFinite(cached) ? cached : 0);
    }
  }, []);

  // Keep count updated when assigned DB changes
  useEffect(() => {
    if (!assignedId) return;
    const cached = Number(localStorage.getItem(`lastSyncCount:${assignedId}`) || 0);
    setTotalCount(Number.isFinite(cached) ? cached : 0);
  }, [assignedId]);

  const syncAssigned = async () => {
    if (!assignedDb) {
      setSyncMessage('No voter database is assigned to your account.');
      return;
    }
    const id = assignedDb.id || assignedDb._id;
    setSyncing(true);
    setSyncMessage('');
    try {
      if (activeDb !== id) {
        setActiveDatabase(id);
        setActiveDb(id);
      }
      await resetSyncState(id);
      const total = await pullAll({ databaseId: id });
      // cache the latest count for dashboard
      localStorage.setItem(`lastSyncCount:${id}`, String(total || 0));
      setTotalCount(total || 0);
      setSyncMessage(`Synced ${total} voter records from your assigned database.`);
    } catch (e) {
      setSyncMessage(`Sync failed: ${e?.message || e}`);
    } finally {
      setSyncing(false);
    }
  };

  const goSearch = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q.trim());
    params.set('page', '1');
    params.set('limit', '20');
    navigate(`/search?${params.toString()}`);
  };

  // --- Tiny bar chart (no external libs) ---
  const chartData = [
    { label: 'Total', value: totalCount },
  ];
  const maxVal = Math.max(...chartData.map(d => d.value), 10);
  const barColor = '#2f67ff';

  return (
    <div className="page-shell">
      <div className="page-container">
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h1 className="section-heading">Candidate Dashboard</h1>
              <p className="section-subtext">Track your assigned voters and jump back into search.</p>
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.9rem', color: 'var(--muted-dark)' }}>
              <div>
                Hello, <strong>{user?.username || 'User'}</strong>
              </div>
              <div>
                DB: <strong>{assignedName || '—'}</strong>
              </div>
            </div>
          </div>

          <section className="glass-panel" style={{ padding: '24px', boxShadow: 'none' }}>
            <h2 className="section-heading" style={{ fontSize: '1.4rem' }}>
              Voter records — {assignedName || 'N/A'}
            </h2>
            <p className="section-subtext">Last synced total count shown below.</p>
            <div
              style={{
                position: 'relative',
                height: 260,
                marginTop: 24,
                borderRadius: 24,
                background: 'linear-gradient(180deg, rgba(16,185,129,0.12), #fff)',
                padding: 24,
                overflow: 'hidden',
              }}
            >
              {[0.25, 0.5, 0.75].map((g) => (
                <div
                  key={g}
                  style={{
                    position: 'absolute',
                    left: 24,
                    right: 24,
                    bottom: `${g * 100}%`,
                    borderTop: '1px dashed rgba(16,185,129,0.3)',
                  }}
                />
              ))}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  gap: 40,
                  paddingBottom: 24,
                }}
              >
                {chartData.map((d) => {
                  const h = Math.round((d.value / maxVal) * 200);
                  return (
                    <div key={d.label} style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          width: 56,
                          height: h,
                          borderRadius: 20,
                          background: 'linear-gradient(180deg, #34d399, #0fb981)',
                          margin: '0 auto 8px',
                          transition: 'height 0.3s ease',
                        }}
                      />
                      <div style={{ fontWeight: 600 }}>{d.label}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{d.value.toLocaleString()}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="section-subtext" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--brand)' }} /> value
            </p>
          </section>

          <section className="glass-panel" style={{ padding: '24px', boxShadow: 'none' }}>
            <h2 className="section-heading" style={{ fontSize: '1.4rem' }}>
              Assigned voter access
            </h2>
            <p className="section-subtext" style={{ marginBottom: 16 }}>
              {assignedDb
                ? 'Your device is restricted to your assigned voter database.'
                : 'No voter database is assigned to your account. Please contact the administrator.'}
            </p>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Voter database
            </div>
            <div
              style={{
                margin: '8px 0 20px',
                borderRadius: 20,
                border: '1px dashed rgba(15,23,42,0.2)',
                padding: '12px 16px',
                background: 'rgba(15,23,42,0.02)',
                fontWeight: 600,
              }}
            >
              {assignedName || '—'}
            </div>
            <button className="btn btn--primary" type="button" onClick={syncAssigned} disabled={syncing || !assignedDb}>
              {syncing ? 'Syncing…' : 'Sync assigned voters'}
            </button>
            {syncMessage && (
              <p className="section-subtext" style={{ marginTop: 12 }}>
                {syncMessage}
              </p>
            )}
          </section>

          <section className="card-grid">
            <button type="button" onClick={() => navigate('/search')} className="glass-pill">
              <span style={{ fontSize: '1.2rem' }}>🔎</span>
              <strong>Voter Search</strong>
              <p className="section-subtext">Find voters by name or EPIC (within assigned DB).</p>
            </button>
            <button type="button" onClick={() => alert('Volunteer Quiz – coming soon')} className="glass-pill">
              <span style={{ fontSize: '1.2rem' }}>💛</span>
              <strong>Volunteer Quiz</strong>
              <p className="section-subtext">Train volunteers with quick MCQs.</p>
            </button>
            <button type="button" onClick={() => alert('Constituency GK – coming soon')} className="glass-pill">
              <span style={{ fontSize: '1.2rem' }}>📍</span>
              <strong>Constituency GK</strong>
              <p className="section-subtext">Quick facts about your area.</p>
            </button>
          </section>

          <section className="glass-panel" style={{ padding: '24px', boxShadow: 'none' }}>
            <h2 className="section-heading" style={{ fontSize: '1.4rem' }}>Quick Search</h2>
            <p className="section-subtext">Search by name or EPIC within your assigned database.</p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) auto',
                gap: 16,
                alignItems: 'end',
                marginTop: 16,
              }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted-dark)' }}>Search term</span>
                <input
                  className="input-field"
                  placeholder="Start typing a name or EPIC"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <button className="btn btn--primary" type="button" onClick={goSearch}>
                Go to results
              </button>
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}
