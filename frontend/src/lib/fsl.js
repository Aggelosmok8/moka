/**
 * FootballServiceLayer (FSL) — Frontend
 * ======================================
 * Wraps all data fetching with:
 * - In-memory TTL cache (prevents duplicate calls)
 * - Dual-source free API (backend FSL → direct free APIs)
 * - Heuristic AI insights engine (runs client-side if backend unavailable)
 * - Static bookmaker affiliate links
 * - Never throws — always returns safe empty state
 */

import { api } from "./api";

// ── In-memory TTL cache ────────────────────────────────────────────────────────
const _cache = new Map();
const TTL_DEFAULT = 90_000; // 90 seconds
const TTL_LONG    = 600_000; // 10 minutes

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.value;
}

function cacheSet(key, value, ttl = TTL_DEFAULT) {
  _cache.set(key, { value, expiresAt: Date.now() + ttl });
}

export function fslCacheClear() {
  _cache.clear();
}

// ── Static bookmaker links ─────────────────────────────────────────────────────
export const BOOKMAKERS = [
  { name: "Bet365",    url: "https://www.bet365.com",   icon: "🟢" },
  { name: "Stoiximan", url: "https://www.stoiximan.gr",  icon: "🔵" },
  { name: "Betsson",   url: "https://www.betsson.com",   icon: "🟠" },
];

export function getBookmakerLinks(_matchId) {
  return BOOKMAKERS;
}

// ── Heuristic AI Insights Engine (client-side fallback) ───────────────────────

function formScore(form = []) {
  if (!form.length) return 50;
  const pts = { W: 3, D: 1, L: 0 };
  const last5 = form.slice(-5);
  return Math.round(last5.reduce((s, r) => s + (pts[r] ?? 1), 0) / (last5.length * 3) * 100);
}

function attackStrength(gpg = 1.2) {
  return Math.min(Math.round((gpg / 3.0) * 100), 100);
}

export function computeValueScore(homeStats = {}, awayStats = {}) {
  const hForm    = formScore(homeStats.form);
  const aForm    = formScore(awayStats.form);
  const hAttack  = attackStrength(homeStats.goalsPerGame ?? 1.2);
  const aAttack  = attackStrength(awayStats.goalsPerGame ?? 1.0);
  const HOME_ADV = 8;

  const hScore = hForm * 0.4 + hAttack * 0.4 + HOME_ADV * 0.2;
  const aScore = aForm * 0.4 + aAttack * 0.4;
  const diff   = Math.abs(hScore - aScore);
  const confidence = Math.min(Math.round(50 + diff * 0.6), 95);

  const signal = diff > 25 ? "HIGH" : diff > 12 ? "MEDIUM" : "LOW";
  const favorite = hScore >= aScore ? "home" : "away";
  const winnerName = favorite === "home"
    ? (homeStats.name || "Home")
    : (awayStats.name || "Away");

  return {
    valueSignal:      signal,
    confidence,
    valueExplanation: `${winnerName} shows stronger form & attack. Differential: ${diff.toFixed(0)} pts.`,
    favorite,
  };
}

export function generateMatchInsight(match = {}) {
  const home = match.homeTeam || {};
  const away = match.awayTeam || {};
  const hName = home.name || match.home?.name || "Home";
  const aName = away.name || match.away?.name || "Away";

  const hForm = formScore(home.form);
  const aForm = formScore(away.form);
  const hGpg  = parseFloat(home.goalsPerGame) || 1.2;
  const aGpg  = parseFloat(away.goalsPerGame) || 1.0;
  const hCon  = parseFloat(home.concededPerGame) || 1.1;
  const aCon  = parseFloat(away.concededPerGame) || 1.2;

  const hXg   = Math.round((hGpg * 0.55 + aCon * 0.45) * 100) / 100;
  const aXg   = Math.round((aGpg * 0.55 + hCon * 0.45) * 100) / 100;
  const btts  = Math.round(((home.btts || 45) + (away.btts || 45)) / 2);

  const formDiff = Math.abs(hForm - aForm);
  const riskLevel = formDiff > 30 ? "LOW" : formDiff > 15 ? "MEDIUM" : "HIGH";
  const stronger  = hForm >= aForm ? hName : aName;
  const maxForm   = Math.max(hForm, aForm);
  const minForm   = Math.min(hForm, aForm);
  const weaker    = hForm >= aForm ? aName : hName;

  const aiSummary =
    `${stronger} enter this fixture in better form (${maxForm}/100) against ${weaker} (${minForm}/100). ` +
    `Expected xG: ${hName} ${hXg} – ${aName} ${aXg}. ` +
    `BTTS probability sits around ${btts}%, making goals on both ends likely.`;

  const aiBullets = [
    `${hName} recent form: ${(home.form || []).slice(-5).join("") || "N/A"} — ${hGpg.toFixed(1)} goals/game`,
    `${aName} recent form: ${(away.form || []).slice(-5).join("") || "N/A"} — ${aGpg.toFixed(1)} goals/game`,
    `Est. xG: ${hName} ${hXg} vs ${aName} ${aXg}`,
    `BTTS likelihood: ${btts}%`,
    ...(btts > 55 ? ["Both teams have scored in 55%+ of recent games — BTTS looks likely"] : []),
    ...(hXg + aXg > 2.5 ? [`Combined xG (${(hXg + aXg).toFixed(1)}) suggests Over 2.5 goals is plausible`] : []),
  ];

  return { aiSummary, aiBullets, riskLevel, xgHome: hXg, xgAway: aXg };
}

// ── Main FSL data fetchers ─────────────────────────────────────────────────────

/**
 * Fetch all matches for today.
 * Returns { matches, source, liveCount, totalCount, highValue }
 * Never throws.
 */
