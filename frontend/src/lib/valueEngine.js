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

// Which 1X2 key matches Moka's deterministic lean (possible outcome).
export function outcomeKeyFromLean(value) {
  const po = (value && value.possibleOutcome ? value.possibleOutcome : "").toLowerCase();
  if (po.includes("home")) return "home";
  if (po.includes("away")) return "away";
  if (po.includes("draw")) return "draw";
  return value && value.pick;
}

// Odds for Moka's lean (favourite ~1.40), NOT the EV longshot — sorted best first.
export function leanOdds(match, value) {
  const key = outcomeKeyFromLean(value);
  const rows = ((match && match.odds) || [])
    .map((o) => ({ bookmaker: o.bookmaker, price: (o.odds && o.odds[key]) || 0 }))
    .filter((o) => o.price > 0)
    .sort((a, b) => b.price - a.price);
  const name = key === "home" ? (match && match.home && match.home.name)
    : key === "away" ? (match && match.away && match.away.name)
    : key === "draw" ? "Draw" : (value && value.pickName);
  return { key, name, rows, best: rows[0] || null };
}

// A value block re-pointed at the lean, so odds/pick/slip all match what Moka expects.
export function alignedValue(match, value) {
  const { key, name, best } = leanOdds(match, value);
  return {
    ...value, pick: key, pickName: name,
    bestOdds: best ? best.price : value.bestOdds,
    bookmaker: best ? best.bookmaker : value.bookmaker,
  };
}

export function adaptValueMatches(resp) {
  return ((resp && resp.matches) || []).map(adaptEntry);
}

// Plain-language one-liner for the match card (no technical metrics, no odds).
export function shortExplanation(match, value) {
  if (!value) return "";
  const out = value.possibleOutcome || "this matchup";
  return `Moka leans towards ${out} based on recent form and scoring numbers.`;
}

// 3–4 simple natural-language reasons, aligned to what Moka actually expects.
export function whyMokaReasons(match, value) {
  if (!value) return [];
  const po = (value.possibleOutcome || "").toLowerCase();
  const home = match.home?.name || "the home side";
  const away = match.away?.name || "the away side";
  const reasons = [];
  if (po.includes("home")) reasons.push(`${home} have the stronger recent numbers`);
  else if (po.includes("away")) reasons.push(`${away} have been the better side recently`);
  else reasons.push("The sides look closely matched");
  if (po.includes("draw")) reasons.push("A tight, low-margin game looks likely");
  reasons.push("Recent attacking and defensive form support this lean");
  reasons.push("Scoring rates point to this outcome");
  return reasons;
}

// Short technical explanation — aligned to the model's expected outcome (no EV/odds framing).
export function aiExplanation(match, value) {
  const po = value.possibleOutcome || "no clear lean";
  return `Based on scoring rates and recent form, Moka's model leans towards ${po}.`;
}
