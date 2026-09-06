"""Moka AI match-analysis (GPT-5.6 Luna via the direct OpenAI API).

The deterministic Moka engine computes ALL numbers. This module only turns the
already-computed structured data into a short natural-language explanation.
It never recalculates probabilities and never invents facts. Results are cached
(reusing apifootball's cache) keyed by match id + a hash of the input data, so
opening the same match again does NOT trigger another OpenAI request.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os

import apifootball as af

logger = logging.getLogger(__name__)

MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.6-luna")

SYSTEM = (
    "You are Moka, a professional football match analyst. You receive STRUCTURED "
    "data that Moka's own deterministic model already computed. Write a concise, "
    "natural analysis of about 110-150 words in clear English.\n"
    "STRICT RULES:\n"
    "- Use ONLY the data provided. Never invent statistics, injuries, player "
    "availability, odds or any fact.\n"
    "- Only mention a factor (expected goals, form, possession, injuries, odds) if "
    "it is actually present in the data.\n"
    "- Never say a team is unbeaten/in great form unless the numbers support it.\n"
    "- Never present the prediction as certain. Use hedged language such as 'the "
    "data suggests', 'the model estimates', 'likely'.\n"
    "- Do NOT recalculate or override the probabilities; they are final.\n"
    "- Cover, as short flowing paragraphs (no headers, no bullet symbols): the home "
    "team's strengths and weaknesses, the away team's strengths and weaknesses, and "
    "an overall match outlook consistent with the model's possible outcome."
)


def _clean(d):
    """Recursively drop None/empty so the model never sees missing-as-zero."""
    if isinstance(d, dict):
        return {k: _clean(v) for k, v in ((k, _clean(v)) for k, v in d.items())
                if v not in (None, "", [], {})}
    return d


def build_input(match: dict, value: dict) -> dict:
    pred = value.get("prediction") or {}
    home = match.get("home") or {}
    away = match.get("away") or {}
    hstat = match.get("homeTeam") or {}
    astat = match.get("awayTeam") or {}
    data = {
        "league": match.get("leagueName"),
        "home_team": home.get("name"),
        "away_team": away.get("name"),
        "moka_probabilities_pct": {
            "home": pred.get("home"), "draw": pred.get("draw"), "away": pred.get("away"),
        },
        "goal_markets_pct": {
            "over_2_5": pred.get("over25"), "under_2_5": pred.get("under25"),
            "btts_yes": pred.get("btts_yes"),
        },
        "expected_goals": {
            "home": pred.get("xg_home"), "away": pred.get("xg_away"),
            "total": pred.get("xg_total"),
        },
        "possible_outcome": value.get("possible_outcome"),
        "moka_pick": value.get("pick_name"),
        "best_odds": value.get("best_odds"),
        "bookmaker": value.get("bookmaker"),
        "potential_value_pct": value.get("ev_score"),
        "home_stats": {
            "goals_per_game": hstat.get("goalsScored"),
            "conceded_per_game": hstat.get("goalsConceded"),
            "possession": hstat.get("possession"),
        },
        "away_stats": {
            "goals_per_game": astat.get("goalsScored"),
            "conceded_per_game": astat.get("goalsConceded"),
            "possession": astat.get("possession"),
        },
    }
    return _clean(data)


async def match_analysis(match: dict, value: dict) -> dict:
    possible = value.get("possible_outcome")
    if not value:
        return {"analysis": None, "possible_outcome": possible, "error": True}

    data = build_input(match, value)
    raw = json.dumps(data, sort_keys=True)
    h = hashlib.sha1(raw.encode()).hexdigest()[:12]
    ck = f"ai_analysis_{match.get('id')}_{h}"

    cached = af._c_get(ck)
    if cached is not None:
        return {"analysis": cached, "possible_outcome": possible, "cached": True}

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {"analysis": None, "possible_outcome": possible, "error": "no_key"}

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)
        resp = await client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": "Match data (JSON):\n" + raw},
            ],
        )
        text = (resp.choices[0].message.content or "").strip()
    except Exception as e:
        logger.warning("ai_analysis(%s) failed: %s", match.get("id"), e)
        return {"analysis": None, "possible_outcome": possible, "error": True}

    if not text:
        return {"analysis": None, "possible_outcome": possible, "error": True}
    af._c_set(ck, text, ttl=24 * 3600)
    return {"analysis": text, "possible_outcome": possible, "cached": False}
