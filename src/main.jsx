// client/src/main.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
  redirect,
} from 'react-router-dom';
import Login from './pages/Login.jsx';
import Search from './pages/Search.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/src/sw.js').catch(console.error);
  });
}

const router = createBrowserRouter(
  [
    { path: '/login', element: <Login /> },
    { path: '/', element: <ProtectedRoute><Search /></ProtectedRoute> },
    { path: '*', loader: () => redirect('/') },
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  }
);

createRoot(document.getElementById('root')).render(
  <RouterProvider router={router} />
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then(() => console.log("✅ Service worker registered"))
      .catch((err) => console.log("SW reg failed:", err));
  });
}
