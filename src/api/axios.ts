import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL?.replace(/\/+$/, "") ?? "";
// Optional: fail early if not set
if (!baseURL) {
  // eslint-disable-next-line no-console
  console.warn("VITE_API_URL is not set. API calls may fail.");
}

export const api = axios.create({
  baseURL, // e.g. https://electionserver.onrender.com
  withCredentials: false
});
