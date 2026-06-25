// Static mirror of backend core/entitlements.py LEAGUE_CATALOG.
// Used purely for UI rendering of league chips (including PRO-only ones shown
// as locked). Source of truth for ACCESS remains the backend endpoints.
export const SPORTS = [
  { key: "football", label: "Football", icon: "⚽" },
  { key: "basketball", label: "Basketball", icon: "🏀" },
];

export const LEAGUE_CATALOG = [
  { id: "epl", name: "Premier League", sport: "football", pro_only: false },
  { id: "laliga", name: "La Liga", sport: "football", pro_only: false },
  { id: "seriea", name: "Serie A", sport: "football", pro_only: false },
  { id: "bundesliga", name: "Bundesliga", sport: "football", pro_only: false },
  { id: "ligue1", name: "Ligue 1", sport: "football", pro_only: false },
  { id: "nba", name: "NBA", sport: "basketball", pro_only: false },
  { id: "euroleague", name: "EuroLeague", sport: "basketball", pro_only: false },
  { id: "eredivisie", name: "Eredivisie", sport: "football", pro_only: true },
  { id: "primeira", name: "Primeira Liga", sport: "football", pro_only: true },
  { id: "championship", name: "EFL Championship", sport: "football", pro_only: true },
  { id: "mls", name: "MLS", sport: "football", pro_only: true },
  { id: "ncaab", name: "NCAA Basketball", sport: "basketball", pro_only: true },
];

export const leaguesForSport = (sport) => LEAGUE_CATALOG.filter((l) => l.sport === sport);
