// client/src/components/VoiceSearchButton.jsx
import React, { useRef, useState } from 'react';

export default function VoiceSearchButton({ onResult, disabled, lang = 'hi-IN' }) {
  const recRef = useRef(null);
  const [active, setActive] = useState(false);

  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Voice search not supported on this browser');
      return;
    }
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recRef.current = rec;
    setActive(true);

    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      onResult?.(text);
    };
    rec.onend = () => setActive(false);
    rec.onerror = () => setActive(false);

    rec.start();
  };

  const stop = () => recRef.current?.stop();

  return (
    <button onClick={active ? stop : start} disabled={disabled} style={{padding:'8px 12px'}}>
      {active ? '🎙️ Listening… (tap to stop)' : '🎤 Voice'}
    </button>
  );
}
