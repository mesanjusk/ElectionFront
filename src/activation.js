// client/src/services/activation.js
// Handles device activation, PIN storage, and revocation state.
// All state is purely local to this browser (localStorage).

const ACTIVATION_KEY = 'activation_state';
const DEVICE_ID_KEY = 'device_id';

/** Read activation state from localStorage */
export function getActivationState() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ACTIVATION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Merge partial updates into activation state and persist.
 * Returns the updated activation object.
 */
export function setActivationState(patch) {
  if (typeof window === 'undefined') return {};
  const prev = getActivationState() || {};
  const next = { ...prev, ...(patch || {}) };
  try {
    window.localStorage.setItem(ACTIVATION_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
  return next;
}

/** Clear activation completely (used on full reset / logout) */
export function clearActivationState() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ACTIVATION_KEY);
  } catch {
    // ignore
  }
}

/** Mark activation as revoked with a message (shown on next login) */
export function markActivationRevoked(message) {
  setActivationState({
    revoked: true,
    revokedReason: message || 'Activation revoked. Please login again.',
  });
}

/** Clear the revoked flag & reason, keeping other activation info intact */
export function clearRevocationFlag() {
  setActivationState({
    revoked: false,
    revokedReason: '',
  });
}

/**
 * Get or generate a deviceId for this browser.
 * Used for candidate device binding.
 * NOTE: This is synchronous so it can be used inside axios interceptors.
 */
export function getDeviceId() {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.length > 0) return existing;
  } catch {
    // ignore
  }

  const random = Math.random().toString(36).slice(2);
  const timestamp = Date.now().toString(36);
  const deviceId = `dev_${timestamp}_${random}`;

  try {
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  } catch {
    // ignore
  }

  return deviceId;
}

/**
 * Store activation details AFTER a successful login + device activation.
 * This does NOT call the API – the caller (Login.jsx) already did that,
 * and passes in user / databases / activeDatabaseId etc.
 */
export async function storeActivation({
  username,
  pin,
  deviceId,
  userType,
  user,
  databases,
  activeDatabaseId,
}) {
  const normalizedUser =
    typeof username === 'string' ? username.trim().toLowerCase() : '';

  // simple, not-cryptographic encoding so we don't keep PIN in plain text
  const pinHash = pin ? btoa(String(pin)) : null;

  const activation = {
    username: normalizedUser,
    deviceId: deviceId || null,
    pinHash,
    language: 'en',
    revoked: false,
    revokedReason: '',
    userType: userType || null,
    user: user || null,
    databases: databases || [],
    activeDatabaseId: activeDatabaseId || null,
  };

  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVATION_KEY, JSON.stringify(activation));
    }
  } catch {
    // ignore
  }

  return activation;
}

/**
 * Verify PIN for PIN-login flow.
 * In your current UI, PIN is fixed to "11".
 * We still check:
 *  - activation exists
 *  - not revoked
 *  - input matches the stored hash OR "11"
 */
export async function verifyPin(inputPin) {
  const activation = getActivationState() || {};
  if (!activation.pinHash) return false;
  if (activation.revoked) return false;

  const trimmed = String(inputPin || '').trim();
  if (!trimmed) return false;

  // Expected PIN is fixed "11"
  const expectedPlain = '11';

  const matchesPlain = trimmed === expectedPlain;
  const matchesStored = activation.pinHash === btoa(trimmed);

  if (!matchesPlain && !matchesStored) {
    return false;
  }

  // Clear revoked state on successful PIN verification
  setActivationState({
    revoked: false,
    revokedReason: '',
  });

  return true;
}
