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
    <div className="pwa-banner" style={{ bottom: `${bottom}px` }}>
      <button className="btn btn--icon" onClick={hidePrompt} aria-label="Dismiss install prompt" type="button">
        ×
      </button>
      <p className="pwa-banner__message">
        {isIOS ? (
          <>
            Install this app: tap <strong>Share</strong> <span aria-hidden>⬆️</span> then
            <strong> "Add to Home Screen".</strong>
          </>
        ) : (
          <>Install Voter Console for quicker access and reliable offline search.</>
        )}
      </p>
      <button className="btn btn--primary" onClick={doInstall} type="button">
        <span aria-hidden>➕</span>
        <span>{isIOS ? 'Add to Home Screen' : 'Install app'}</span>
      </button>
    </div>
  );
}
