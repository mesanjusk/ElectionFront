// client/src/main.jsx
import React, { useEffect, useMemo, useState } from 'react';
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
import { registerSW } from './pwa/registerSW.js';

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

const MOBILE_UA_REGEX = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini|windows phone/i;

const coarsePointerQuery = '(pointer: coarse)';
const narrowViewportQuery = '(max-width: 900px)';

function computeIsMobile() {
  if (typeof window === 'undefined') return true;

  if (navigator.userAgentData?.mobile) {
    return true;
  }

  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  if (MOBILE_UA_REGEX.test(ua)) {
    return true;
  }

  const hasCoarsePointer = window.matchMedia?.(coarsePointerQuery).matches;
  const isNarrowViewport = window.matchMedia?.(narrowViewportQuery).matches;

  if (hasCoarsePointer && isNarrowViewport) {
    return true;
  }

  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return hasTouch && window.innerWidth <= 768;
}

function useMobileGate() {
  const mediaQueries = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return [];
    }

    return [coarsePointerQuery, narrowViewportQuery].map((query) => window.matchMedia(query));
  }, []);

  const [isMobile, setIsMobile] = useState(() => computeIsMobile());

  useEffect(() => {
    const update = () => setIsMobile(computeIsMobile());
    update();

    mediaQueries.forEach((mq) => mq.addEventListener?.('change', update));
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);

    return () => {
      mediaQueries.forEach((mq) => mq.removeEventListener?.('change', update));
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
    };
  }, [mediaQueries]);

  return isMobile;
}

function RootApp() {
  const isMobile = useMobileGate();

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

registerSW();
