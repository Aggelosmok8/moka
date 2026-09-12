"""Value engine — the core 'Value Betting Intelligence' logic.

For each match: model probabilities (probability_engine) vs market implied
probabilities (best odds across bookmakers). Computes edge + EV, classifies a
value level and ranks matches by EV. This is a market-mispricing indicator —
not a guarantee or 'sure win'.
"""
from __future__ import annotations

from ..utils.math import implied_probability
from .probability_engine import full_prediction, possible_outcome


def pct100(probs: dict) -> dict:
    """Round the 1X2 probabilities to integers that sum to EXACTLY 100
    (largest-remainder method), so home+draw+away never exceeds 100%."""
    keys = ["home", "draw", "away"]
    raw = {k: (probs.get(k, 0) or 0) * 100 for k in keys}
    floor = {k: int(raw[k]) for k in keys}
    rem = int(round(100 - sum(floor.values())))
    order = sorted(keys, key=lambda k: raw[k] - floor[k], reverse=True)
    for i in range(max(0, rem)):
        floor[order[i % len(order)]] += 1
    return floor

OUTCOMES = ("home", "draw", "away")
MIN_PICK_PROB = 0.12  # ignore longshot outcomes (noise) when selecting a value pick

# Opportunity price band — a prediction is only a *betting opportunity* when its
# odds are attractive but not an extreme longshot.
MIN_OPP_ODDS = 1.40
MAX_OPP_ODDS = 3.00

_LEVEL_RANK = {"HIGH": 2, "MEDIUM": 1, "LOW": 0}


def _best_book_for(outcome: str, odds_list: list):
    """Bookmaker offering the highest (best-for-bettor) odds for an outcome."""
    best = max(odds_list, key=lambda o: o["odds"].get(outcome, 0))
    return best["bookmaker"], best["odds"][outcome]


def opportunity_level(edge: float, odds: float) -> str:
    """Classify ONLY the model's predicted outcome. Prediction first, value second.

    `edge` is a fraction (0.08 == +8 percentage points). Outcomes priced outside
    the [1.40, 3.00] band, or without a positive edge, are NOT opportunities —
    they still appear under All Matches, just as 'No Clear Opportunity'.
    """
    if odds < MIN_OPP_ODDS or odds > MAX_OPP_ODDS:
        return "LOW"
    if edge <= 0:
        return "LOW"
    if edge >= 0.08:
        return "HIGH"
    if edge >= 0.04:
        return "MEDIUM"
    return "LOW"


def evaluate_match(match: dict):
    """Return the value block for a match.

    Prediction first: the primary Moka pick is the model's MOST LIKELY outcome —
    never the highest-EV outcome. We then evaluate ONLY that predicted outcome's
    market price to classify it as an opportunity.
    """
    pred = full_prediction(match["home"], match["away"])
    probs = {"home": pred["home"], "draw": pred["draw"], "away": pred["away"]}
    odds_list = match.get("odds", [])
    if not odds_list:
        return None

    # STEP 3 — primary pick = model's prediction (argmax probability), NOT max EV.
    pick = max(OUTCOMES, key=lambda o: probs[o])
    bookmaker, odds = _best_book_for(pick, odds_list)
    model_p = probs[pick]
    implied = implied_probability(odds) if odds > 0 else 0.0
    ev = (model_p * odds - 1.0) if odds > 0 else 0.0
    edge = model_p - implied
    edge_pts = round(edge * 100, 1)
    # Classify from the rounded edge the user actually sees, so a displayed +8.0
    # is never shown as anything other than Strong.
    level = opportunity_level(edge_pts / 100.0, odds) if odds > 0 else "LOW"

    pick_name = (match["home"]["name"] if pick == "home"
                 else match["away"]["name"] if pick == "away" else "Draw")
    pct = pct100(probs)
    # Display the pick % from the SAME rounded integers as the chart so the
    # "~X%" text always matches the probability breakdown (edge/EV keep the
    # precise float above).
    confidence = pct[pick]
    ev_score = round(ev * 100, 1)
    value_score = max(0, round(edge_pts * 4 + confidence * 0.2))
    return {
        "match_id": match["id"],
        "pick": pick,
        "pick_name": pick_name,
        "best_odds": round(odds, 2),
        "bookmaker": bookmaker,
        "model_prob": round(pct[pick] / 100.0, 4),
        "market_prob": round(implied, 4),
        "edge": edge_pts,
        "ev_score": ev_score,
        "value_level": level,
        "confidence": confidence,
        "value_score": value_score,
        "probabilities": pct,
        "prediction": {
            **pct,
            "over25": round(pred["over25"] * 100),
            "under25": round(pred["under25"] * 100),
            "btts_yes": round(pred["btts_yes"] * 100),
            "btts_no": round(pred["btts_no"] * 100),
            "xg_home": pred["xg_home"],
            "xg_away": pred["xg_away"],
            "xg_total": pred["xg_total"],
        },
        "possible_outcome": possible_outcome(probs),
    }


