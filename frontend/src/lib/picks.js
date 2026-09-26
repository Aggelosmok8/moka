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

// The two things a user could actually have played when the model says
// "Home or Draw": the straight win, or the double chance.
export const pickChoices = (match, value) => {
  const side = NORM(value?.pick) === "away" ? "away" : "home";
  const team = side === "away" ? match?.away?.name : match?.home?.name;
  const other = side === "away" ? match?.home?.name : match?.away?.name;
  return [
    { pick: side, pickName: team || value?.pickName || "Win", label: `${team || "Win"} to win`, code: side === "away" ? "2" : "1" },
    {
      pick: side === "away" ? "away_or_draw" : "home_or_draw",
      pickName: `${team || side} or Draw`,
      label: `${team || side} or Draw (vs ${other || "opponent"})`,
      code: side === "away" ? "X2" : "1X",
      doubleChance: true,
    },
  ];
};

export const matchKey = (home, away) =>
  `${NORM(home).replace(/[^a-z0-9]/g, "")}|${NORM(away).replace(/[^a-z0-9]/g, "")}`;

// Settlement for Specific Bets picks. Returns "won" / "lost", or null when the
// market cannot be settled from the final score (cards, corners, first half,
// player markets) — those stay pending instead of being wrongly marked lost.
export const settleStatus = (pick, r) => {
  const p = NORM(pick);
  if (WINNING_OUTCOMES[p]) return legWins(p, r?.outcome) ? "won" : "lost";
  const hs = Number(r?.home);
  const as = Number(r?.away);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
  const total = hs + as;
  let m;
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
  if ((m = p.match(/^(home|away)_hcp_(-?[\d.]+)$/))) {
    const diff = m[1] === "home" ? hs - as : as - hs;
    return diff + parseFloat(m[2]) > 0 ? "won" : "lost";
  }
  return null;
};
