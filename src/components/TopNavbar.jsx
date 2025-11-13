// client/src/components/TopNavbar.jsx
import React from "react";
import {
  AppBar,
  Toolbar,
  Stack,
  IconButton,
  Box,
  Typography,
  Tooltip,
} from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import CloudDownloadRoundedIcon from "@mui/icons-material/CloudDownloadRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";

export default function TopNavbar({
  collectionName = "Collection",
  userName = "User",
  busy = false,
  onMenuOpen,
  onPull,
  onPush,
}) {
  return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(15,23,42,0.08)",
      }}
    >
      <Toolbar sx={{ justifyContent: "space-between", minHeight: 40 }}>
        {/* Left: Menu + Collection name + User name */}
        <Stack direction="row" spacing={1.5} alignItems="center">
          <IconButton
            onClick={onMenuOpen || (() => {})}
            color="inherit"
            edge="start"
          >
            <MenuRoundedIcon />
          </IconButton>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {userName} {collectionName || "Collection"}
            </Typography>
            
          </Box>
        </Stack>

        {/* Right: Pull / Push buttons */}
        <Stack direction="row" spacing={1}>
          <Tooltip title="Pull latest">
            <span>
              <IconButton
                color="primary"
                onClick={onPull}
                disabled={busy || !onPull}
              >
                <CloudDownloadRoundedIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Push offline updates">
            <span>
              <IconButton
                color="primary"
                onClick={onPush}
                disabled={busy || !onPush}
              >
                <CloudUploadRoundedIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
