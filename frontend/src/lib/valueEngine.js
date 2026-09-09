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
    prediction: v.prediction || null,
    possibleOutcome: v.possible_outcome || null,
    signals: v.signals || null,
    liveOnly: v.live_only || false,
    livePrediction: v.live_prediction || null,
    liveAnalysis: v.live_analysis || null,
  };
}

export function adaptEntry(e) {
  return { match: e.match, value: adaptValue(e.value) };
}

export function adaptValueMatches(resp) {
  return ((resp && resp.matches) || []).map(adaptEntry);
}

// Plain-language one-liner for the match card — always about the Moka pick.
export function shortExplanation(match, value) {
  if (!value) return "";
  const mp = Math.round((value.mokaProb || 0) * 100);
  const bp = Math.round((value.bookProb || 0) * 100);
  if (mp && bp) {
    return `Moka's pick is ${value.pickName} — estimated ~${mp}% vs the market's ~${bp}%.`;
  }
  return `Moka's pick is ${value.pickName} based on recent form and scoring numbers.`;
}

// 3–4 simple reasons, all about the SAME Moka pick.
export function whyMokaReasons(match, value) {
  if (!value) return [];
  const mp = Math.round((value.mokaProb || 0) * 100);
  const bp = Math.round((value.bookProb || 0) * 100);
  const reasons = [];
  reasons.push(`Moka estimates ${value.pickName} at ~${mp}%`);
  if (bp) reasons.push(`The market price implies only ~${bp}%`);
  if (value.edge > 0) reasons.push(`That's a +${value.edge}pt edge at ${value.bestOdds}`);
  reasons.push("Recent scoring rates and form support this pick");
  return reasons;
}

// Short technical explanation — same pick as everywhere else.
export function aiExplanation(match, value) {
  if (!value) return "";
  const mp = Math.round((value.mokaProb || 0) * 100);
  const bp = Math.round((value.bookProb || 0) * 100);
  return `Moka predicts ${value.pickName} (~${mp}%); the market implies ~${bp}% at ${value.bestOdds}.`;
}
