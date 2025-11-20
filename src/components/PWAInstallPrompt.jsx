// client/src/components/PWAInstallPrompt.jsx
import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  Stack,
  Typography,
  IconButton,
} from "@mui/material";
import AddToHomeScreenRoundedIcon from "@mui/icons-material/AddToHomeScreenRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

const HIDDEN_KEY = "pwaPromptHidden";

function safeSessionGet(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export default function PWAInstallPrompt({ delayMs = 1500 }) {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // Detect standalone + iOS
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone;

    if (isStandalone) {
      setInstalled(true);
      return;
    }

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
  }, []);

  // Android: beforeinstallprompt handling
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (safeSessionGet(HIDDEN_KEY) === "1") return;

    let timer;

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferred(event);
      // expose globally for manual Install button
      window.deferredPrompt = event;

      if (timer) clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(true), delayMs);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setDeferred(null);
      window.deferredPrompt = null;
      safeSessionSet(HIDDEN_KEY, "1");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleInstalled);
      if (timer) clearTimeout(timer);
    };
  }, [delayMs]);

  // iOS: show instructions
  useEffect(() => {
    if (!isIOS) return;
    if (safeSessionGet(HIDDEN_KEY) === "1") return;

    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [isIOS, delayMs]);

  if (!visible || installed) return null;

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice?.outcome === "accepted") {
        safeSessionSet(HIDDEN_KEY, "1");
        setVisible(false);
        setDeferred(null);
        window.deferredPrompt = null;
      }
    } else if (!isIOS) {
      // fallback: just hide if nothing to do
      setVisible(false);
    }
  };

  const hidePrompt = () => {
    setVisible(false);
    safeSessionSet(HIDDEN_KEY, "1");
  };

  return (
    <Dialog open={visible} fullScreen>
      <DialogContent
        sx={{
          bgcolor: "#f3f4f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 0,
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: 420,
            mx: "auto",
            bgcolor: "white",
            borderRadius: 4,
            boxShadow: 6,
            p: 4,
            textAlign: "center",
            position: "relative",
          }}
        >
          {/* Close Button */}
          <IconButton
            onClick={hidePrompt}
            sx={{ position: "absolute", top: 12, right: 12 }}
          >
            <CloseRoundedIcon />
          </IconButton>

          {/* Big Icon */}
          <AddToHomeScreenRoundedIcon
            sx={{ fontSize: 80, color: "primary.main", mb: 2 }}
          />

          <Typography variant="h5" fontWeight={700} gutterBottom>
            Install Instify
          </Typography>

          <Typography variant="body1" color="text.secondary" mb={3}>
            {isIOS
              ? "Add Instify to your home screen for faster access and offline use."
              : "Install Instify for faster access and powerful offline voter search."}
          </Typography>

          {!isIOS && (
            <Button
              variant="contained"
              size="large"
              onClick={install}
              startIcon={<AddToHomeScreenRoundedIcon />}
              sx={{ borderRadius: 3, py: 1.5, fontSize: 16 }}
            >
              Install Now
            </Button>
          )}

          {isIOS && (
            <Stack spacing={1.2} mt={1.5}>
              <Typography variant="body2" color="text.secondary">
                1. Open this page in <b>Safari</b>.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                2. Tap the <b>Share</b> button (⬆️).
              </Typography>
              <Typography variant="body2" color="text.secondary">
                3. Choose <b>&quot;Add to Home Screen&quot;</b>.
              </Typography>
            </Stack>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
