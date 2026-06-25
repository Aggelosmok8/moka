import axios from "axios";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
if (!BACKEND_URL && import.meta.env.PROD) {
  // eslint-disable-next-line no-console
  console.warn(
    "[Moka] VITE_BACKEND_URL is not set — API calls fall back to a relative '/api' path and will fail in production. Set VITE_BACKEND_URL in your Vercel project environment variables."
  );
}
export const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = "moka_session_token";
export function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
export function setToken(token) { try { localStorage.setItem(TOKEN_KEY, token); } catch {} }
export function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch {} }

export const api = axios.create({ baseURL: API, timeout: 30000, withCredentials: false });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

export const fetchLeagues         = () => api.get("/leagues").then(r => r.data.leagues);
export const fetchTopTeams        = (limit = 8) => api.get(`/teams/top?limit=${limit}`).then(r => r.data.teams);
export const fetchTeams           = (league) => api.get(`/teams${league ? `?league=${league}` : ""}`).then(r => r.data.teams);
export const fetchTeam            = (id) => api.get(`/teams/${id}`).then(r => r.data);
export const fetchTrendingMatches = () => api.get("/matches/trending").then(r => r.data.matches);
export const fetchMatch           = (id) => api.get(`/matches/${id}`).then(r => r.data);
export const generateAnalysis     = (id, regenerate = false) => api.post(`/matches/${id}/analysis${regenerate ? "?regenerate=true" : ""}`).then(r => r.data);
export const fetchOdds            = (id) => api.get(`/matches/${id}/odds`).then(r => r.data);
export const fetchStatus          = () => api.get("/status").then(r => r.data);
export const refreshCache         = (scope = "all") => api.post(`/admin/refresh?scope=${scope}`).then(r => r.data);