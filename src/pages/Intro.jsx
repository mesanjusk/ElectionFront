import React from "react";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import { useNavigate } from "react-router-dom";

import PWAInstallPrompt from "../components/PWAInstallPrompt.jsx";

export default function Intro() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        bgcolor: "#f3f4f6",
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Stack spacing={4} textAlign="center">
          {/* App Title */}
          <Typography variant="h3" fontWeight={700}>
            Instify
          </Typography>

          {/* Short Description */}
          <Typography variant="body1" color="text.secondary">
            Voter Mmanagement Platform 
          </Typography>

          {/* Big Install Button */}
          <Button
            variant="contained"
            size="large"
            startIcon={<DownloadRoundedIcon />}
            sx={{
              py: 2,
              fontSize: 18,
              borderRadius: 3,
            }}
            onClick={() => {
              // trigger the built-in PWA install prompt
              const event = window.deferredPrompt;
              if (event) {
                event.prompt();
              } else {
                alert(
                  "Install option is not available on your device browser.\nTry using Chrome on Android."
                );
              }
            }}
          >
            Download App
          </Button>

          {/* Small Login Link */}
          <Typography
            variant="body2"
            sx={{ cursor: "pointer", color: "primary.main" }}
            onClick={() => navigate("/login")}
          >
            <b>Login</b>
          </Typography>
        </Stack>
      </Container>

      {/* Our existing PWA prompt component */}
      <PWAInstallPrompt  />
    </Box>
  );
}
