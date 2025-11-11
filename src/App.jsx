import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import Home from './pages/Home.jsx';
import Search from './pages/Search.jsx';
import AdminHome from './pages/AdminHome.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
  return (
    <Routes>
      {/* Public route */}
      <Route path="/login" element={<Login />} />
      <Route path="/adminlogin" element={<AdminLogin />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={(
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/admin"
        element={(
          <ProtectedRoute requiredRole="admin">
            <AdminHome />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/search"
        element={(
          <ProtectedRoute>
            <Search />
          </ProtectedRoute>
        )}
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
