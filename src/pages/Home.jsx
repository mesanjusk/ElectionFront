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
  const navigate = useNavigate();

  const user = useMemo(() => getUser(), []);

  useEffect(() => {
    setDatabases(getAvailableDatabases());
    setActiveDb(getActiveDatabase());
  }, []);

  const onDatabaseChange = (id) => {
    setActiveDatabase(id);
    setActiveDb(id);
    setSyncMessage('');
  };

  const syncAssigned = async () => {
    if (!activeDb) {
      alert('Select a voter database first.');
      return;
    }
    setSyncing(true);
    setSyncMessage('');
    try {
      await resetSyncState(activeDb);
      const total = await pullAll({ databaseId: activeDb });
      setSyncMessage(`Synced ${total} voter records from database ${activeDb}.`);
    } catch (e) {
      setSyncMessage(`Sync failed: ${e?.message || e}`);
    } finally {
      setSyncing(false);
    }
  };

  const goSearch = (booth = '') => {
    const params = new URLSearchParams();
    if (q) params.set('q', q.trim());
    if (booth) params.set('booth', booth);
    params.set('page', '1');
    params.set('limit', '20');
    navigate(`/search?${params.toString()}`);
  };

  return (
    <div className="page page--center">
      <div className="card" style={{ gap: '1.75rem', textAlign: 'center' }}>
        <div className="brand brand--center">
          <span className="brand__mark">EV</span>
          <div>
            <span className="brand__title">Election Vision</span>
            <p className="help-text">Field-ready voter lookup</p>
          </div>
        </div>
        {databases.length > 0 && (
          <section className="panel" style={{ textAlign: 'left', gap: '1rem' }}>
            <div className="panel__header">
              <h2 className="panel__title">Assigned voter access</h2>
              <p className="panel__subtitle">
                {user?.role === 'admin'
                  ? 'Preview your assigned voter databases or switch to test specific regions.'
                  : 'Choose the voter database assigned to you and pull only those records to your device.'}
              </p>
            </div>
            <label className="field">
              <span className="field__label">Voter database</span>
              <select
                className="select"
                value={activeDb || ''}
                onChange={(e) => onDatabaseChange(e.target.value)}
                disabled={syncing}
              >
                <option value="" disabled>
                  Select a database
                </option>
                {databases.map((db) => {
                  const id = db.id || db._id;
                  const name = db.name || db.title || db.label || `Database ${id}`;
                  return (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </label>
            <button className="btn btn--primary" type="button" onClick={syncAssigned} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync assigned voters'}
            </button>
            {syncMessage && <p className="help-text">{syncMessage}</p>}
          </section>
        )}

        <div className="panel__header">
          <h1 className="panel__title">Find voters instantly</h1>
          <p className="panel__subtitle">
            Search by name, EPIC or booth to jump straight into the mobile-first roster.
          </p>
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
          <button className="btn btn--primary" type="button" onClick={() => goSearch()}>
            Go to results
          </button>
        </div>

        <div className="form-grid">
          <span className="help-text">Quick booth filters</span>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {[12, 30, 45, 58].map((booth) => (
              <button
                key={booth}
                type="button"
                className="btn btn--ghost"
                onClick={() => goSearch(String(booth))}
              >
                Booth {booth}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
