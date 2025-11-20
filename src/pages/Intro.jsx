// client/src/pages/Intro.jsx
import React, { useEffect, useState } from "react";
import {
  Box,
  Container,
  Stack,
  Typography,
  Paper,
  Button
} from "@mui/material";
import HowToVoteRoundedIcon from "@mui/icons-material/HowToVoteRounded";
import AddToHomeScreenRoundedIcon from "@mui/icons-material/AddToHomeScreenRounded";
import { useNavigate } from "react-router-dom";

import PWAInstallPrompt from "../components/PWAInstallPrompt.jsx";
import { unlockSession } from "../auth";

export default function Intro() {
  const navigate = useNavigate();

  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false); // show Install App button

  // Detect login → skip intro
  useEffect(() => {
    const token = window.localStorage.getItem("token");
    if (token) {
      unlockSession();
      navigate("/home", { replace: true });
    }
  }, [navigate]);

  // Detect iOS
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
  }, []);

  // Detect if app is already installed
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone;

    if (standalone) {
      setIsInstalled(true);
    }
  }, []);

  // Listen for install prompt availability
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      window.deferredPrompt = e;
      setCanInstall(true); // Show button only when install possible
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  // Install button click
  const handleInstall = async () => {
    const event = window.deferredPrompt;
    if (!event) return; // If not available, button will not be visible anyway

    event.prompt();
    await event.userChoice;
    window.deferredPrompt = null;
    setCanInstall(false);
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
        bgcolor: "#f3f4f6",
      }}
    >
      <Container maxWidth="sm">
        {/* Animated gradient border */}
        <Box
          sx={{
            borderRadius: 5,
            p: 1.5,
            background:
              "linear-gradient(120deg, #22c55e, #0ea5e9, #6366f1, #22c55e)",
            backgroundSize: "250% 250%",
            animation: "introGradientBorder 10s ease infinite",
            "@keyframes introGradientBorder": {
              "0%": { backgroundPosition: "0% 50%" },
              "50%": { backgroundPosition: "100% 50%" },
              "100%": { backgroundPosition: "0% 50%" },
            },
          }}
        >
          <Paper
            elevation={4}
            sx={{
              borderRadius: 4,
              p: 4,
              textAlign: "center",
              bgcolor: "#ffffff",
            }}
          >
            {/* Main Icon */}
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: "24px",
                mx: "auto",
                mb: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "#e7f5e9",
              }}
            >
              <HowToVoteRoundedIcon sx={{ fontSize: 40, color: "#22c55e" }} />
            </Box>

            {/* Title */}
            <Typography variant="h4" fontWeight={700} gutterBottom>
              Instify
            </Typography>

            {/* Subtitle */}
            <Typography
              variant="body1"
              sx={{ color: "rgb(90,90,90)", mb: 3 }}
            >
              SMART VOTER MANAGEMENT
            </Typography>

            {/* Install App button (only if: NOT installed + prompt available) */}
            {!isInstalled && canInstall && (
              <Button
                variant="contained"
                size="large"
                startIcon={<AddToHomeScreenRoundedIcon />}
                sx={{
                  py: 1.7,
                  fontSize: 17,
                  borderRadius: 3,
                  mb: 3,
                }}
                onClick={handleInstall}
              >
                Install App
              </Button>
            )}

            {/* Login link + iOS hint */}
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

              <Typography variant="caption" sx={{ color: "rgb(120,120,120)" }}>
                After login, your data available.
              </Typography>

              {isIOS && (
                <Typography
                  variant="caption"
                  sx={{ color: "rgb(100,116,139)", mt: 1 }}
                >
                  📱 On iPhone / iPad: open in <b>Safari</b>, tap{" "}
                  <b>Share (⬆️)</b> → <b>Add to Home Screen</b>.
                </Typography>
              )}
            </Stack>
          </Paper>
        </Box>
      </Container>

      {/* Auto PWA install modal */}
      <PWAInstallPrompt />
    </Box>
  );
}
