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

  const cardClass =
    'rounded-3xl border border-emerald-100 bg-white/90 p-6 shadow-lg shadow-emerald-900/5 backdrop-blur';
  const pillButton =
    'flex flex-col gap-2 rounded-3xl border border-slate-200/80 bg-white/80 p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-white';
  const primaryBtn =
    'inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-5 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className={`${cardClass} flex flex-col gap-6`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Candidate Dashboard</h1>
              <p className="text-sm text-slate-500">Track your assigned voters and jump back into search.</p>
            </div>
            <div className="text-right text-sm text-slate-500">
              <div>
                Hello, <span className="font-semibold text-slate-700">{user?.username || 'User'}</span>
              </div>
              <div>
                DB: <span className="font-semibold text-slate-700">{assignedName || '—'}</span>
              </div>
            </div>
          </div>

          <section className={cardClass}>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold text-slate-900">Voter records — {assignedName || 'N/A'}</h2>
              <p className="text-sm text-slate-500">Last synced total count shown below.</p>
            </div>
            <div className="relative mt-4 h-72 w-full overflow-hidden rounded-2xl bg-gradient-to-b from-emerald-50 to-white p-4">
              {[0.25, 0.5, 0.75].map((g) => (
                <div
                  key={g}
                  className="absolute left-4 right-4 border-t border-dashed border-emerald-100"
                  style={{ bottom: `${g * 100}%` }}
                />
              ))}
              <div className="absolute inset-0 flex items-end justify-center gap-10">
                {chartData.map((d) => {
                  const h = Math.round((d.value / maxVal) * 230);
                  return (
                    <div key={d.label} className="flex flex-col items-center gap-2">
                      <div
                        className="w-14 rounded-2xl bg-emerald-500/90"
                        style={{ height: `${h}px`, transition: 'height .3s ease' }}
                        title={`${d.value}`}
                      />
                      <div className="text-sm font-semibold text-slate-700">{d.label}</div>
                      <div className="text-xs text-slate-500">{d.value.toLocaleString()}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
              <span className="inline-flex h-3 w-3 rounded bg-emerald-500" /> value
            </div>
          </section>

          <section className={cardClass}>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold text-slate-900">Assigned voter access</h2>
              <p className="text-sm text-slate-500">
                {assignedDb
                  ? 'Your device is restricted to your assigned voter database.'
                  : 'No voter database is assigned to your account. Please contact the administrator.'}
              </p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Voter database</span>
              <div className="mt-2 w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 text-slate-700">
                {assignedName || '—'}
              </div>
            </div>
            <button className={primaryBtn} type="button" onClick={syncAssigned} disabled={syncing || !assignedDb}>
              {syncing ? 'Syncing…' : 'Sync assigned voters'}
            </button>
            {syncMessage && <p className="text-sm text-slate-500">{syncMessage}</p>}
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <button type="button" onClick={() => navigate('/search')} className={`${pillButton} from-indigo-50/80`}>
              <span className="text-sm text-slate-500">🔎</span>
              <span className="text-base font-semibold text-slate-900">Voter Search</span>
              <span className="text-sm text-slate-500">Find voters by name or EPIC (within assigned DB).</span>
            </button>
            <button type="button" onClick={() => alert('Volunteer Quiz – coming soon')} className={pillButton}>
              <span className="text-sm text-slate-500">💛</span>
              <span className="text-base font-semibold text-slate-900">Volunteer Quiz</span>
              <span className="text-sm text-slate-500">Train volunteers with quick MCQs.</span>
            </button>
            <button type="button" onClick={() => alert('Constituency GK – coming soon')} className={pillButton}>
              <span className="text-sm text-slate-500">📍</span>
              <span className="text-base font-semibold text-slate-900">Constituency GK</span>
              <span className="text-sm text-slate-500">Quick facts about your area.</span>
            </button>
          </section>

          <section className={cardClass}>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold text-slate-900">Quick Search</h2>
              <p className="text-sm text-slate-500">Search by name or EPIC within your assigned database.</p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="text-sm font-semibold text-slate-600">Search term</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-base text-slate-900 shadow-inner focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="Start typing a name or EPIC"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <button className={`${primaryBtn} md:self-end`} type="button" onClick={goSearch}>
                Go to results
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
