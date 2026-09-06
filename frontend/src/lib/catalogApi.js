// API layer. Value/EV/probabilities/ranking are computed SERVER-SIDE; the
// frontend only consumes these responses.
import { api } from "./api";

// --- Value Betting Intelligence Engine (single source of truth) ---
export const fetchValueMatches = (opts = {}) =>
  api.get(`/value-matches${opts.limit ? `?limit=${opts.limit}` : ""}`).then((r) => r.data);
export const fetchMatches = () => api.get("/matches").then((r) => r.data);
export const fetchMatchById = (id) => api.get(`/matches/${id}`).then((r) => r.data);
export const fetchResults = (ids) =>
  api.get(`/results`, { params: { ids: (ids || []).join(",") } }).then((r) => r.data.results || {});
export const fetchMatchAi = (id) =>
  api.get(`/matches/${id}/ai-analysis`, { timeout: 90000 }).then((r) => r.data);

// --- Entitlements / catalog (FREE/PRO gating + league browsing) ---
export const fetchEntitlements = () => api.get("/me/entitlements").then((r) => r.data);
export const fetchCatalogLeagues = () => api.get("/catalog/leagues").then((r) => r.data);
export const fetchCatalogMatches = (league) =>
  api.get(`/catalog/matches${league ? `?league=${encodeURIComponent(league)}` : ""}`).then((r) => r.data);
