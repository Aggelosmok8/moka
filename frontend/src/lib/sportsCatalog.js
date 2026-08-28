// Static mirror of backend core/entitlements.py LEAGUE_CATALOG.
// Used purely for UI rendering of league chips (including PRO-only ones shown
// as locked). Source of truth for ACCESS remains the backend endpoints.
export const SPORTS = [
  { key: "football", label: "Football", icon: "⚽", available: true },
  { key: "basketball", label: "Basketball", icon: "🏀", available: false },
];

export const LEAGUE_CATALOG = [
  { id: "denmark", name: "Superliga (Denmark)", sport: "football", pro_only: false },
  { id: "scotland", name: "Premiership (Scotland)", sport: "football", pro_only: false },
];

export const leaguesForSport = (sport) => LEAGUE_CATALOG.filter((l) => l.sport === sport);
