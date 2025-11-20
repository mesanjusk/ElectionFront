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
  } catch (err) {
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

  // Detect standalone
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone;

    if (isStandalone) {
      setInstalled(true);
      return;
    }

    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
      setIsIOS(true);
    }
  }, []);

  // Android - detect beforeinstallprompt
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (safeSessionGet(HIDDEN_KEY) === "1") return;

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      setTimeout(() => setVisible(true), delayMs);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setVisible(false);
      safeSessionSet(HIDDEN_KEY, "1");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [delayMs]);

  // iOS instructions
  useEffect(() => {
    if (!isIOS) return;
    if (safeSessionGet(HIDDEN_KEY) === "1") return;

    setTimeout(() => setVisible(true), delayMs);
  }, [isIOS, delayMs]);

  if (!visible || installed) return null;

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      const result = await deferred.userChoice;
      if (result.outcome === "accepted") {
        safeSessionSet(HIDDEN_KEY, "1");
        setVisible(false);
      }
      setDeferred(null);
    } else if (!isIOS) {
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

          {/* Large Icon */}
          <AddToHomeScreenRoundedIcon
            sx={{ fontSize: 80, color: "primary.main", mb: 2 }}
          />

          <Typography variant="h5" fontWeight={700} gutterBottom>
            Install App
          </Typography>

          <Typography variant="body1" color="text.secondary" mb={3}>
            {isIOS
              ? "Add Instify to your home screen for faster access and offline use."
              : "Install Instify for faster access and powerful offline voter search."}
          </Typography>

          {/* Android install */}
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

          {/* iOS message */}
          {isIOS && (
            <Typography variant="body2" color="text.secondary" mt={2}>
              Tap <b>Share</b> ⬆️ → <b>Add to Home Screen</b>
            </Typography>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
