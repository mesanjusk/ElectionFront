import axios from 'axios';

// Read once, normalize
const raw = import.meta.env.VITE_API_URL || '';
const baseURL = raw.replace(/\/+$/, ''); // strip trailing slash

if (!baseURL) {
  // eslint-disable-next-line no-console
  console.warn('VITE_API_URL is not set. API calls will fail.');
}

const api = axios.create({
  baseURL, // e.g. https://electionserver.onrender.com/api
  withCredentials: false,
});

// attach bearer if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
