// client/src/pages/Intro.jsx
import React, { useEffect, useState } from "react";
import {
  Box,
  Container,
  Stack,
  Typography,
  Paper,
  Chip,
  Button,
} from "@mui/material";
import HowToVoteRoundedIcon from "@mui/icons-material/HowToVoteRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import OfflineBoltRoundedIcon from "@mui/icons-material/OfflineBoltRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import AddToHomeScreenRoundedIcon from "@mui/icons-material/AddToHomeScreenRounded";
import { useNavigate } from "react-router-dom";

import PWAInstallPrompt from "../components/PWAInstallPrompt.jsx";
import { unlockSession } from "../auth";

export default function Intro() {
  const navigate = useNavigate();
  const [isIOS, setIsIOS] = useState(false);

  // 🔥 Auto redirect if user already logged in
  useEffect(() => {
    const token = window.localStorage.getItem("token");
    if (token) {
      unlockSession();
      navigate("/home", { replace: true });
    }
  }, [navigate]);

  // Detect iOS for help section
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
  }, []);

  // Manual install for Android/Supported browsers
  const handleManualInstall = () => {
    const event = window.deferredPrompt;
    if (event) {
      event.prompt();
    } else if (isIOS) {
      alert(
        "On iPhone/iPad: Open in Safari → Share button → Add to Home Screen."
      );
    } else {
      alert("Install option is not available. Try Chrome on Android.");
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
        bgcolor: "#f3f4f6",
      }}
    >
      <Container maxWidth="sm">
        {/* ⭐ Animated Gradient Border */}
        <Box
          sx={{
            borderRadius: 5,
            p: 1.5,
            background:
              "linear-gradient(120deg, #22c55e, #0ea5e9, #6366f1, #22c55e)",
            backgroundSize: "250% 250%",
            animation: "gradientBorder 8s ease infinite",
            "@keyframes gradientBorder": {
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
              bgcolor: "white",
            }}
          >
            {/* ⭐ App Logo ABOVE Title */}
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
                src="/icon-192.png" // ✔ CORRECT PUBLIC FOLDER PATH
                alt="Instify logo"
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: 2,
                  objectFit: "cover",
                  boxShadow: 3,
                }}
              />

              <Box
                sx={{
                  width: 52,
                  height: 52,
                  borderRadius: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "#e7f5e9",
                }}
              >
                <HowToVoteRoundedIcon
                  sx={{ fontSize: 32, color: "#16a34a" }}
                />
              </Box>
            </Box>

            {/* ⭐ Title */}
            <Typography variant="h4" fontWeight={700} gutterBottom>
              Instify
            </Typography>

            {/* Subtitle */}
            <Typography
              variant="body1"
              sx={{ color: "rgb(90,90,90)", mb: 3 }}
            >
              Smart Voter Management Platform with{" "}
              <b>offline search</b>, <b>family insights</b> and{" "}
              <b>secure access</b>.
            </Typography>

            {/* ⭐ Feature Chips */}
            <Stack
              direction="row"
              spacing={1}
              justifyContent="center"
              flexWrap="wrap"
              mb={3}
            >
              <Chip
                icon={<SearchRoundedIcon sx={{ color: "#16a34a!important" }} />}
                label="Fast Search"
                variant="outlined"
              />
              <Chip
                icon={
                  <OfflineBoltRoundedIcon sx={{ color: "#16a34a!important" }} />
                }
                label="Offline Ready"
                variant="outlined"
              />
              <Chip
                icon={
                  <ShieldRoundedIcon sx={{ color: "#16a34a!important" }} />
                }
                label="Secure Login"
                variant="outlined"
              />
            </Stack>

            {/* ⭐ Manual Install Button */}
            <Button
              variant="contained"
              size="large"
              startIcon={<AddToHomeScreenRoundedIcon />}
              sx={{
                py: 1.7,
                fontSize: 17,
                borderRadius: 3,
                mb: 2.5,
                bgcolor: "#16a34a",
                "&:hover": { bgcolor: "#15803d" },
              }}
              onClick={handleManualInstall}
            >
              Install App
            </Button>

            {/* ⭐ iOS INSTALL HELP BLOCK */}
            {isIOS && (
              <Box
                sx={{
                  mb: 2.5,
                  px: 2,
                  py: 1.5,
                  borderRadius: 2,
                  bgcolor: "#f1f5f9",
                  textAlign: "left",
                }}
              >
                <Typography variant="subtitle2" sx={{ mb: 0.8 }}>
                  📱 Install on iPhone / iPad
                </Typography>
                <Typography variant="body2" sx={{ color: "rgb(75,85,99)" }}>
                  1. Open this page in <b>Safari</b>.
                  <br />
                  2. Tap the <b>Share</b> button (⬆️).
                  <br />
                  3. Choose <b>“Add to Home Screen”</b>.
                  <br />
                  4. Tap <b>Add</b> to install Instify as an app.
                </Typography>
              </Box>
            )}

            {/* ⭐ Login Link */}
            <Stack spacing={0.5}>
              <Typography
                variant="body2"
                sx={{
                  cursor: "pointer",
                  color: "#0ea5e9",
                  "&:hover": { textDecoration: "underline" },
                }}
                onClick={() => navigate("/login")}
              >
                <b>Login</b>
              </Typography>

              <Typography
                variant="caption"
                sx={{ color: "rgb(120,120,120)" }}
              >
                After login, your database syncs once and becomes available
                offline.
              </Typography>
            </Stack>
          </Paper>
        </Box>
      </Container>

      {/* ⭐ Full-screen PWA auto prompt modal */}
      <PWAInstallPrompt />
    </Box>
  );
}
