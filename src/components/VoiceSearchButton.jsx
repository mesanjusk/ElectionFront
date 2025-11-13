// client/src/components/VoiceSearchButton.jsx
import React, { useRef, useState } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import MicNoneRoundedIcon from '@mui/icons-material/MicNoneRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';

export default function VoiceSearchButton({ onResult, disabled, lang = 'hi-IN' }) {
  const recRef = useRef(null);
  const [active, setActive] = useState(false);

  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      window.alert('Voice search is not supported in this browser.');
      return;
    }
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recRef.current = rec;
    setActive(true);

    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript;
      if (text && typeof onResult === 'function') {
        onResult(text);
      }
    };
    rec.onend = () => setActive(false);
    rec.onerror = () => setActive(false);

    rec.start();
  };

  const stop = () => {
    recRef.current?.stop();
  };

  const handleClick = () => {
    if (active) stop();
    else start();
  };

  return (
    <Tooltip title={active ? 'Tap to stop voice search' : 'Start voice search'}>
      <span>
        <IconButton
          color={active ? 'secondary' : 'primary'}
          onClick={handleClick}
          disabled={disabled}
          aria-pressed={active}
          size="large"
        >
          {active ? <StopCircleRoundedIcon /> : <MicNoneRoundedIcon />}
        </IconButton>
      </span>
    </Tooltip>
  );
}
