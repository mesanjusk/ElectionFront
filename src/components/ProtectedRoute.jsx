import React from 'react';
import { Navigate } from 'react-router-dom';
import { isLoggedIn, getUser } from '../auth';

export default function ProtectedRoute({ children, requiredRole }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  if (requiredRole) {
    const user = getUser();
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!roles.includes(user?.role)) {
      return <Navigate to="/" replace />;
    }
  }
  return children;
}
