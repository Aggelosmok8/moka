// Maps The Odds API bookmaker names to their websites. Unknown books fall back
// to a web search so the link is always useful.
const MAP = {
  "bet365": "https://www.bet365.com",
  "pinnacle": "https://www.pinnacle.com",
  "william hill": "https://www.williamhill.com",
  "unibet": "https://www.unibet.com",
  "betfair": "https://www.betfair.com",
  "betfair sportsbook": "https://www.betfair.com",
  "888sport": "https://www.888sport.com",
  "sport 888": "https://www.888sport.com",
  "betway": "https://www.betway.com",
  "casumo": "https://www.casumo.com",
  "leovegas": "https://www.leovegas.com",
  "betano": "https://www.betano.com",
  "coolbet": "https://www.coolbet.com",
  "nordicbet": "https://www.nordicbet.com",
  "nordic bet": "https://www.nordicbet.com",
  "betsson": "https://www.betsson.com",
  "10bet": "https://www.10bet.com",
  "marathonbet": "https://www.marathonbet.com",
  "marathon bet": "https://www.marathonbet.com",
  "matchbook": "https://www.matchbook.com",
  "mr green": "https://www.mrgreen.com",
  "grosvenor": "https://www.grosvenorcasinos.com/online-sports-betting",
  "paddy power": "https://www.paddypower.com",
  "ladbrokes": "https://www.ladbrokes.com",
  "coral": "https://www.coral.co.uk",
  "sky bet": "https://www.skybet.com",
  "skybet": "https://www.skybet.com",
  "boylesports": "https://www.boylesports.com",
  "betfred": "https://www.betfred.com",
  "betvictor": "https://www.betvictor.com",
  "bet victor": "https://www.betvictor.com",
  "virgin bet": "https://www.virginbet.com",
  "fanduel": "https://sportsbook.fanduel.com",
  "draftkings": "https://sportsbook.draftkings.com",
  "betmgm": "https://sports.betmgm.com",
  "caesars": "https://www.caesars.com/sportsbook-and-casino",
  "pointsbet": "https://pointsbet.com",
  "betrivers": "https://www.betrivers.com",
  "superbook": "https://www.superbook.com",
  "wynnbet": "https://www.wynnbet.com",
  "1xbet": "https://1xbet.com",
  "stake": "https://stake.com",
};

export function bookmakerUrl(name) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (MAP[key]) return MAP[key];
  // fuzzy contains match
  for (const k of Object.keys(MAP)) {
    if (key.includes(k) || k.includes(key)) return MAP[k];
  }
  return `https://www.google.com/search?q=${encodeURIComponent(name + " sports betting")}`;
}
