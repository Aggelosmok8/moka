"""Async client for The Odds API v4 (https://the-odds-api.com).

Free plan: 500 requests/month. One call per (sport_key, markets, regions) returns
ALL upcoming events for that league, so we cache aggressively.
"""
import os
import logging
import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.the-odds-api.com/v4"

# Map our internal league slugs → The Odds API sport keys
SPORT_KEYS = {
    "epl": "soccer_epl",
    "laliga": "soccer_spain_la_liga",
    "seriea": "soccer_italy_serie_a",
    "bundesliga": "soccer_germany_bundesliga",
    "ligue1": "soccer_france_ligue_one",
}


class OddsApiError(Exception):
    pass


class OddsQuotaExceeded(Exception):
    pass


async def league_odds(sport_key: str, regions: str = "uk,eu", markets: str = "h2h,totals") -> tuple[list, dict]:
    """Returns (events, quota) where quota = {'remaining': int, 'used': int}."""
    key = os.environ.get("ODDS_API_KEY", "")
    if not key:
        raise OddsApiError("ODDS_API_KEY not configured")
    url = f"{BASE_URL}/sports/{sport_key}/odds"
    params = {"apiKey": key, "regions": regions, "markets": markets, "oddsFormat": "decimal"}
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.get(url, params=params)
    quota = {
        "remaining": int(r.headers.get("x-requests-remaining", 0) or 0),
        "used": int(r.headers.get("x-requests-used", 0) or 0),
    }
    if r.status_code == 429:
        raise OddsQuotaExceeded("Odds API monthly quota exhausted")
    if r.status_code == 401:
        raise OddsApiError("Invalid ODDS_API_KEY")
    if r.status_code >= 400:
        raise OddsApiError(f"{r.status_code}: {r.text[:200]}")
    return r.json(), quota
