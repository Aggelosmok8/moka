"""Probability engine — deterministic Poisson-based match model.

No ML, no AI, no randomness, no external calls. Given each team's attacking
rate (goals scored / game), defensive rate (goals conceded / game) and recent
form (0-10), it derives expected goals for each side, then builds the full
score-probability matrix (Poisson) to produce deterministic markets:

  * 1X2  (home / draw / away)
  * Over/Under 2.5 goals
  * BTTS (both teams to score) yes / no
  * expected goals (home / away / total)

Missing inputs fall back to sensible league averages (never treated as 0).
Advanced signals (real xG/xGA, injuries, H2H) are optional multipliers applied
by the caller via `adjust` when that data is actually available — they are
never invented here.
"""
from __future__ import annotations

import math

from ..utils.math import normalize, clamp

# Explicit, separate home-advantage factor (added to home expected goals).
HOME_ADVANTAGE = 0.25
LEAGUE_AVG_GOALS = 1.30      # per team, per game — used only as a fallback
FORM_TILT = 0.15            # +/-15% swing between form 0 and 10
MAX_GOALS = 8               # score matrix ceiling (Poisson tail is negligible)


def _poisson_pmf(k: int, lam: float) -> float:
    return math.exp(-lam) * (lam ** k) / math.factorial(k)


def _rate(v, fallback):
    return v if (isinstance(v, (int, float)) and v > 0) else fallback


def expected_goals(home: dict, away: dict, adjust: dict | None = None) -> tuple[float, float]:
    """Deterministic expected goals for (home, away).

    home_attack blends the home side's scoring rate with the away side's
    conceding rate; symmetrically for away_attack. Recent form gently tilts
    each rate. `adjust` may carry optional multipliers derived from real
    advanced data (e.g. {"home_mult": 1.05, "away_mult": 0.92}).
    """
    h_gs = _rate(home.get("goalsScored"), 1.2)
    h_gc = _rate(home.get("goalsConceded"), 1.2)
    a_gs = _rate(away.get("goalsScored"), 1.1)
    a_gc = _rate(away.get("goalsConceded"), 1.2)
    h_form = _rate(home.get("form"), 5.0)
    a_form = _rate(away.get("form"), 5.0)

    home_attack = (h_gs + a_gc) / 2.0
    away_attack = (a_gs + h_gc) / 2.0

    home_attack *= 1.0 + (h_form - 5.0) / 5.0 * FORM_TILT
    away_attack *= 1.0 + (a_form - 5.0) / 5.0 * FORM_TILT

    adjust = adjust or {}
    home_attack *= float(adjust.get("home_mult", 1.0))
    away_attack *= float(adjust.get("away_mult", 1.0))

    home_xg = max(0.2, home_attack + HOME_ADVANTAGE)
    away_xg = max(0.2, away_attack)
    return round(home_xg, 2), round(away_xg, 2)


def full_prediction(home: dict, away: dict, adjust: dict | None = None) -> dict:
    """Full deterministic prediction (probabilities as 0-1 floats)."""
    home_xg, away_xg = expected_goals(home, away, adjust)
    hp = [_poisson_pmf(i, home_xg) for i in range(MAX_GOALS + 1)]
    ap = [_poisson_pmf(j, away_xg) for j in range(MAX_GOALS + 1)]

    p_home = p_draw = p_away = 0.0
    p_over = p_btts = 0.0
    for i, phi in enumerate(hp):
        for j, paj in enumerate(ap):
            p = phi * paj
            if i > j:
                p_home += p
            elif i == j:
                p_draw += p
            else:
                p_away += p
            if i + j >= 3:          # Over 2.5 == 3+ total goals
                p_over += p
            if i >= 1 and j >= 1:   # both teams score
                p_btts += p

    p_home, p_draw, p_away = normalize([p_home, p_draw, p_away])
    return {
        "home": p_home, "draw": p_draw, "away": p_away,
        "over25": clamp(p_over), "under25": clamp(1.0 - p_over),
        "btts_yes": clamp(p_btts), "btts_no": clamp(1.0 - p_btts),
        "xg_home": home_xg, "xg_away": away_xg,
        "xg_total": round(home_xg + away_xg, 2),
    }


def match_probabilities(home: dict, away: dict, adjust: dict | None = None) -> dict:
    """Return {home, draw, away} probabilities (0-1) that sum to 1."""
    f = full_prediction(home, away, adjust)
    return {"home": f["home"], "draw": f["draw"], "away": f["away"]}


def possible_outcome(probs: dict) -> str:
    """Human-readable outcome derived ONLY from the model probabilities.

    A confident favourite (>=50%) yields a single result; otherwise a safer
    double-chance recommendation for the stronger side.
    """
    h, d, a = probs.get("home", 0), probs.get("draw", 0), probs.get("away", 0)
    top = max(h, d, a)
    if top >= 0.50:
        if top == h:
            return "Home Win"
        if top == a:
            return "Away Win"
        return "Draw"
    return "Home or Draw" if h >= a else "Away or Draw"
