"""Probability engine — simple deterministic rules-based 1X2 model.

No ML, no AI, no external calls. Inputs: form (0-10), goals scored/conceded.
"""
from __future__ import annotations

from ..utils.math import normalize

HOME_ADVANTAGE = 1.2


def _strength(form: float, goals_scored: float, goals_conceded: float) -> float:
    return form * 1.0 + goals_scored * 0.6 - goals_conceded * 0.4


def match_probabilities(home: dict, away: dict) -> dict:
    """Return {home, draw, away} probabilities (0-1) that sum to 1."""
    hs = _strength(home.get("form", 5), home.get("goalsScored", 1.2), home.get("goalsConceded", 1.2)) + HOME_ADVANTAGE
    aw = _strength(away.get("form", 5), away.get("goalsScored", 1.0), away.get("goalsConceded", 1.2))
    hs = max(0.1, hs)
    aw = max(0.1, aw)
    closeness = 1.0 / (1.0 + abs(hs - aw))   # more draw weight when teams are close
    draw = 1.6 * closeness
    home_p, draw_p, away_p = normalize([hs, draw, aw])
    return {"home": home_p, "draw": draw_p, "away": away_p}