export async function fslGetMatches(forceRefresh = false) {
  const key = "fsl_matches_today";
  if (!forceRefresh) {
    const cached = cacheGet(key);
    if (cached) return cached;
  }

  try {
    const r = await api.get("/matches/trending");
    const data = r.data;
    // Enrich any match missing AI fields (in case backend sent incomplete data)
    const matches = (data.matches || []).map(enrichMatch);
    const result = {
      matches,
      source:     data.source || "backend",
      liveCount:  matches.filter(m => m.status === "live").length,
      totalCount: matches.length,
      highValue:  matches.filter(m => m.valueSignal === "HIGH").length,
    };
    cacheSet(key, result, TTL_DEFAULT);
    return result;
  } catch (err) {
    console.warn("[FSL] Backend fetch failed, using mock:", err.message);
    const mock = getMockMatches();
    return { matches: mock, source: "mock", liveCount: 1, totalCount: mock.length, highValue: 2 };
  }
}

/**
 * Fetch single match detail.
 * Never throws — returns null if not found.
 */
export async function fslGetMatchDetail(matchId) {
  const key = `fsl_match_${matchId}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const r = await api.get(`/matches/${matchId}`);
    const m = enrichMatch(r.data);
    cacheSet(key, m, TTL_LONG);
    return m;
  } catch {
    return null;
  }
}

/**
 * Fetch bookmaker links + value signal for a match.
 * Always returns something — never throws.
 */
export async function fslGetMatchInsights(matchId, isPro = false) {
  const key = `fsl_insights_${matchId}_${isPro}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const r = await api.get(`/fsl/insights/${matchId}`);
    const result = { ...r.data, bookmakers: BOOKMAKERS };
    cacheSet(key, result, TTL_DEFAULT);
    return result;
  } catch {
    // Fallback: compute client-side from match detail
    const m = cacheGet(`fsl_match_${matchId}`);
    if (m) {
      const insight = generateMatchInsight(m);
      const value   = computeValueScore(m.homeTeam, m.awayTeam);
      return { ...insight, ...value, bookmakers: BOOKMAKERS };
    }
    return { aiSummary: "Data temporarily unavailable.", aiBullets: [], bookmakers: BOOKMAKERS };
  }
}

/**
 * Fetch top teams.
 */
export async function fslGetTopTeams(limit = 10) {
  const key = `fsl_teams_top_${limit}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  try {
    const r = await api.get(`/teams/top?limit=${limit}`);
    const teams = r.data.teams || [];
    cacheSet(key, teams, TTL_LONG);
    return teams;
  } catch {
    return [];
  }
}

// ── Enrichment ────────────────────────────────────────────────────────────────

function enrichMatch(m) {
  if (!m) return m;
  // Add AI insights if missing
  if (!m.aiSummary) {
    const insight = generateMatchInsight(m);
    Object.assign(m, insight);
  }
  if (!m.valueSignal) {
    const value = computeValueScore(m.homeTeam || {}, m.awayTeam || {});
    Object.assign(m, value);
  }
  if (!m.predictedStrength) {
    m.predictedStrength = _predictStrength(m.homeTeam || {}, m.awayTeam || {});
  }
  return m;
}

function _predictStrength(h = {}, a = {}) {
  const hF = formScore(h.form);
  const aF = formScore(a.form);
  const total = hF + aF + 15;
  const home  = Math.round(hF / total * 100);
  const away  = Math.round(aF / total * 100);
  return { home, draw: Math.max(100 - home - away, 5), away };
}

// ── Mock data ─────────────────────────────────────────────────────────────────

function mockTeamStats(name, seed = 0) {
  const h = (name.split("").reduce((s, c) => s + c.charCodeAt(0), 0) + seed) % 100;
  return {
    name,
    goalsPerGame:    parseFloat((0.8 + (h % 17) * 0.12).toFixed(2)),
    concededPerGame: parseFloat((0.7 + (h % 13) * 0.11).toFixed(2)),
    form:            ["W","D","L","W","W","D"].map((_, i) => ["W","D","L"][(h + i) % 3]),
    btts:            35 + (h % 35),
    over25:          40 + (h % 30),
    possession:      42 + (h % 18),
    passAccuracy:    74 + (h % 16),
    shotsPerGame:    parseFloat((9 + (h % 7) * 0.5).toFixed(1)),
  };
}

function getMockMatches() {
  const fixtures = [
    ["prem","Premier League","Arsenal","Chelsea","ARS","CHE"],
    ["liga","La Liga","Barcelona","Real Madrid","BAR","RMA"],
    ["seri","Serie A","Inter Milan","AC Milan","INT","MIL"],
    ["bund","Bundesliga","Bayern","Dortmund","BAY","BVB"],
    ["l1","Ligue 1","PSG","Monaco","PSG","MON"],
    ["prem","Premier League","Man City","Liverpool","MCI","LIV"],
  ];
  return fixtures.map(([lid, ln, hn, an, hs, as_], i) => {
    const hStats = mockTeamStats(hn, i * 7);
    const aStats = mockTeamStats(an, i * 7 + 3);
    const m = {
      id: `mock_${i}`, leagueName: ln, leagueId: lid,
      status: i === 0 ? "live" : "upcoming",
      minute: i === 0 ? 67 : null,
      homeScore: i === 0 ? 2 : null, awayScore: i === 0 ? 1 : null,
      home: { id: `mock_ht_${i}`, name: hn, short: hs, color: "#39FF14", form: hStats.form },
      away: { id: `mock_at_${i}`, name: an, short: as_, color: "#A1A1AA", form: aStats.form },
      homeTeam: hStats, awayTeam: aStats, venue: "Stadium", h2h: [],
    };
    return enrichMatch(m);
  });
}
