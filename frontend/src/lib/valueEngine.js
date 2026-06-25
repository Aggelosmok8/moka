// Display-only adapters. NO value/EV/probability computation happens here —
// every number comes from the backend value engine.

const LEVELS = {
  HIGH: { label: "High Value", emoji: "🔥", cls: "bg-[#39FF14] text-black" },
  MEDIUM: { label: "Medium Value", emoji: "🟢", cls: "bg-[#34C759]/20 text-[#34C759] border border-[#34C759]/40" },
  LOW: { label: "Low Value", emoji: "🟡", cls: "bg-[#FF9500]/15 text-[#FF9500] border border-[#FF9500]/40" },
};

export function levelStyle(level) {
  return LEVELS[level] || LEVELS.LOW;
}

// Map a backend value block to the shape the UI components render.
export function adaptValue(v) {
  if (!v) return null;
  return {
    mokaProb: v.model_prob,
    bookProb: v.market_prob,
    bestOdds: v.best_odds,
    bookmaker: v.bookmaker,
    ev: v.ev_score,
    edge: v.edge,
    confidence: v.confidence,
    valueScore: v.value_score,
    pick: v.pick,
    pickName: v.pick_name,
    valueLevel: v.value_level,
    level: levelStyle(v.value_level),
    probabilities: v.probabilities || {},
  };
}

export function adaptEntry(e) {
  return { match: e.match, value: adaptValue(e.value) };
}

export function adaptValueMatches(resp) {
  return ((resp && resp.matches) || []).map(adaptEntry);
}

// Display-only explanation string (formats backend figures, computes nothing).
export function aiExplanation(match, value) {
  return `Moka rates ${value.pickName} at ${Math.round(value.mokaProb * 100)}% to win, while the market implies ${Math.round(
    value.bookProb * 100
  )}% (${value.bestOdds} @ ${value.bookmaker}). That is a ${value.edge > 0 ? "+" : ""}${value.edge}pt edge and ${
    value.ev > 0 ? "+" : ""
  }${value.ev}% expected value.`;
}
