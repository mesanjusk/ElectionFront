const ACTIVATION_KEY = 'activationState';
const DEVICE_ID_KEY = 'activationDeviceId';

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
  return safeParse(window.localStorage.getItem(ACTIVATION_KEY));
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

/**
 * NOTE:
 * Frontend no longer hashes PINs.
 * This helper is kept only so existing imports keep working.
 * It now simply returns the raw PIN value.
 */
export async function hashPin(pin) {
  return pin;
}

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
 * Store activation with RAW PIN (no hashing on frontend).
 * We now keep EVERYTHING we get (username, user, databases, etc.)
 * so PIN login can restore sessions later.
 */
export async function storeActivation(data) {
  const deviceId = ensureDeviceId();

  const previous = readActivation() || {};

  const payload = {
    ...previous,
    ...data,
    deviceId: deviceId || data.deviceId || null,
    revoked: false,
    activatedAt: Date.now(),
  };

  writeActivation(payload);
  return payload;
}

/**
 * Verify by direct string comparison with stored raw PIN.
 */
export async function verifyPin(pin) {
  const state = getActivationState();
  if (!state?.pin) return false;
  return pin === state.pin;
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
