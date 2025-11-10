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
    <div className="container" style={{ maxWidth: 800, margin: '40px auto', padding: 16 }}>
      <h2>Voter Lookup (Offline Ready)</h2>
      <p>Type a name or EPIC (voter ID). Works offline once synced.</p>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          placeholder="Search name or EPIC…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, padding: 10, fontSize: 16 }}
        />
        <button onClick={() => goSearch()} style={{ padding: '10px 16px' }}>
          Search
        </button>
      </div>

      <div style={{ marginTop: 24 }}>
        <h4>Quick options</h4>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => goSearch('12')}>Booth 12</button>
          <button onClick={() => goSearch('30')}>Booth 30</button>
          <button onClick={() => goSearch('45')}>Booth 45</button>
          {/* Add your own useful shortcuts */}
        </div>
      </div>
    </div>
  );
}