def _stats(t: dict) -> dict:
    return {
        "form": t.get("form"),
        "goalsScored": t.get("goalsScored"),
        "goalsConceded": t.get("goalsConceded"),
        "possession": t.get("possession"),
    }


def public_match(m: dict) -> dict:
    """Match shape exposed by the API (no internal-only fields)."""
    return {
        "id": m["id"],
        "leagueId": m["leagueId"],
        "leagueName": m["leagueName"],
        "sport": m["sport"],
        "status": m["status"],
        "commence_time": m.get("commence_time"),
        "score": m.get("score"),
        "live": m.get("live"),
        "home": {"name": m["home"]["name"]},
        "away": {"name": m["away"]["name"]},
        "homeTeam": _stats(m["home"]),
        "awayTeam": _stats(m["away"]),
        "odds": m.get("odds", []),
    }


def reevaluate_pick(value: dict, probs: dict, match: dict) -> dict:
    """Re-derive the pick + opportunity from (possibly refined) probs so the
    chart, the 'Why Moka' text and the AI analysis all share ONE canonical
    source of truth. Used after H2H/form refinement changes the probabilities."""
    odds_list = match.get("odds") or []
    pick = max(OUTCOMES, key=lambda o: probs[o])
    if odds_list:
        bookmaker, odds = _best_book_for(pick, odds_list)
    else:
        bookmaker, odds = value.get("bookmaker"), value.get("best_odds") or 0.0
    model_p = probs[pick]
    implied = implied_probability(odds) if odds and odds > 0 else 0.0
    ev = (model_p * odds - 1.0) if odds and odds > 0 else 0.0
    edge_pts = round((model_p - implied) * 100, 1)
    pct = pct100(probs)
    confidence = pct[pick]  # match the chart integers (edge/EV keep the float)
    value.update({
        "pick": pick,
        "pick_name": (match["home"]["name"] if pick == "home"
                      else match["away"]["name"] if pick == "away" else "Draw"),
        "best_odds": round(odds, 2) if odds else value.get("best_odds"),
        "bookmaker": bookmaker,
        "model_prob": round(pct[pick] / 100.0, 4),
        "market_prob": round(implied, 4),
        "edge": edge_pts,
        "ev_score": round(ev * 100, 1),
        "confidence": confidence,
        "value_level": opportunity_level(edge_pts / 100.0, odds) if odds and odds > 0 else "LOW",
        "value_score": max(0, round(edge_pts * 4 + confidence * 0.2)),
    })
    return value


def rank_value_matches(matches: list) -> list:
    """Evaluate every match and rank opportunities first (Strong > Worth > rest)."""
    out = []
    for m in matches:
        v = evaluate_match(m)
        if v:
            out.append({"match": public_match(m), "value": v})
    out.sort(
        key=lambda e: (_LEVEL_RANK.get(e["value"]["value_level"], 0), e["value"]["value_score"]),
        reverse=True,
    )
    return out
