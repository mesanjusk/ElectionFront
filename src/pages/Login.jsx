import React, { useState } from 'react';
import api from '../api';
import { setToken } from '../auth';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/api/auth/login', { email, password });
      setToken(data.token);
      nav('/');
    } catch (e) {
      const message = e?.response?.data?.error || 'Login failed. Please check your credentials.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page page--center">
      <div className="card auth-card">
        <div className="brand brand--light brand--center">
          <span className="brand__mark">VS</span>
          <span className="brand__title">Voter Console</span>
        </div>
        <div className="panel__header">
          <h1 className="panel__title">Welcome back</h1>
          <p className="panel__subtitle">Sign in to continue to the voter search dashboard.</p>
        </div>
        {error && (
          <div className="alert alert--error" role="alert">
            <span aria-hidden>⚠️</span>
            <span>{error}</span>
          </div>
        )}
        <form className="form-grid" onSubmit={submit}>
          <label className="field">
            <span className="field__label">Email address</span>
            <input
              className="input"
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="field">
            <span className="field__label">Password</span>
            <input
              className="input"
              placeholder="••••••••"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="btn btn--primary" type="submit" disabled={loading}>
            {loading ? 'Signing you in…' : 'Sign in'}
          </button>
        </form>
        <p className="panel__subtitle text-center">
          Tip: use the credentials shared by your administrator.
        </p>
      </div>
    </div>
  );
}
