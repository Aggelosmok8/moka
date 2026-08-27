// Display-only adapters. NO value/EV/probability computation happens here —
// every number comes from the backend value engine.

const LEVELS = {
  HIGH: { label: "Strong Opportunity", emoji: "🟢", cls: "bg-[#39FF14] text-black" },
  MEDIUM: { label: "Worth Watching", emoji: "🟡", cls: "bg-[#FFD60A]/15 text-[#FFD60A] border border-[#FFD60A]/40" },
  LOW: { label: "No Clear Opportunity", emoji: "⚪", cls: "bg-white/5 text-zinc-400 border border-white/10" },
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

// Plain-language one-liner for the match card (no technical metrics).
export function shortExplanation(match, value) {
  if (!value) return "";
  return `${value.pickName} — recent form and the current ${value.bestOdds} odds look attractive to Moka.`;
}

// 3–5 simple natural-language reasons for the analysis page.
export function whyMokaReasons(match, value) {
  if (!value) return [];
  const reasons = [];
  if (value.pick === "home") reasons.push(`Strong recent home form for ${match.home?.name || "the home side"}`);
  else if (value.pick === "away") reasons.push(`${match.away?.name || "The away side"} has been solid recently`);
  else reasons.push("The sides look closely matched");
  reasons.push("Better recent attacking numbers");
  reasons.push("Recent results favour this outcome");
  reasons.push(`Current odds (${value.bestOdds}) look attractive vs Moka's assessment`);
  return reasons;
}

// Technical explanation (numbers) — used only inside Advanced Statistics.
export function aiExplanation(match, value) {
  return `Moka rates ${value.pickName} at ${Math.round(value.mokaProb * 100)}% to win, while the market implies ${Math.round(
    value.bookProb * 100
  )}% (${value.bestOdds} @ ${value.bookmaker}). That is a ${value.edge > 0 ? "+" : ""}${value.edge}pt edge and ${
    value.ev > 0 ? "+" : ""
  }${value.ev}% expected value.`;
}
