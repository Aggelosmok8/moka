// Approved-bookmaker allowlist. Odds data may contain many providers, but we
// only ever redirect users to reputable, verified bookmaker sites. Grey-market
// / unapproved providers (e.g. 1xBet, Stake) are intentionally NOT here: their
// odds can still be shown, but with no "Bet Now" redirect.
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
  "bwin": "https://sports.bwin.com/en/sports/football-4",
  "netbet": "https://www.netbet.com/football/",
  "interwetten": "https://www.interwetten.com/en/sportsbook/l/1/football",
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
  "parimatch": "https://www.parimatch.com/en/sports/football",
};

// Official football page for an APPROVED bookmaker, or null if not approved.
// Never fabricates URLs and never returns a link for an unapproved provider.
export function bookmakerUrl(name) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (MAP[key]) return MAP[key];
  for (const k of Object.keys(MAP)) {
    if (key.includes(k) || k.includes(key)) return MAP[k];
  }
  return null;
}

export const isApprovedBookmaker = (name) => !!bookmakerUrl(name);
