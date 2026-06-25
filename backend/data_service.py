"""DataService — thin orchestrator over loaders. Public API identical to pre-split."""
import asyncio
import logging
from typing import Optional

from cache import TTLCache
from api_football import LEAGUE_IDS
from mock_data import (
    TEAMS as MOCK_TEAMS,
    get_top_teams as mock_top_teams,
    get_trending_matches as mock_trending,
)
from standings_loader import StandingsLoader
from fixtures_loader import FixturesLoader
from match_assembler import MatchAssembler

logger = logging.getLogger(__name__)


class DataService:
    def __init__(self, db):
        self.cache = TTLCache(db)
        self._initialized = False
        self.standings = StandingsLoader(self.cache)
        self.fixtures = FixturesLoader(self.cache)
        self.matches = MatchAssembler(self.cache, self.fixtures, self.all_standings)

    async def ensure(self):
        if not self._initialized:
            await self.cache.ensure_indexes()
            self._initialized = True

    async def all_standings(self) -> list[dict]:
        await self.ensure()
        results = await asyncio.gather(
            *[self.standings.for_league(slug) for slug in LEAGUE_IDS],
            return_exceptions=False,
        )
        merged = []
        for lst in results:
            merged.extend(lst)
        return merged

    async def top_teams(self, limit: int = 10) -> list[dict]:
        all_t = await self.all_standings()
        all_t.sort(key=lambda x: (-x.get("points", 0), -x.get("goalDiff", 0)))
        return all_t[:limit]

    async def teams(self, league: Optional[str] = None) -> list[dict]:
        all_t = await self.all_standings()
        if league:
            all_t = [t for t in all_t if t["leagueId"] == league]
        return all_t

    async def team_detail(self, team_id: str) -> Optional[dict]:
        await self.ensure()
        return await self.matches.team_detail(team_id)

    async def trending_matches(self) -> list[dict]:
        await self.ensure()
        return await self.fixtures.trending()

    async def match_detail(self, match_id: str) -> Optional[dict]:
        await self.ensure()
        return await self.matches.match_detail(match_id)

    async def cache_meta(self) -> dict:
        await self.ensure()
        meta = {}
        for slug, lid in LEAGUE_IDS.items():
            m = await self.cache.get_meta(f"standings:{lid}")
            if m:
                meta[f"standings_{slug}"] = m.get("updated_at")
        live_meta = await self.cache.get_meta("fixtures:live")
        if live_meta:
            meta["live_fixtures"] = live_meta.get("updated_at")
        return meta
