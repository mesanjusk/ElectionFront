// client/src/components/VoiceSearchButton.jsx
import React, { useRef, useState } from 'react';

const baseButton =
  'inline-flex items-center justify-center rounded-2xl border border-emerald-100 bg-white/70 px-3 py-2 text-base font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:opacity-50';

const activeButton = 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/30';

export default function VoiceSearchButton({ onResult, disabled, lang = 'hi-IN', className = '' }) {
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

  const classes = [baseButton, active && activeButton, className].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={classes}
      aria-pressed={active}
      title={active ? 'Tap to stop voice search' : 'Start voice search'}
    >
      {active ? '🎙️ ' : '🎤 '}
    </button>
  );
}
