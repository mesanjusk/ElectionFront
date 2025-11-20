// client/src/App.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";
import Home from "./pages/Home.jsx";
import Search from "./pages/Search.jsx";
import AdminHome from "./pages/AdminHome.jsx";
import Family from "./pages/Family.jsx";
import Alpha from "./pages/alphafamily.jsx";
import Caste from "./pages/Caste.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Intro from "./pages/Intro.jsx"; // ⬅️ new intro/landing page

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Intro />} />
      <Route path="/login" element={<Login />} />
      <Route path="/adminlogin" element={<AdminLogin />} />

      {/* Protected routes */}
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminHome />
          </ProtectedRoute>
        }
      />

      {/* Voter search */}
      <Route
        path="/search"
        element={
          <ProtectedRoute>
            <Search />
          </ProtectedRoute>
        }
      />

      {/* Family search */}
      <Route
        path="/family"
        element={
          <ProtectedRoute>
            <Family />
          </ProtectedRoute>
        }
      />
      <Route
        path="/alpha"
        element={
          <ProtectedRoute>
            <Alpha />
          </ProtectedRoute>
        }
      />

      {/* Caste search */}
      <Route
        path="/caste"
        element={
          <ProtectedRoute>
            <Caste />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
