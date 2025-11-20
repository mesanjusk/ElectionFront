import React, { useEffect, useState } from "react";
import { Button, IconButton, Paper, Slide, Stack, Typography } from "@mui/material";
import AddToHomeScreenRoundedIcon from "@mui/icons-material/AddToHomeScreenRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

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
    <Slide direction="up" in={visible} mountOnEnter unmountOnExit>
      <Paper
        elevation={12}
        sx={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom,
          px: 3,
          py: 2,
          zIndex: 1400,
          width: { xs: "90%", sm: "auto" },
        }}
      >
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }}>
          <Stack direction="row" spacing={1.5} alignItems="center" flex={1}>
            <AddToHomeScreenRoundedIcon color="primary" />
            <Typography variant="body2">
              {isIOS ? (
                <>
                  Install this app: tap <strong>Share</strong> <span aria-hidden>⬆️</span> then
                  <strong> "Add to Home Screen".</strong>
                </>
              ) : (
                <>Install the Voter Management for faster access and reliable offline search.</>
              )}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button onClick={doInstall} variant="contained" color="primary" startIcon={<AddToHomeScreenRoundedIcon fontSize="small" />}>
              {isIOS ? "Add to Home Screen" : "Install"}
            </Button>
            <IconButton onClick={hidePrompt} aria-label="Dismiss install prompt">
              <CloseRoundedIcon />
            </IconButton>
          </Stack>
        </Stack>
      </Paper>
    </Slide>
  );
}
