"""Match assembler — composes a full match detail using standings + fixtures + h2h."""
import logging
from typing import Optional

import api_football as af
from cache import TTLCache
from mock_data import (
    TEAM_MAP as MOCK_TEAM_MAP, LEAGUE_MAP,
    get_team_detail as mock_team_detail,
    get_match_detail as mock_match_detail,
)
from standings_loader import API_TO_INTERNAL
from fixtures_loader import FixturesLoader
from api_football import LEAGUE_IDS

logger = logging.getLogger(__name__)

TTL_TEAM_STATS = 24 * 3600


def stub_team(t: dict) -> dict:
    return {
        "id": t.get("id", "unknown"),
        "name": t.get("name", "Unknown"),
        "short": t.get("short", "UNK"),
        "color": t.get("color", "#333"),
        "logoUrl": t.get("logoUrl", ""),
        "leagueId": t.get("leagueId", ""),
        "leagueName": t.get("leagueName", ""),
        "rank": t.get("rank", 0),
        "matchesPlayed": 0,
        "wins": 0, "draws": 0, "losses": 0, "points": 0,
        "goalsScored": 0, "goalsConceded": 0, "goalDiff": 0,
        "goalsPerGame": 0.0, "concededPerGame": 0.0,
        "shotsPerGame": 12.0, "shotsOnTargetPerGame": 4.5,
        "possession": 50, "passAccuracy": 80,
        "cornersPerGame": 5.0, "foulsPerGame": 11.0, "yellowsPerGame": 2.0,
        "cleanSheetsPct": 30, "btts": 55, "over25": 55, "under25": 45,
        "form": t.get("form", ["D", "D", "D", "D", "D"]),
        "radar": {"attack": 65, "defense": 65, "possession": 65, "pace": 65, "discipline": 65, "finishing": 65},
        "trendGoals": [1, 1, 2, 0, 1, 2, 0, 1, 1, 2],
        "trendConceded": [1, 0, 1, 1, 2, 0, 1, 1, 0, 1],
        "recentMatches": [],
    }


class MatchAssembler:
    def __init__(self, cache: TTLCache, fixtures_loader: FixturesLoader, all_standings_fn):
        self.cache = cache
        self.fixtures = fixtures_loader
        self.all_standings = all_standings_fn

    async def team_detail(self, team_id: str) -> Optional[dict]:
        all_t = await self.all_standings()
        team = next((t for t in all_t if t["id"] == team_id), None)
        if not team:
            return mock_team_detail(team_id)
        api_team_id = team.get("apiId")
        league_api_id = LEAGUE_IDS.get(team["leagueId"])

        recent_matches = []
        try:
            played = await self.fixtures.team_recent(api_team_id)
            for fx in played:
                fixture = fx.get("fixture", {})
                teams = fx.get("teams", {})
                goals = fx.get("goals", {})
                league = fx.get("league", {})
                home_api = teams.get("home", {}).get("id")
                away_api = teams.get("away", {}).get("id")
                home_internal = API_TO_INTERNAL.get(home_api, {})
                away_internal = API_TO_INTERNAL.get(away_api, {})
                recent_matches.append({
                    "id": str(fixture.get("id")),
                    "home": home_internal.get("id", f"api-{home_api}"),
                    "away": away_internal.get("id", f"api-{away_api}"),
                    "homeName": home_internal.get("short") or (teams.get("home", {}).get("name", "")[:3]).upper(),
                    "awayName": away_internal.get("short") or (teams.get("away", {}).get("name", "")[:3]).upper(),
                    "homeScore": goals.get("home") if goals.get("home") is not None else 0,
                    "awayScore": goals.get("away") if goals.get("away") is not None else 0,
                    "date": (fixture.get("date") or "")[:10],
                    "competition": league.get("name", "")[:6].upper(),
                })
            if recent_matches:
                btts_count = sum(1 for m in recent_matches if m["homeScore"] > 0 and m["awayScore"] > 0)
                over_count = sum(1 for m in recent_matches if (m["homeScore"] + m["awayScore"]) > 2)
                cs_count = sum(
                    1 for m in recent_matches
                    if (m["home"] == team_id and m["awayScore"] == 0)
                    or (m["away"] == team_id and m["homeScore"] == 0)
                )
                n = len(recent_matches)
                team = {**team, "btts": round(btts_count * 100 / n)}
                team["over25"] = round(over_count * 100 / n)
                team["under25"] = 100 - team["over25"]
                team["cleanSheetsPct"] = round(cs_count * 100 / n)
        except Exception as exc:
            logger.warning("team_fixtures assembly failed for %s: %s", team_id, exc)

        if not recent_matches:
            mock_detail = mock_team_detail(team_id) or {}
            recent_matches = mock_detail.get("recentMatches", [])

        try:
            stats_payload = await self.cache.get(f"team_stats:{api_team_id}:{league_api_id}")
            if stats_payload is None and api_team_id and league_api_id:
                stats_payload = await af.team_statistics(api_team_id, league_api_id)
                await self.cache.set(f"team_stats:{api_team_id}:{league_api_id}", stats_payload, TTL_TEAM_STATS)
            if stats_payload:
                stats = stats_payload.get("response") or {}
                cs = (stats.get("clean_sheet") or {}).get("total")
                if isinstance(cs, int) and team["matchesPlayed"]:
                    team["cleanSheetsPct"] = round(cs * 100 / team["matchesPlayed"])
        except Exception as exc:
            logger.debug("team_statistics enrichment skipped: %s", exc)

        return {**team, "recentMatches": recent_matches}

    async def match_detail(self, match_id: str) -> Optional[dict]:
        if match_id.startswith("m-"):
            return mock_match_detail(match_id)
        trending = await self.fixtures.trending()
        match = next((m for m in trending if m["id"] == match_id), None)
        if not match:
            return None
        home_full = await self.team_detail(match["home"]["id"]) or stub_team(match["home"])
        away_full = await self.team_detail(match["away"]["id"]) or stub_team(match["away"])
        h2h = []
        seen_keys = set()
        for src in [home_full.get("recentMatches", []), away_full.get("recentMatches", [])]:
            for m in src:
                if {m["home"], m["away"]} == {match["home"]["id"], match["away"]["id"]}:
                    key = m["id"]
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                    h2h.append({
                        "date": m["date"],
                        "homeScore": m["homeScore"],
                        "awayScore": m["awayScore"],
                        "homeShort": m["homeName"],
                        "awayShort": m["awayName"],
                    })
                    if len(h2h) >= 5:
                        break
        if not h2h:
            mock = mock_match_detail("m-0") or {}
            h2h = mock.get("h2h", [])[:3]
        return {**match, "homeTeam": home_full, "awayTeam": away_full, "h2h": h2h}
