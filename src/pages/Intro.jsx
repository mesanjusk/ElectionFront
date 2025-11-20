// client/src/pages/Intro.jsx
import React, { useEffect } from "react";
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

  // 🔥 Auto redirect if user already logged in
  useEffect(() => {
    const token = window.localStorage.getItem("token");
    if (token) {
      unlockSession();
      navigate("/home", { replace: true });
    }
  }, [navigate]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: 4,
        bgcolor:
          "linear-gradient(135deg, #0f172a 0%, #020617 40%, #111827 100%)",
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={10}
          sx={{
            borderRadius: 4,
            p: 4,
            textAlign: "center",
            bgcolor: "rgba(15,23,42,0.96)",
            color: "white",
            backdropFilter: "blur(10px)",
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
              bgcolor: "rgba(34,197,94,0.12)",
            }}
          >
            <HowToVoteRoundedIcon
              sx={{ fontSize: 40, color: "#22c55e" }}
            />
          </Box>

          {/* Title */}
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Instify
          </Typography>

          {/* Subtitle */}
          <Typography
            variant="body1"
            sx={{ color: "rgba(249,250,251,0.8)", mb: 3 }}
          >
            Smart voter management platform with{" "}
            <b>offline search</b>, <b>household insights</b> and{" "}
            <b>secure multi-device access</b>.
          </Typography>

          {/* Feature Chips */}
          <Stack
            direction="row"
            spacing={1}
            justifyContent="center"
            flexWrap="wrap"
            mb={3}
          >
            <Chip
              icon={
                <SearchRoundedIcon sx={{ color: "#22c55e!important" }} />
              }
              label="Ultra-fast search"
              variant="outlined"
              sx={{
                borderColor: "rgba(148,163,184,0.6)",
                color: "rgba(248,250,252,0.9)",
              }}
            />
            <Chip
              icon={
                <OfflineBoltRoundedIcon
                  sx={{ color: "#22c55e!important" }}
                />
              }
              label="Works offline"
              variant="outlined"
              sx={{
                borderColor: "rgba(148,163,184,0.6)",
                color: "rgba(248,250,252,0.9)",
              }}
            />
            <Chip
              icon={
                <ShieldRoundedIcon sx={{ color: "#22c55e!important" }} />
              }
              label="Secure login"
              variant="outlined"
              sx={{
                borderColor: "rgba(148,163,184,0.6)",
                color: "rgba(248,250,252,0.9)",
              }}
            />
          </Stack>

          {/* Login link */}
          <Stack spacing={0.5}>
            <Typography
              variant="body2"
              sx={{
                cursor: "pointer",
                color: "#38bdf8",
                "&:hover": { textDecoration: "underline" },
              }}
              onClick={() => navigate("/login")}
            >
              <b>Login</b>
            </Typography>

            <Typography
              variant="caption"
              sx={{ color: "rgba(148,163,184,0.9)" }}
            >
              After login, your data syncs once and is available offline.
            </Typography>
          </Stack>
        </Paper>
      </Container>

      {/* Full-screen PWA install modal */}
      <PWAInstallPrompt />
    </Box>
  );
}
