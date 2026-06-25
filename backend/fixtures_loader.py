"""Fixtures loader — live + upcoming + team fixtures with cache + fallback."""
import logging
from typing import Optional

from cache import TTLCache
import api_football as af
from api_football import LEAGUE_IDS, LEAGUE_SLUG, QuotaExceeded
from mock_data import TEAM_MAP as MOCK_TEAM_MAP, LEAGUE_MAP, get_trending_matches as mock_trending
from standings_loader import _enrich_team_base, API_TO_INTERNAL

logger = logging.getLogger(__name__)

TTL_UPCOMING = 30 * 60
TTL_LIVE = 60
TTL_FIXTURES_TEAM = 6 * 3600


def parse_fixture(fx: dict) -> Optional[dict]:
    fixture = fx.get("fixture", {}) or {}
    league = fx.get("league", {}) or {}
    teams = fx.get("teams", {}) or {}
    goals = fx.get("goals", {}) or {}
    home_t = teams.get("home", {}) or {}
    away_t = teams.get("away", {}) or {}
    home_api = home_t.get("id")
    away_api = away_t.get("id")
    if home_api is None or away_api is None:
        return None
    api_league_id = league.get("id")
    league_slug = LEAGUE_SLUG.get(api_league_id, "")
    if not league_slug:
        return None
    status_short = (fixture.get("status", {}) or {}).get("short", "NS")
    elapsed = (fixture.get("status", {}) or {}).get("elapsed")
    if status_short in ("1H", "2H", "ET", "LIVE", "HT", "BT", "P"):
        status = "live"
    elif status_short in ("FT", "AET", "PEN"):
        status = "finished"
    else:
        status = "upcoming"
    home = _enrich_team_base(home_t, home_api)
    away = _enrich_team_base(away_t, away_api)
    mh = MOCK_TEAM_MAP.get(home["id"], {})
    ma = MOCK_TEAM_MAP.get(away["id"], {})
    home["form"] = mh.get("form", ["W", "D", "W", "L", "W"])
    away["form"] = ma.get("form", ["W", "L", "D", "W", "L"])
    venue = (fixture.get("venue", {}) or {}).get("name") or f"{home['name']} Stadium"
    fixture_id = fixture.get("id")
    h_rank = mh.get("rank", 6)
    a_rank = ma.get("rank", 6)
    diff = (a_rank - h_rank)
    home_p = max(28, min(62, 45 + diff * 2))
    away_p = max(20, min(55, 35 - diff * 2))
    draw_p = max(15, 100 - home_p - away_p)
    total = home_p + draw_p + away_p
    pred = {
        "home": round(home_p / total * 100),
        "draw": round(draw_p / total * 100),
        "away": round(away_p / total * 100),
    }
    return {
        "id": str(fixture_id),
        "home": {**home, "form": home["form"]},
        "away": {**away, "form": away["form"]},
        "homeScore": goals.get("home"),
        "awayScore": goals.get("away"),
        "status": status,
        "minute": elapsed if status == "live" else None,
        "leagueId": league_slug,
        "leagueName": LEAGUE_MAP.get(league_slug, {}).get("name", league.get("name", "")),
        "kickoff": fixture.get("date"),
        "venue": venue,
        "predictedStrength": pred,
    }


class FixturesLoader:
    def __init__(self, cache: TTLCache):
        self.cache = cache

    async def trending(self) -> list[dict]:
        matches: list[dict] = []
        seen = set()
        try:
            live_cached = await self.cache.get("fixtures:live")
            if live_cached is None:
                live_cached = await af.live_fixtures()
                await self.cache.set("fixtures:live", live_cached, TTL_LIVE)
            for fx in (live_cached.get("response") or []):
                lid = (fx.get("league") or {}).get("id")
                if lid in LEAGUE_SLUG:
                    parsed = parse_fixture(fx)
                    if parsed and parsed["id"] not in seen:
                        matches.append(parsed)
                        seen.add(parsed["id"])
        except QuotaExceeded:
            logger.warning("Quota exceeded fetching live fixtures")
        except Exception as exc:
            logger.warning("live fixtures failed: %s", exc)

        for slug, lid in LEAGUE_IDS.items():
            try:
                cached_up = await self.cache.get(f"fixtures:upcoming:{lid}")
                if cached_up is None:
                    cached_up = await af.league_upcoming(lid, next_n=3)
                    await self.cache.set(f"fixtures:upcoming:{lid}", cached_up, TTL_UPCOMING)
                upcoming = cached_up.get("response") or []
                upcoming.sort(key=lambda f: f.get("fixture", {}).get("date") or "")
                for fx in upcoming[:3]:
                    parsed = parse_fixture(fx)
                    if parsed and parsed["id"] not in seen:
                        matches.append(parsed)
                        seen.add(parsed["id"])
            except QuotaExceeded:
                logger.warning("Quota exceeded fetching upcoming for %s", lid)
                break
            except Exception as exc:
                logger.warning("upcoming %s failed: %s", lid, exc)

        if not matches:
            return mock_trending()
        if not any(m["status"] == "upcoming" for m in matches):
            for mm in mock_trending():
                if mm["status"] == "upcoming" and len(matches) < 12:
                    matches.append(mm)
        order = {"live": 0, "upcoming": 1, "finished": 2}
        matches.sort(key=lambda x: (order.get(x["status"], 3), x.get("kickoff") or ""))
        return matches[:15]

    async def team_recent(self, api_team_id: int) -> list[dict]:
        cached_fx = await self.cache.get(f"team_fixtures:{api_team_id}")
        if cached_fx is None:
            try:
                cached_fx = await af.team_last_fixtures(api_team_id, last=6)
                await self.cache.set(f"team_fixtures:{api_team_id}", cached_fx, TTL_FIXTURES_TEAM)
            except QuotaExceeded:
                logger.warning("Quota exceeded for team_fixtures %s", api_team_id)
                cached_fx = {"response": []}
            except Exception as exc:
                logger.warning("team_fixtures %s failed: %s", api_team_id, exc)
                cached_fx = {"response": []}
        all_fx = cached_fx.get("response", []) or []
        played = [
            fx for fx in all_fx
            if (fx.get("fixture", {}).get("status", {}).get("short")) in ("FT", "AET", "PEN")
        ]
        played.sort(key=lambda f: f.get("fixture", {}).get("date", ""), reverse=True)
        return played[:6]
