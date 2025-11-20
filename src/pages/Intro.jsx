// client/src/pages/Intro.jsx
import React, { useEffect, useState } from "react";
import {
  Box,
  Container,
  Stack,
  Typography,
  Paper,
  Chip,
} from "@mui/material";
import HowToVoteRoundedIcon from "@mui/icons-material/HowToVoteRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import OfflineBoltRoundedIcon from "@mui/icons-material/OfflineBoltRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
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

  // Detect iOS for extra instructions
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
  }, []);

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
        {/* ✨ animated gradient border wrapper */}
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

            {/* Feature Chips */}
            <Stack
              direction="row"
              spacing={1}
              justifyContent="center"
              flexWrap="wrap"
              mb={3}
            >
              
            </Stack>

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
                  <b>Share (⬆️)</b> → <b>Add to Home Screen</b> to install as an
                  app.
                </Typography>
              )}
            </Stack>
          </Paper>
        </Box>
      </Container>

      {/* PWA install modal / logic */}
      <PWAInstallPrompt />
    </Box>
  );
}
