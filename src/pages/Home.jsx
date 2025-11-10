// src/pages/Home.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();

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
