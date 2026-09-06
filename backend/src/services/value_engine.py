"""Value engine — the core 'Value Betting Intelligence' logic.

For each match: model probabilities (probability_engine) vs market implied
probabilities (best odds across bookmakers). Computes edge + EV, classifies a
value level and ranks matches by EV. This is a market-mispricing indicator —
not a guarantee or 'sure win'.
"""
from __future__ import annotations

from ..utils.math import implied_probability
from .probability_engine import full_prediction, possible_outcome

OUTCOMES = ("home", "draw", "away")
MIN_PICK_PROB = 0.12  # ignore longshot outcomes (noise) when selecting a value pick


def _best_book_for(outcome: str, odds_list: list):
    """Bookmaker offering the highest (best-for-bettor) odds for an outcome."""
    best = max(odds_list, key=lambda o: o["odds"].get(outcome, 0))
    return best["bookmaker"], best["odds"][outcome]


def value_level(ev: float) -> str:
    if ev >= 0.05:
        return "HIGH"
    if ev >= 0.015:
        return "MEDIUM"
    return "LOW"


def evaluate_match(match: dict):
    """Return the value block for a match (best positive-EV outcome), or None."""
    pred = full_prediction(match["home"], match["away"])
    probs = {"home": pred["home"], "draw": pred["draw"], "away": pred["away"]}
    odds_list = match.get("odds", [])
    if not odds_list:
        return None

    candidates = [o for o in OUTCOMES if probs[o] >= MIN_PICK_PROB]
    if not candidates:
        candidates = [max(OUTCOMES, key=lambda o: probs[o])]
    best = None
    for outcome in candidates:
        bookmaker, odds = _best_book_for(outcome, odds_list)
        if odds <= 0:
            continue
        model_p = probs[outcome]
        implied = implied_probability(odds)
        ev = model_p * odds - 1.0
        edge = model_p - implied
        cand = {"outcome": outcome, "bookmaker": bookmaker, "odds": odds,
                "model_p": model_p, "implied": implied, "ev": ev, "edge": edge}
        if best is None or ev > best["ev"]:
            best = cand
    if best is None:
        return None

    pick_name = (match["home"]["name"] if best["outcome"] == "home"
                 else match["away"]["name"] if best["outcome"] == "away" else "Draw")
    confidence = round(best["model_p"] * 100)
    edge_pts = round(best["edge"] * 100, 1)
    ev_score = round(best["ev"] * 100, 1)
    value_score = max(0, round(edge_pts * 3 + ev_score * 0.8 + confidence * 0.2))
    return {
        "match_id": match["id"],
        "pick": best["outcome"],
        "pick_name": pick_name,
        "best_odds": round(best["odds"], 2),
        "bookmaker": best["bookmaker"],
        "model_prob": round(best["model_p"], 4),
        "market_prob": round(best["implied"], 4),
        "edge": edge_pts,
        "ev_score": ev_score,
        "value_level": value_level(best["ev"]),
        "confidence": confidence,
        "value_score": value_score,
        "probabilities": {k: round(v * 100) for k, v in probs.items()},
        "prediction": {
            "home": round(pred["home"] * 100),
            "draw": round(pred["draw"] * 100),
            "away": round(pred["away"] * 100),
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


def rank_value_matches(matches: list) -> list:
    """Evaluate every match and rank by EV (descending)."""
    out = []
    for m in matches:
        v = evaluate_match(m)
        if v:
            out.append({"match": public_match(m), "value": v})
    out.sort(key=lambda e: e["value"]["ev_score"], reverse=True)
    return out
