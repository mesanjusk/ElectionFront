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
import './styles/theme.css';

const router = createBrowserRouter(
  [
    { path: '/login', element: <Login /> },
    {
      path: '/',
      element: (
        <ProtectedRoute>
          <Search />
        </ProtectedRoute>
      ),
    },
    { path: '*', loader: () => redirect('/') },
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  }
);



function RootApp() {
 
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById('root')).render(<RootApp />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('✅ Service worker registered:', registration.scope);
      })
      .catch((err) => {
        console.error('SW registration failed:', err);
      });
  });
}
