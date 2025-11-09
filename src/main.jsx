// client/src/main.jsx
import React, { useEffect, useState } from 'react';
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

const MOBILE_UA_REGEX = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i;

function isMobileDevice() {
  if (typeof window === 'undefined') return true;
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  if (MOBILE_UA_REGEX.test(ua)) {
    return true;
  }
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isNarrow = window.innerWidth <= 900;
  return isTouch && isNarrow;
}

function RootApp() {
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());

  useEffect(() => {
    const update = () => setIsMobile(isMobileDevice());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  if (!isMobile) {
    return (
      <div className="mobile-only" role="alert" aria-live="assertive">
        <div className="mobile-only__card">
          <h1 className="mobile-only__title">Mobile device required</h1>
          <p className="mobile-only__body">
            This application is optimised for mobile field agents and is only available on
            mobile browsers. Please open the app from an Android or iOS device to continue.
          </p>
        </div>
      </div>
    );
  }

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
