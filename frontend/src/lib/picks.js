// Pick markets: the model's "possible outcome" can be a double chance
// (e.g. "Home or Draw"), so a draw must NOT settle as a loss.
const NORM = (s) => (s || "").toString().trim().toLowerCase();

export const WINNING_OUTCOMES = {
  home: ["home"],
  draw: ["draw"],
  away: ["away"],
  home_or_draw: ["home", "draw"],
  away_or_draw: ["away", "draw"],
  home_or_away: ["home", "away"],
};

export const legWins = (pick, outcome) =>
  (WINNING_OUTCOMES[NORM(pick)] || [NORM(pick)]).includes(NORM(outcome));

export const isDoubleChance = (value) => /or\s+draw/i.test(value?.possibleOutcome || "");

// The three things a user could actually have played when the model says
// "Home or Draw": the straight win, the draw, or the double chance.
export const pickChoices = (match, value) => {
  const side = NORM(value?.pick) === "away" ? "away" : "home";
  const team = side === "away" ? match?.away?.name : match?.home?.name;
  const other = side === "away" ? match?.home?.name : match?.away?.name;
  return [
    { pick: side, pickName: team || value?.pickName || "Win", label: `${team || "Win"} to win`, code: side === "away" ? "2" : "1", outcome: side },
    { pick: "draw", pickName: "Draw", label: "Draw", code: "X", outcome: "draw" },
    {
      pick: side === "away" ? "away_or_draw" : "home_or_draw",
      pickName: `${team || side} or Draw`,
      label: `${team || side} or Draw (vs ${other || "opponent"})`,
      code: side === "away" ? "X2" : "1X",
      outcome: side === "away" ? "away_or_draw" : "home_or_draw",
      doubleChance: true,
    },
  ];
};

// Best published price per outcome, plus the implied double-chance prices, so a
// chosen scenario arrives in the slip already priced instead of empty.
export const bestOddsByOutcome = (match) => {
  const best = {};
  for (const e of match?.odds || []) {
    for (const sel of ["home", "draw", "away"]) {
      const p = Number(e?.odds?.[sel]);
      if (p > 1 && (!best[sel] || p > best[sel].odds)) best[sel] = { odds: p, bookmaker: e.bookmaker };
    }
  }
  const dc = (a, b) => (best[a] && best[b]
    ? { odds: Math.round((1 / (1 / best[a].odds + 1 / best[b].odds)) * 100) / 100, bookmaker: "" }
    : null);
  return { ...best, home_or_draw: dc("home", "draw"), away_or_draw: dc("away", "draw") };
};

export const matchKey = (home, away) =>
  `${NORM(home).replace(/[^a-z0-9]/g, "")}|${NORM(away).replace(/[^a-z0-9]/g, "")}`;

// Settlement for Specific Bets picks. Returns "won" / "lost", or null when the
// market cannot be settled from the final score (cards, corners, first half,
// player markets) — those stay pending instead of being wrongly marked lost.
// Picks that cannot be settled from the final score alone — they need the
// match's stat totals / goal sequence / player numbers.
export const needsDetail = (pick) => /^(cards|corners|fouls|offsides|fh|anyt|p\d+|home_fouls|away_fouls|home_saves|away_saves)_/.test(NORM(pick));

const ou = (kind, line, value) => {
  if (!Number.isFinite(value)) return null;
  return (kind === "over" ? value > line : value < line) ? "won" : "lost";
};

export const settleStatus = (pick, r) => {
  const p = NORM(pick);
  if (WINNING_OUTCOMES[p]) return legWins(p, r?.outcome) ? "won" : "lost";
  const hs = Number(r?.home);
  const as = Number(r?.away);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
  const total = hs + as;
  const d = r?.detail;
  const t = d?.totals;
  let m;
  // --- Specific bets settled from the real match stats ---------------------
  if ((m = p.match(/^(cards|corners|fouls|offsides)_(over|under)_([\d.]+)$/))) {
    return t ? ou(m[2], parseFloat(m[3]), Number(t[m[1]])) : null;
  }
  if ((m = p.match(/^(home|away)_(fouls|saves)_over_([\d.]+)$/))) {
    return t ? ou("over", parseFloat(m[3]), Number(t[`${m[2]}_${m[1]}`])) : null;
  }
  if ((m = p.match(/^fh_(over|under)_([\d.]+)$/))) {
    const fh = Number(r?.ht_home) + Number(r?.ht_away);
    return ou(m[1], parseFloat(m[2]), fh);
  }
  if (p === "fh_btts_yes") {
    const h = Number(r?.ht_home), a = Number(r?.ht_away);
    if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
    return h > 0 && a > 0 ? "won" : "lost";
  }
  if ((m = p.match(/^anyt_(\d+)_(\d+)$/))) {
    const x = Number(m[1]), y = Number(m[2]);
    if (x > hs || y > as) return "lost";          // impossible, whatever the order
    if (!Array.isArray(d?.goal_seq)) return null;  // needs the goal order
    const seen = [[0, 0], ...d.goal_seq];
    return seen.some(([h, a]) => h === x && a === y) ? "won" : "lost";
  }
  if ((m = p.match(/^p(\d+)_(score|assist|card)$/))) {
    const ps = d?.players?.[m[1]];
    if (!ps) return null;
    const v = m[2] === "score" ? ps.goals : m[2] === "assist" ? ps.assists : ps.cards;
    return Number(v) > 0 ? "won" : "lost";
  }
  if ((m = p.match(/^p(\d+)_(shots|sot)_over_([\d.]+)$/))) {
    const ps = d?.players?.[m[1]];
    if (!ps) return null;
    return ou("over", parseFloat(m[3]), Number(m[2] === "shots" ? ps.shots : ps.sot));
  }
  // --- Score-based markets --------------------------------------------------
  if ((m = p.match(/^(over|under)_([\d.]+)$/))) {
    const isOver = total > parseFloat(m[2]);
    return (m[1] === "over") === isOver ? "won" : "lost";
  }
  if (p === "btts_yes") return hs > 0 && as > 0 ? "won" : "lost";
  if (p === "btts_no") return hs > 0 && as > 0 ? "lost" : "won";
  if ((m = p.match(/^(home|away)_over_([\d.]+)$/))) {
    const g = m[1] === "home" ? hs : as;
    return g > parseFloat(m[2]) ? "won" : "lost";
  }
  if ((m = p.match(/^cs_(\d+)_(\d+)$/))) {
    return hs === Number(m[1]) && as === Number(m[2]) ? "won" : "lost";
  }
  if ((m = p.match(/^(home|away)_hcp_(-?[\d.]+)$/))) {
    const diff = m[1] === "home" ? hs - as : as - hs;
    return diff + parseFloat(m[2]) > 0 ? "won" : "lost";
  }
  return null;
};
