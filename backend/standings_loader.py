"""Standings loader — fetch + transform + cache league standings."""
import logging
from typing import Optional

from cache import TTLCache
import api_football as af
from api_football import LEAGUE_IDS, QuotaExceeded
from mock_data import TEAMS as MOCK_TEAMS, TEAM_MAP as MOCK_TEAM_MAP, LEAGUE_MAP

logger = logging.getLogger(__name__)

TTL_STANDINGS = 24 * 3600

API_TO_INTERNAL = {t["apiId"]: t for t in MOCK_TEAMS}


def _form_to_list(form_str: Optional[str], length: int = 5) -> list[str]:
    if not form_str:
        return ["D"] * length
    return list(form_str[-length:])


def _enrich_team_base(t: dict, api_team_id: int) -> dict:
    internal = API_TO_INTERNAL.get(api_team_id)
    if internal:
        return {
            "id": internal["id"], "name": internal["name"], "short": internal["short"],
            "color": internal["color"], "logoUrl": internal["logoUrl"], "apiId": api_team_id,
            "leagueId": internal["leagueId"], "leagueName": internal["leagueName"],
        }
    return {
        "id": f"api-{api_team_id}",
        "name": t.get("name", "Unknown"),
        "short": (t.get("name", "UNK")[:3]).upper(),
        "color": "#333",
        "logoUrl": t.get("logo", ""),
        "apiId": api_team_id,
        "leagueId": "", "leagueName": "",
    }


def parse_standings(standings_payload: dict, league_slug: str) -> list[dict]:
    rows = []
    response = standings_payload.get("response") or []
    if not response:
        return rows
    league = response[0].get("league", {})
    standings_groups = league.get("standings") or []
    flat_rows = []
    for grp in standings_groups:
        flat_rows.extend(grp)
    for row in flat_rows:
        team = row.get("team", {})
        api_id = team.get("id")
        if api_id is None:
            continue
        base = _enrich_team_base(team, api_id)
        all_stats = row.get("all", {}) or {}
        goals = all_stats.get("goals", {}) or {}
        played = all_stats.get("played", 0) or 0
        gs = goals.get("for", 0) or 0
        gc = goals.get("against", 0) or 0
        mock = MOCK_TEAM_MAP.get(base["id"], {})
        rows.append({
            **base,
            "leagueId": league_slug,
            "leagueName": LEAGUE_MAP.get(league_slug, {}).get("name", base.get("leagueName", "")),
            "rank": row.get("rank", 0),
            "matchesPlayed": played,
            "wins": all_stats.get("win", 0) or 0,
            "draws": all_stats.get("draw", 0) or 0,
            "losses": all_stats.get("lose", 0) or 0,
            "points": row.get("points", 0) or 0,
            "goalsScored": gs,
            "goalsConceded": gc,
            "goalDiff": row.get("goalsDiff", gs - gc),
            "goalsPerGame": round(gs / played, 2) if played else 0.0,
            "concededPerGame": round(gc / played, 2) if played else 0.0,
            "form": _form_to_list(row.get("form")),
            "shotsPerGame": mock.get("shotsPerGame", 12.0),
            "shotsOnTargetPerGame": mock.get("shotsOnTargetPerGame", 4.5),
            "possession": mock.get("possession", 50),
            "passAccuracy": mock.get("passAccuracy", 82),
            "cornersPerGame": mock.get("cornersPerGame", 5.0),
            "foulsPerGame": mock.get("foulsPerGame", 11.0),
            "yellowsPerGame": mock.get("yellowsPerGame", 2.0),
            "cleanSheetsPct": mock.get("cleanSheetsPct", 35),
            "btts": mock.get("btts", 55),
            "over25": mock.get("over25", 55),
            "under25": mock.get("under25", 45),
            "radar": mock.get("radar", {"attack": 70, "defense": 70, "possession": 70, "pace": 70, "discipline": 70, "finishing": 70}),
            "trendGoals": mock.get("trendGoals", [1, 2, 0, 1, 3, 1, 2, 0, 2, 1]),
            "trendConceded": mock.get("trendConceded", [0, 1, 1, 0, 2, 1, 0, 2, 1, 1]),
        })
    return rows


class StandingsLoader:
    def __init__(self, cache: TTLCache):
        self.cache = cache

    async def for_league(self, league_slug: str) -> list[dict]:
        league_id = LEAGUE_IDS[league_slug]
        cached = await self.cache.get(f"standings:{league_id}")
        if cached is not None:
            return parse_standings(cached, league_slug)
        try:
            payload = await af.standings(league_id)
            await self.cache.set(f"standings:{league_id}", payload, TTL_STANDINGS)
            return parse_standings(payload, league_slug)
        except QuotaExceeded:
            logger.warning("Quota exceeded for standings %s", league_id)
        except Exception as exc:
            logger.warning("standings %s failed: %s", league_id, exc)
        stale = await self.cache.get_stale(f"standings:{league_id}")
        if stale:
            return parse_standings(stale, league_slug)
        return [t for t in MOCK_TEAMS if t["leagueId"] == league_slug]
