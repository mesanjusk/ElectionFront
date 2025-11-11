// client/src/api.js
import axios from 'axios';
import { markActivationRevoked, getDeviceId } from './services/activation';
import { clearToken, lockSession } from './auth';

const raw = import.meta.env.VITE_API_URL || '';
const baseURL = raw.replace(/\/+$/, '');

if (!baseURL) {
  console.warn('VITE_API_URL is not set. API calls will fail.');
}

const api = axios.create({
  baseURL, // e.g. https://electionserver.onrender.com
  withCredentials: false,
});

// Attach bearer + device header
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  try {
    const deviceId = getDeviceId();
    if (deviceId) config.headers['X-Device-Id'] = deviceId;
  } catch (_) {}
  return config;
});

// Handle 401/403/409/423 consistently
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

export default api;
