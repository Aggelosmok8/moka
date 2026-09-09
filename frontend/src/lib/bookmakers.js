// Maps bookmaker names to their official sports-betting site so tapping an odd
// takes the user straight to that bookmaker to place the bet. Unknown books
// fall back to a Google search so the link is always useful.
const MAP = {
  "bet365": "https://www.bet365.com/#/AS/B1/",
  "pinnacle": "https://www.pinnacle.com/en/soccer/matchups",
  "william hill": "https://sports.williamhill.com/betting/en-gb/football",
  "unibet": "https://www.unibet.com/betting/sports/filter/football",
  "betfair": "https://www.betfair.com/sport/football",
  "betfair sportsbook": "https://www.betfair.com/sport/football",
  "888sport": "https://www.888sport.com/football/",
  "sport 888": "https://www.888sport.com/football/",
  "betway": "https://betway.com/en/sports/cat/soccer",
  "casumo": "https://www.casumo.com/en-gb/sports/football",
  "leovegas": "https://www.leovegas.com/en-gb/sport/football",
  "betano": "https://www.betano.com/sport/football/",
  "coolbet": "https://www.coolbet.com/en/sports/soccer",
  "nordicbet": "https://www.nordicbet.com/en/sportsbook/football",
  "nordic bet": "https://www.nordicbet.com/en/sportsbook/football",
  "betsson": "https://www.betsson.com/en/sportsbook/soccer",
  "10bet": "https://www.10bet.com/sports/football/",
  "marathonbet": "https://www.marathonbet.com/en/betting/Football",
  "marathon bet": "https://www.marathonbet.com/en/betting/Football",
  "matchbook": "https://www.matchbook.com/sports/events/soccer",
  "mr green": "https://www.mrgreen.com/en/sport/football",
  "grosvenor": "https://www.grosvenorcasinos.com/online-sports-betting/football",
  "paddy power": "https://www.paddypower.com/football",
  "ladbrokes": "https://sports.ladbrokes.com/sport/football",
  "coral": "https://sports.coral.co.uk/sport/football",
  "sky bet": "https://m.skybet.com/football",
  "skybet": "https://m.skybet.com/football",
  "boylesports": "https://www.boylesports.com/sports/football",
  "betfred": "https://www.betfred.com/sports/football",
  "betvictor": "https://www.betvictor.com/en-gb/sports/football",
  "bet victor": "https://www.betvictor.com/en-gb/sports/football",
  "virgin bet": "https://www.virginbet.com/sports/football",
  "fanduel": "https://sportsbook.fanduel.com/navigation/soccer",
  "draftkings": "https://sportsbook.draftkings.com/leagues/soccer",
  "betmgm": "https://sports.betmgm.com/en/sports/soccer-4",
  "caesars": "https://www.caesars.com/sportsbook-and-casino",
  "pointsbet": "https://pointsbet.com/sports/soccer",
  "betrivers": "https://www.betrivers.com/",
  "1xbet": "https://1xbet.com/en/line/football",
  "1xBet": "https://1xbet.com/en/line/football",
  "stake": "https://stake.com/sports/soccer",
  "dafabet": "https://www.dafabet.com/en/sports/football",
  "parimatch": "https://www.parimatch.com/en/sports/football",
};

// Returns the bookmaker's official football page (easy to place the bet),
// falling back to a Google search for books we don't have mapped.
export function bookmakerUrl(name) {
  if (!name) return "https://www.google.com/search?q=sports+betting+odds";
  const key = name.trim().toLowerCase();
  if (MAP[key]) return MAP[key];
  for (const k of Object.keys(MAP)) {
    if (key.includes(k) || k.includes(key)) return MAP[k];
  }
  return `https://www.google.com/search?q=${encodeURIComponent(name + " sports betting")}`;
}
