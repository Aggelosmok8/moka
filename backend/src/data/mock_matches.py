"""Deterministic mock dataset: 35 matches across 7 leagues, 3 bookmakers each.

No external API. Seeded RNG -> identical output every run (testable).
"""
from __future__ import annotations

import random

from ..services.probability_engine import match_probabilities

MARGIN = 1.06  # ~6% bookmaker overround baked into the odds

LEAGUES = [
    ("epl", "Premier League", "football"),
    ("laliga", "La Liga", "football"),
    ("seriea", "Serie A", "football"),
    ("bundesliga", "Bundesliga", "football"),
    ("ligue1", "Ligue 1", "football"),
    ("nba", "NBA", "basketball"),
    ("euroleague", "EuroLeague", "basketball"),
]
BOOKMAKERS = ["Bet365", "Pinnacle", "Betsson"]
STATUSES = ["upcoming", "live", "finished"]


def _odds_from_model(home, away, rng: random.Random):
    """Realistic bookmaker odds anchored to the model's own probabilities, plus a
    small market disagreement and a bookmaker margin. Keeps edge/EV in a realistic
    range (roughly -13%..+13%) instead of random extremes."""
    model = match_probabilities(home, away)  # sums to 1
    noisy = {o: max(0.02, model[o] * (1 + rng.uniform(-0.14, 0.10))) for o in ("home", "draw", "away")}
    s = sum(noisy.values()) or 1.0
    market_true = {o: noisy[o] / s for o in noisy}
    base_odds = {o: 1.0 / (market_true[o] * MARGIN) for o in market_true}
    books = []
    for b in BOOKMAKERS:
        books.append({
            "bookmaker": b,
            "odds": {o: round(base_odds[o] * rng.uniform(0.985, 1.03), 2) for o in base_odds},
        })
    return books


def _team(name: str, rng: random.Random):
    return {
        "name": name,
        "form": rng.randint(2, 10),                       # 0-10
        "goalsScored": round(rng.uniform(0.8, 2.8), 2),
        "goalsConceded": round(rng.uniform(0.6, 2.2), 2),
        "possession": rng.randint(40, 62),
    }


def _build():
    rng = random.Random(42)  # deterministic
    matches = []
    counter = 0
    for lid, lname, sport in LEAGUES:
        for i in range(5):
            counter += 1
            home = _team(f"{lname} Club {i * 2 + 1}", rng)
            away = _team(f"{lname} Club {i * 2 + 2}", rng)
            matches.append({
                "id": f"{lid}_m{i}",
                "leagueId": lid,
                "leagueName": lname,
                "sport": sport,
                "status": STATUSES[counter % 3],
                "home": home,
                "away": away,
                "odds": _odds_from_model(home, away, rng),
            })
    return matches


MOCK_MATCHES = _build()
MATCH_INDEX = {m["id"]: m for m in MOCK_MATCHES}
