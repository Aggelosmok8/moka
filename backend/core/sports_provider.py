"""API service abstraction layer.

`SportsDataProvider` is the interface every data source must implement.
`PlaceholderSportsProvider` returns deterministic, dependency-free data so the
whole FREE/PRO stack can run end-to-end before any external API is wired.
Later, an `ApiFootballProvider` / `SportsDataIoProvider` plugs in behind the
same interface (swap `get_sports_provider`).
"""
from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from typing import List, Optional

from .entitlements import LEAGUE_CATALOG, LEAGUE_MAP, League, Sport


def _seed(*parts) -> int:
    h = hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()
    return int(h[:8], 16)


class SportsDataProvider(ABC):
    """Abstraction over any sports-data source. All methods return plain dicts."""

    name: str = "abstract"

    @abstractmethod
    def list_leagues(self) -> List[dict]: ...

    @abstractmethod
    def list_matches(self, league_id: Optional[str] = None) -> List[dict]: ...

    @abstractmethod
    def get_match(self, match_id: str) -> Optional[dict]: ...

    @abstractmethod
    def list_teams(self, league_id: Optional[str] = None) -> List[dict]: ...


class PlaceholderSportsProvider(SportsDataProvider):
    """Deterministic in-memory data. No network, no external deps."""

    name = "placeholder"

    def list_leagues(self):
        return [
            {"id": lg.id, "name": lg.name, "sport": lg.sport.value, "pro_only": lg.pro_only}
            for lg in LEAGUE_CATALOG
        ]

    def _stats(self, sport: Sport, s: int) -> dict:
        if sport is Sport.BASKETBALL:
            return {
                "form": ["W", "L", "W", "W", "L"],
                "goalsPerGame": round(95 + s % 25, 1),          # points per game
                "concededPerGame": round(92 + (s >> 3) % 25, 1),
                "possession": 50,
                "passAccuracy": 70 + s % 20,
                "shotsPerGame": round(80 + s % 20, 1),
                "xg": round(100 + s % 15, 1),
            }
        return {
            "form": ["W", "D", "W", "L", "D"],
            "goalsPerGame": round(1.0 + (s % 20) / 10, 2),
            "concededPerGame": round(0.8 + ((s >> 4) % 18) / 10, 2),
            "possession": 40 + s % 25,
            "passAccuracy": 75 + s % 18,
            "shotsPerGame": round(8 + s % 8, 1),
            "shotsOnTargetPerGame": round(3 + s % 5, 1),
            "btts": 40 + s % 35,
            "over25": 40 + (s >> 2) % 40,
            "cornersPerGame": round(4 + s % 6, 1),
            "yellowsPerGame": round(1 + s % 3, 1),
            "xg": round(1.0 + (s % 18) / 10, 2),
            "xga": round(0.9 + ((s >> 5) % 16) / 10, 2),
        }

    def _teams_for(self, league: League) -> List[dict]:
        teams = []
        for i in range(4):
            s = _seed(league.id, i)
            teams.append({
                "id": f"{league.id}_t{i}",
                "name": f"{league.name} Club {i + 1}",
                "leagueId": league.id,
                "leagueName": league.name,
                "sport": league.sport.value,
                "stats": self._stats(league.sport, s),
            })
        return teams

    def list_teams(self, league_id=None):
        leagues = [LEAGUE_MAP[league_id]] if league_id in LEAGUE_MAP else LEAGUE_CATALOG
        out: List[dict] = []
        for lg in leagues:
            out.extend(self._teams_for(lg))
        return out

    def list_matches(self, league_id=None):
        leagues = [LEAGUE_MAP[league_id]] if league_id in LEAGUE_MAP else LEAGUE_CATALOG
        out: List[dict] = []
        for lg in leagues:
            teams = self._teams_for(lg)
            for i in range(0, len(teams) - 1, 2):
                h, a = teams[i], teams[i + 1]
                s = _seed("match", lg.id, i)
                out.append({
                    "id": f"{lg.id}_m{i // 2}",
                    "leagueId": lg.id,
                    "leagueName": lg.name,
                    "sport": lg.sport.value,
                    "status": ["live", "upcoming", "finished"][s % 3],
                    "home": {"id": h["id"], "name": h["name"]},
                    "away": {"id": a["id"], "name": a["name"]},
                    "homeTeam": h["stats"],
                    "awayTeam": a["stats"],
                })
        return out

    def get_match(self, match_id):
        for m in self.list_matches():
            if m["id"] == match_id:
                return m
        return None


_default_provider = PlaceholderSportsProvider()


def get_sports_provider() -> SportsDataProvider:
    """Return the active sports-data provider (single swap point)."""
    return _default_provider
