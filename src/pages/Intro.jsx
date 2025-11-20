// client/src/pages/Intro.jsx
import React, { useEffect } from "react";
import {
  Box,
  Container,
  Stack,
  Typography,
  Paper,
  Button,
} from "@mui/material";
import AddToHomeScreenRoundedIcon from "@mui/icons-material/AddToHomeScreenRounded";
import { useNavigate } from "react-router-dom";

import PWAInstallPrompt from "../components/PWAInstallPrompt.jsx";
import { unlockSession } from "../auth";

export default function Intro() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("token");

    // 1️⃣ If already logged in → go directly to HOME
    if (token) {
      unlockSession();
      navigate("/", { replace: true });
      return;
    }

    // 2️⃣ If app is installed as PWA → skip intro, go to LOGIN
    const isStandalone =
      (window.matchMedia &&
        window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone;

    if (isStandalone) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // Manual install trigger (for browsers that support beforeinstallprompt)
  const handleManualInstall = async () => {
    const event = window.deferredPrompt;
    if (event) {
      event.prompt();
      await event.userChoice;
      window.deferredPrompt = null;
    } else {
      alert(
        "Install option is not available right now.\nTry opening in Chrome on Android or Safari on iPhone, then use 'Add to Home Screen'."
      );
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: 4,
        bgcolor: "#f3f4f6", // 🌤 light background
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={4}
          sx={{
            borderRadius: 4,
            p: 4,
            textAlign: "center",
            bgcolor: "#ffffff",
          }}
        >
          {/* App logo (from public/icon-192.png) */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              mb: 2,
              gap: 1,
            }}
          >
            <Box
              component="img"
              src="/icon-192.png"
              alt="Instify logo"
              sx={{
                width: 72,
                height: 72,
                borderRadius: 3,
                objectFit: "cover",
                boxShadow: 2,
              }}
            />
          </Box>

          {/* Title */}
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Instify
          </Typography>

          {/* Subtitle */}
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 3 }}
          >
            Smart voter management platform with{" "}
            <b>offline search</b>, <b>family insights</b> and{" "}
            <b>secure access</b>.
          </Typography>

          {/* Install App button */}
          <Button
            variant="contained"
            size="large"
            startIcon={<AddToHomeScreenRoundedIcon />}
            sx={{
              py: 1.7,
              fontSize: 17,
              borderRadius: 3,
              mb: 2.5,
            }}
            onClick={handleManualInstall}
          >
            Install App
          </Button>

          {/* Login link */}
          <Stack spacing={0.5}>
            <Typography
              variant="body2"
              sx={{
                cursor: "pointer",
                color: "primary.main",
                "&:hover": { textDecoration: "underline" },
              }}
              onClick={() => navigate("/login")}
            >
              <b>Login</b>
            </Typography>

            <Typography variant="caption" color="text.secondary">
              After login, your data syncs once and is available offline.
            </Typography>
          </Stack>
        </Paper>
      </Container>

      {/* Full-screen PWA install modal (auto prompt) */}
      <PWAInstallPrompt />
    </Box>
  );
}
