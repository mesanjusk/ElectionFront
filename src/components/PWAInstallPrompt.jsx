import React, { useEffect, useState } from "react";

const HIDDEN_KEY = "pwaPromptHidden";

function safeSessionGet(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function safeSessionSet(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch (err) {
    // ignore private mode errors
  }
}

export default function PWAInstallPrompt({ delayMs = 2500, bottom = 72 }) {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone = Boolean(
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(display-mode: standalone)").matches) ||
        window.navigator.standalone
    );
    if (isStandalone) {
      setInstalled(true);
      return;
    }

    const ua = window.navigator.userAgent || "";
    const ios = /iphone|ipad|ipod/i.test(ua);
    if (ios) {
      setIsIOS(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let timer;

    const handleBeforeInstallPrompt = (event) => {
      if (safeSessionGet(HIDDEN_KEY) === "1") {
        return;
      }
      event.preventDefault();
      setDeferred(event);
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => setVisible(true), delayMs);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
      safeSessionSet(HIDDEN_KEY, "1");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      if (timer) window.clearTimeout(timer);
    };
  }, [delayMs]);

  useEffect(() => {
    if (!isIOS || typeof window === "undefined") return;
    if (safeSessionGet(HIDDEN_KEY) === "1") return;

    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [isIOS, delayMs]);

  if (installed || !visible) {
    return null;
  }

  const hidePrompt = () => {
    setVisible(false);
    safeSessionSet(HIDDEN_KEY, "1");
  };

  const doInstall = async () => {
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      if (choice?.outcome === "accepted") {
        hidePrompt();
      }
    } else if (!isIOS) {
      hidePrompt();
    }
  };

  return (
    <div
      className="fixed inset-x-4 z-40 flex items-center gap-4 rounded-3xl border border-emerald-100 bg-white/90 px-5 py-4 shadow-2xl shadow-emerald-900/10 backdrop-blur"
      style={{ bottom: `${bottom}px` }}
    >
      <button
        type="button"
        className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-emerald-100 bg-white text-lg text-emerald-600 transition hover:border-emerald-200 hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
        onClick={hidePrompt}
        aria-label="Dismiss install prompt"
      >
        ×
      </button>
      <p className="flex-1 text-sm text-slate-600">
        {isIOS ? (
          <>
            Install this app: tap <strong>Share</strong> <span aria-hidden>⬆️</span> then
            <strong> "Add to Home Screen".</strong>
          </>
        ) : (
          <>Install Voter Console for quicker access and reliable offline search.</>
        )}
      </p>
      <div className="flex flex-shrink-0 items-center">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          onClick={doInstall}
        >
          <span aria-hidden>➕</span>
          <span>{isIOS ? 'Add to Home Screen' : 'Install app'}</span>
        </button>
      </div>
    </div>
  );
}
