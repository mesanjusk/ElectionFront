// client/src/services/activation.js

const ACTIVATION_KEY = "activationState";
const DEVICE_ID_KEY = "activationDeviceId";

/* ---------------- Device ID helpers ---------------- */

function generateDeviceId() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2, 10);
  const timestamp = Date.now().toString(36);
  return `dev-${timestamp}-${random}`;
}

function ensureDeviceId() {
  if (typeof window === "undefined") return null;
  let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateDeviceId();
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/* ---------------- Safe JSON helpers ---------------- */

function safeParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Failed to parse activation state", err);
    return null;
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Failed to serialise activation state", err);
    return null;
  }
}

function readActivation() {
  if (typeof window === "undefined") return null;
  return safeParse(window.localStorage.getItem(ACTIVATION_KEY));
}

function writeActivation(state) {
  if (typeof window === "undefined") return;
  const payload = safeStringify(state);
  if (!payload) {
    window.localStorage.removeItem(ACTIVATION_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVATION_KEY, payload);
}

/* ---------------- PIN hashing ---------------- */

function simpleFallbackHash(pin) {
  let hash = 0;
  for (let i = 0; i < pin.length; i += 1) {
    hash = (hash << 5) - hash + pin.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  return `fallback-${Math.abs(hash)}`;
}

export async function hashPin(pin) {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const digest = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return simpleFallbackHash(pin);
}

/* ---------------- Public API ---------------- */

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

  // Normalise revoked flag
  if (
    nextState &&
    Object.prototype.hasOwnProperty.call(nextState, "revoked")
  ) {
    state.revoked = Boolean(nextState.revoked);
  } else if (Object.prototype.hasOwnProperty.call(state, "revoked")) {
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
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVATION_KEY);
}

/**
 * ⭐ MAIN: called after username + password login
 * Saves username, user info, databases, pinHash etc.
 */
export async function storeActivation({
  email,
  username,
  language = "en",
  userType,
  user,
  databases,
  activeDatabaseId,
  pin,
  deviceId: explicitDeviceId,
} = {}) {
  if (!pin) {
    throw new Error("PIN is required for activation");
  }

  const pinHash = await hashPin(pin);
  const deviceId = explicitDeviceId || ensureDeviceId();

  const base = {
    // we keep both for flexibility
    email: email || username || null,
    username: username || email || null,
    language,
    userType: userType || user?.userType || null,
    user: user || null,
    databases: databases || null,
    activeDatabaseId: activeDatabaseId || null,
    pinHash,
    revoked: false,
    activatedAt: Date.now(),
    deviceId,
  };

  // Merge with any existing activation state
  const state = setActivationState(base);
  return state;
}

export async function verifyPin(pin) {
  const state = getActivationState();
  if (!state?.pinHash) return false;
  const hashed = await hashPin(pin);
  return hashed === state.pinHash;
}

export function markActivationRevoked(message = "") {
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
