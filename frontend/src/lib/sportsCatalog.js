// Static mirror of backend core/entitlements.py LEAGUE_CATALOG.
// Used purely for UI rendering of league chips (including PRO-only ones shown
// as locked). Source of truth for ACCESS remains the backend endpoints.
export const SPORTS = [
  { key: "football", label: "Football", icon: "⚽", available: true },
  { key: "basketball", label: "Basketball", icon: "🏀", available: true },
];

export const LEAGUE_CATALOG = [
  { id: "epl", name: "Premier League (England)", sport: "football", group: "Football", pro_only: false },
  { id: "laliga", name: "La Liga (Spain)", sport: "football", group: "Football", pro_only: false },
  { id: "seriea", name: "Serie A (Italy)", sport: "football", group: "Football", pro_only: false },
  { id: "bundesliga", name: "Bundesliga (Germany)", sport: "football", group: "Football", pro_only: false },
  { id: "ligue1", name: "Ligue 1 (France)", sport: "football", group: "Football", pro_only: false },
  { id: "eredivisie", name: "Eredivisie (Netherlands)", sport: "football", group: "Football", pro_only: false },
  { id: "primeira", name: "Primeira Liga (Portugal)", sport: "football", group: "Football", pro_only: false },
  { id: "championship", name: "Championship (England)", sport: "football", group: "Football", pro_only: false },
  { id: "superleague", name: "Super League 1 (Greece)", sport: "football", group: "Football", pro_only: false },
  { id: "denmark", name: "Superliga (Denmark)", sport: "football", group: "Football", pro_only: false },
  { id: "scotland", name: "Premiership (Scotland)", sport: "football", group: "Football", pro_only: false },
  { id: "nba", name: "NBA (USA)", sport: "basketball", group: "Basketball", pro_only: false },
  { id: "euroleague", name: "EuroLeague", sport: "basketball", group: "Basketball", pro_only: false },
];

export const leaguesForSport = (sport) => LEAGUE_CATALOG.filter((l) => l.sport === sport);
