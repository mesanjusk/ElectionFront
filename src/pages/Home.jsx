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
    <div className="page page--center">
      <div className="card" style={{ gap: '1.25rem', width: 'min(1100px, 92vw)' }}>
        {/* Top header like screenshot */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="panel__title" style={{ margin: 0 }}>Candidate Dashboard</h1>
          <div className="help-text" style={{ textAlign: 'right' }}>
            <div> Hello, <strong>{user?.username || 'User'}</strong></div>
            <div> DB: <strong>{assignedName || '—'}</strong></div>
          </div>
        </div>

        {/* Chart Card */}
        <section
          className="panel"
          style={{
            padding: '1.25rem',
            borderRadius: '14px',
            background: '#fff',
          }}
        >
          <div className="panel__header" style={{ marginBottom: '0.75rem' }}>
            <h2 className="panel__title" style={{ margin: 0 }}>
              Voter Records — {assignedName || 'N/A'}
            </h2>
            <p className="panel__subtitle" style={{ marginTop: '0.25rem' }}>
              Last synced total count shown below.
            </p>
          </div>

          {/* Simple bars */}
          <div style={{ width: '100%', height: 320, padding: '8px 10px 18px', position: 'relative' }}>
            {/* grid lines */}
            {[0.25, 0.5, 0.75].map((g) => (
              <div
                key={g}
                style={{
                  position: 'absolute',
                  left: 0, right: 0,
                  bottom: `${g * 100}%`,
                  borderTop: '1px dashed #e5e7eb',
                }}
              />
            ))}
            <div style={{ display: 'flex', alignItems: 'end', gap: '26px', height: '100%' }}>
              {chartData.map((d) => {
                const h = Math.round((d.value / maxVal) * 260);
                return (
                  <div key={d.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div
                      title={`${d.value}`}
                      style={{
                        width: 60,
                        height: h,
                        background: barColor,
                        borderRadius: '10px 10px 4px 4px',
                        transition: 'height .25s ease',
                      }}
                    />
                    <div style={{ marginTop: 8, fontSize: 12, color: '#111827' }}>{d.label}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{d.value}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: 8, alignItems: 'center' }}>
            <span style={{
              width: 12, height: 12, background: barColor, borderRadius: 4, display: 'inline-block'
            }} />
            <span className="help-text">value</span>
          </div>
        </section>

        {/* Assigned section + Sync */}
        <section className="panel" style={{ textAlign: 'left', gap: '0.8rem' }}>
          <div className="panel__header">
            <h2 className="panel__title">Assigned voter access</h2>
            <p className="panel__subtitle">
              {assignedDb
                ? 'Your device is restricted to your assigned voter database.'
                : 'No voter database is assigned to your account. Please contact the administrator.'}
            </p>
          </div>

          <div className="field">
            <span className="field__label">Voter database</span>
            <div className="input" style={{ background: '#f6f6f6', cursor: 'not-allowed' }}>
              {assignedName || '—'}
            </div>
          </div>

          <button
            className="btn btn--primary"
            type="button"
            onClick={syncAssigned}
            disabled={syncing || !assignedDb}
          >
            {syncing ? 'Syncing…' : 'Sync assigned voters'}
          </button>
          {syncMessage && <p className="help-text">{syncMessage}</p>}
        </section>

        {/* Cards row like screenshot (3 clickable tiles) */}
        <section className="panel" style={{ background: 'transparent', boxShadow: 'none', padding: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '14px',
            }}
          >
            {/* Card 1: Voter Search */}
            <button
              type="button"
              onClick={() => navigate('/search')}
              className="panel"
              style={{
                textAlign: 'left',
                padding: '1rem',
                borderRadius: '14px',
                background: '#eef2ff',
                border: '1px solid #e5e7eb',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>🔎</div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Voter Search</div>
              <div className="help-text" style={{ marginTop: 6 }}>
                Find voters by name or EPIC (within assigned DB).
              </div>
            </button>

            {/* Card 2: Volunteer Quiz (mock) */}
            <button
              type="button"
              onClick={() => alert('Volunteer Quiz – coming soon')}
              className="panel"
              style={{
                textAlign: 'left',
                padding: '1rem',
                borderRadius: '14px',
                background: '#ecfdf5',
                border: '1px solid #e5e7eb',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>💛</div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Volunteer Quiz</div>
              <div className="help-text" style={{ marginTop: 6 }}>
                Train volunteers with quick MCQs.
              </div>
            </button>

            {/* Card 3: Constituency GK (mock) */}
            <button
              type="button"
              onClick={() => alert('Constituency GK – coming soon')}
              className="panel"
              style={{
                textAlign: 'left',
                padding: '1rem',
                borderRadius: '14px',
                background: '#fff7ed',
                border: '1px solid #e5e7eb',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>📍</div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Constituency GK</div>
              <div className="help-text" style={{ marginTop: 6 }}>
                Quick facts about your area.
              </div>
            </button>
          </div>
        </section>

        {/* Search inline (kept, as requested in screenshot replacement) */}
        <section className="panel" style={{ textAlign: 'left' }}>
          <div className="panel__header">
            <h2 className="panel__title">Quick Search</h2>
            <p className="panel__subtitle">Search by name or EPIC within your assigned database.</p>
          </div>
          <div className="form-grid" style={{ textAlign: 'left' }}>
            <label className="field">
              <span className="field__label">Search term</span>
              <input
                className="input"
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
      </div>
    </div>
  );
}
