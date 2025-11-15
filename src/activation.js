// client/src/services/activation.js
// Handles device activation, PIN storage, and revocation state.

const ACTIVATION_KEY = 'activationState';
const DEVICE_ID_KEY = 'activationDeviceId';

// --------- Device ID helpers --------- //

function generateDeviceId() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now().toString(36);
  return `dev-${timestamp}-${random}`;
}

function ensureDeviceId() {
  if (typeof window === 'undefined') return null;
  let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateDeviceId();
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

// --------- Safe JSON helpers --------- //

function safeParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Failed to parse activation state', err);
    return null;
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Failed to serialise activation state', err);
    return null;
  }
}

function readActivation() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(ACTIVATION_KEY);
  return safeParse(raw);
}

function writeActivation(state) {
  if (typeof window === 'undefined') return;
  const payload = safeStringify(state);
  if (!payload) {
    window.localStorage.removeItem(ACTIVATION_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVATION_KEY, payload);
}

// --------- Simple hash (sync, no crypto.subtle) --------- //

function simpleFallbackHash(pin) {
  const str = String(pin ?? '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return `fallback-${Math.abs(hash)}`;
}

// Kept for compatibility (not used by our store/verify logic anymore)
export async function hashPin(pin) {
  return simpleFallbackHash(pin);
}

// --------- Public API --------- //

export function getActivationState() {
  const state = readActivation();
  if (!state) return null;
  const deviceId = ensureDeviceId();
  if (deviceId && state.deviceId !== deviceId) {
    const next = { ...state, deviceId };
    writeActivation(next);
    return next;
  }
  return state;
}

export function setActivationState(nextState) {
  const current = getActivationState() || {};
  const state = { ...current, ...nextState };

  if (nextState && Object.prototype.hasOwnProperty.call(nextState, 'revoked')) {
    state.revoked = Boolean(nextState.revoked);
  } else if (Object.prototype.hasOwnProperty.call(state, 'revoked')) {
    state.revoked = Boolean(state.revoked);
  }

  if (!state.deviceId) {
    const deviceId = ensureDeviceId();
    if (deviceId) state.deviceId = deviceId;
  }

  if (!state.revoked) {
    delete state.revokedMessage;
  }

  writeActivation(state);
  return state;
}

export function clearActivationState() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACTIVATION_KEY);
}

/**
 * Store activation details.
 *
 * We accept a flexible payload (username, userId, language, userType, etc.)
 * and ALWAYS store a PIN of "11" if no explicit `pin` is provided.
 *
 * This matches your requirement:
 *  - Fixed PIN "11"
 *  - No need to ask user to set their own PIN
 */
export function storeActivation(payload = {}) {
  const previous = getActivationState() || {};
  const deviceId = ensureDeviceId();

  const language =
    (payload && payload.language) ||
    previous.language ||
    'en';

  const userType =
    (payload && payload.userType) ||
    previous.userType ||
    null;

  // If no pin provided, default to "11"
  const rawPin =
    (payload && payload.pin && String(payload.pin).trim()) || '11';
  const pinHash = simpleFallbackHash(rawPin);

  const next = {
    ...previous,
    ...payload,
    language,
    userType,
    deviceId,
    pinHash,
    revoked: false,
    activatedAt: Date.now(),
  };

  writeActivation(next);
  return next;
}

/**
 * Verify PIN for PIN-login flow.
 * Your Login.jsx always calls: verifyPin("11")
 */
export async function verifyPin(pin) {
  const state = getActivationState();
  if (!state?.pinHash) return false;
  const hashed = simpleFallbackHash(pin);
  return hashed === state.pinHash;
}

export function markActivationRevoked(message = '') {
  const state = getActivationState() || {};
  state.revoked = true;
  state.revokedMessage = message;
  writeActivation(state);
  return state;
}

export function isActivationRevoked() {
  const state = getActivationState();
  return Boolean(state?.revoked);
}

export function clearRevocationFlag() {
  const state = getActivationState();
  if (!state) return;
  if (!state.revoked && !state.revokedMessage) return state;
  const next = { ...state };
  delete next.revoked;
  delete next.revokedMessage;
  writeActivation(next);
  return next;
}

export function getDeviceId() {
  return ensureDeviceId();
}
