// client/src/components/PWAInstallPrompt.jsx
import React, { useEffect, useState } from "react";

export default function PWAInstallPrompt({
  delayMs = 2500, // show after 2.5s
  bottom = 72,    // keep above your stats bar
}) {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);

  // basic iOS Safari detect (no beforeinstallprompt there)
  const isIOS = typeof window !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    /safari/i.test(navigator.userAgent);

  useEffect(() => {
    const onBIP = (e) => {
      e.preventDefault();
      setDeferred(e);
      // show after a small delay (once per session)
      if (!sessionStorage.getItem("pwaPromptShown")) {
        setTimeout(() => {
          setVisible(true);
          sessionStorage.setItem("pwaPromptShown", "1");
        }, delayMs);
      }
    };
    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [delayMs]);

  // iOS: show a small tip once (because no BIP on iOS)
  useEffect(() => {
    if (isIOS && !sessionStorage.getItem("pwaIosTipShown")) {
      setTimeout(() => {
        setVisible(true);
        sessionStorage.setItem("pwaIosTipShown", "1");
      }, delayMs);
    }
  }, [isIOS, delayMs]);

  if (installed) return null;

  const doInstall = async () => {
    if (deferred) {
      setVisible(false);
      deferred.prompt();
      const choice = await deferred.userChoice;
      // If user dismissed, you may show again later if you want.
      setDeferred(null);
    } else if (isIOS) {
      // keep the tip open for iOS
    } else {
      // not installable (missing manifest/SW) — hide
      setVisible(false);
    }
  };

  if (!visible) return null;

  // minimal floating styles
  const fab = {
    position: "fixed",
    right: 16,
    bottom,
    zIndex: 9999,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 14px",
    borderRadius: 999,
    border: "1px solid #c7d2fe",
    background: "linear-gradient(180deg,#eef2ff,#e0e7ff)",
    color: "#111827",
    boxShadow: "0 8px 20px rgba(0,0,0,.15)",
    fontFamily: "Inter,system-ui,Segoe UI,Roboto,Arial,sans-serif",
    cursor: "pointer",
  };

  const badge = {
    fontWeight: 800,
    background: "#155EEF",
    color: "#fff",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 12,
  };

  const tipBox = {
    position: "fixed",
    right: 16,
    bottom: bottom + 64,
    zIndex: 9999,
    background: "#111827",
    color: "#fff",
    borderRadius: 10,
    padding: "10px 12px",
    boxShadow: "0 8px 20px rgba(0,0,0,.25)",
    maxWidth: 260,
    fontSize: 13,
    lineHeight: 1.35,
  };

  const closeX = {
    marginLeft: 8,
    background: "transparent",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    fontSize: 16,
  };

  return (
    <>
      {isIOS && (
        <div style={tipBox}>
          Install this app: tap <strong>Share</strong> <span aria-hidden>⬆️</span> then
          <strong> “Add to Home Screen”</strong>.
          <button onClick={() => setVisible(false)} style={closeX} aria-label="close">×</button>
        </div>
      )}
      <button onClick={doInstall} style={fab} aria-label="Install App">
        <span style={badge}>Install</span>
        <span>Voter Search</span>
        <span aria-hidden>➕</span>
      </button>
    </>
  );
}
