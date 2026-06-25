"""Async client for api-sports.io / API-Football v3."""
import os
import logging
from typing import Any, Optional
import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://v3.football.api-sports.io"

LEAGUE_IDS = {
    "epl": 39,
    "laliga": 140,
    "seriea": 135,
    "bundesliga": 78,
    "ligue1": 61,
}
# Inverse: API league id -> internal slug
LEAGUE_SLUG = {v: k for k, v in LEAGUE_IDS.items()}


class QuotaExceeded(Exception):
    pass


class ApiFootballError(Exception):
    pass


async def _get(path: str, params: Optional[dict] = None) -> dict:
    key = os.environ.get("API_FOOTBALL_KEY", "")
    if not key:
        raise ApiFootballError("API_FOOTBALL_KEY not configured")
    headers = {"x-apisports-key": key, "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(f"{BASE_URL}{path}", headers=headers, params=params or {})
    if r.status_code == 429:
        raise QuotaExceeded("API-Football daily quota exhausted")
    if r.status_code >= 400:
        raise ApiFootballError(f"{r.status_code}: {r.text[:200]}")
    data = r.json()
    errors = data.get("errors")
    if errors and (isinstance(errors, list) and errors or isinstance(errors, dict) and errors):
        # api-sports returns errors as dict with messages OR list when ok
        if isinstance(errors, dict):
            msg = next(iter(errors.values()), "unknown")
            if "limit" in str(msg).lower() or "rate" in str(msg).lower():
                raise QuotaExceeded(str(msg))
            raise ApiFootballError(str(msg))
    return data


def get_season() -> int:
    return int(os.environ.get("API_FOOTBALL_SEASON", "2024"))


async def status() -> dict:
    return await _get("/status")


async def standings(league_id: int) -> dict:
    return await _get("/standings", {"league": league_id, "season": get_season()})


async def team_statistics(team_id: int, league_id: int) -> dict:
    return await _get(
        "/teams/statistics",
        {"team": team_id, "league": league_id, "season": get_season()},
    )


async def team_last_fixtures(team_id: int, last: int = 10) -> dict:
    # Free plan rejects the `last` param — fetch all team fixtures for the season and let caller slice.
    return await _get("/fixtures", {"team": team_id, "season": get_season()})


async def league_upcoming(league_id: int, next_n: int = 3) -> dict:
    # Free plan rejects the `next` param — fetch all NS fixtures for the league.
    return await _get(
        "/fixtures",
        {"league": league_id, "season": get_season(), "status": "NS"},
    )


async def league_recent(league_id: int) -> dict:
    """Recently finished fixtures (used to fill the home feed alongside live)."""
    return await _get(
        "/fixtures",
        {"league": league_id, "season": get_season(), "status": "FT"},
    )


async def live_fixtures() -> dict:
    return await _get("/fixtures", {"live": "all"})


async def head_to_head(team1: int, team2: int, last: int = 5) -> dict:
    return await _get("/fixtures/headtohead", {"h2h": f"{team1}-{team2}", "last": last})
