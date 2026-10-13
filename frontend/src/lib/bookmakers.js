// Only bookmakers holding a Greek (ΕΕΕΠ / HGC) licence are linked, and always
// to their .gr site. Every other operator (Betano, Unibet, William Hill,
// BetVictor, Betway, Pinnacle, Marathonbet, 1xBet, Betfair…) serves a Greek
// visitor a "not available in your country" page, so it gets NO redirect here.
const MAP = {
  "stoiximan": "https://www.stoiximan.gr/sport/podosfairo/",
  "novibet": "https://www.novibet.gr/stoixima/podosfairo",
  "pame stoixima": "https://www.pamestoixima.gr/sports/soccer",
  "pamestoixima": "https://www.pamestoixima.gr/sports/soccer",
  "opap": "https://www.pamestoixima.gr/sports/soccer",
  "elabet": "https://www.elabet.gr/sports/football",
  "bwin": "https://sports.bwin.gr/el/sports/podosfairo-4",
  "bet365": "https://www.bet365.gr/#/AS/B1/",
  "betsson": "https://www.betsson.gr/sports/podosfairo",
  "netbet": "https://www.netbet.gr/sports/football",
  "interwetten": "https://www.interwetten.gr/el/sportsbook/l/1/podosfairo",
  "winmasters": "https://www.winmasters.gr/el/sports/podosfairo",
  "fonbet": "https://www.fonbet.gr/sports/football",
  "superbet": "https://www.superbet.gr/stoixima/podosfairo",
  "vistabet": "https://www.vistabet.gr/el/sports/podosfairo",
  "sportingbet": "https://sports.sportingbet.gr/el/sports/podosfairo-4",
  "efbet": "https://www.efbet.gr/sports/football",
};

// Official Greek-licensed football page for a bookmaker, or null when the
// operator is not licensed here. Never fabricates a URL.
export function bookmakerUrl(name) {
  if (!name) return null;
  const key = name.trim().toLowerCase().replace(/\.gr$/, "").trim();
  return MAP[key] || MAP[key.replace(/\s+/g, "")] || null;
}

export const isApprovedBookmaker = (name) => !!bookmakerUrl(name);

// Every book we link to is Greek-licensed, so "playable here" == has a link.
export const isGreekBook = (name) => !!bookmakerUrl(name);
