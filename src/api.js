// client/src/api.js
import axios from 'axios';
import { markActivationRevoked, getDeviceId } from './services/activation';
import { clearToken, lockSession } from './auth';

const raw = import.meta.env.VITE_API_URL || '';
const baseURL = raw.replace(/\/+$/, '');

if (!baseURL) {
  console.warn('VITE_API_URL is not set. API calls will fail.');
}

/** Axios instance */
const api = axios.create({
  baseURL, // e.g. https://electionserver.onrender.com
  withCredentials: false,
});

/** Attach bearer + device headers */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  try {
    const deviceId = getDeviceId();
    if (deviceId) config.headers['X-Device-Id'] = deviceId;
  } catch (_) {}
  return config;
});

/** Centralized auth/device error handling */
api.interceptors.response.use(
  (resp) => resp,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      clearToken();
      lockSession();
      markActivationRevoked('Your session expired. Reactivate with your credentials.');
    } else if (status === 409) {
      clearToken();
      lockSession();
      markActivationRevoked('You signed in on another device. Reactivate here to resume.');
    } else if (status === 423) {
      clearToken();
      lockSession();
      markActivationRevoked('This account is activated on another device. Ask admin to reset device binding.');
    }
    return Promise.reject(error);
  }
);

/* ============================
   ADMIN API HELPERS
   ============================ */

/** List manageable voter databases */
export async function adminListDatabases() {
  const { data } = await api.get('/api/admin/databases');
  return data?.databases || [];
}

/** List users (username, role, allowedDatabaseIds, timestamps) */
export async function adminListUsers() {
  const { data } = await api.get('/api/admin/users');
  return data?.users || [];
}

/**
 * Create user
 * @param {{username:string, password:string, role?:'user'|'operator'|'candidate'|'admin', allowedDatabaseIds?:string[], email?:string}} payload
 */
export async function adminCreateUser(payload) {
  const { data } = await api.post('/api/admin/users', payload);
  return data?.user;
}

/** Delete user by id */
export async function adminDeleteUser(userId) {
  await api.delete(`/api/admin/users/${userId}`);
  return true;
}

/** Update user role */
export async function adminUpdateUserRole(userId, role) {
  const { data } = await api.patch(`/api/admin/users/${userId}/role`, { role });
  return data?.user;
}

/** Update user password */
export async function adminUpdateUserPassword(userId, password) {
  await api.patch(`/api/admin/users/${userId}/password`, { password });
  return true;
}

/** Update user database access */
export async function adminUpdateUserDatabases(userId, allowedDatabaseIds) {
  const { data } = await api.patch(`/api/admin/users/${userId}/databases`, { allowedDatabaseIds });
  return data?.user;
}

/** Reset device binding (for candidate re-activation) */
export async function adminResetUserDevice(userId) {
  const { data } = await api.patch(`/api/admin/users/${userId}/reset-device`);
  return data?.user;
}

/* ============================
   AUTH HELPERS
   ============================ */

/**
 * Login (username-only on the backend).
 * We accept username OR email from the UI and map it to the `username` field, lowercased.
 * `userType` should be 'candidate' or 'volunteer' (volunteer = user/operator).
 */
export async function apiLogin({ username, email, password, userType }) {
  const userKey = (username || email || '').trim().toLowerCase();
  const { data } = await api.post('/api/auth/login', {
    username: userKey,
    password,
    userType,
  });
  return data;
}

export default api;
