"""Feature gating system + plan matrix + league/sport catalog.

Pure and side-effect free -> trivial to unit test and reason about.
This is the single source of truth for what FREE vs PRO can do.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List

from .roles import Role


class Sport(str, Enum):
    FOOTBALL = "football"
    BASKETBALL = "basketball"


class Feature(str, Enum):
    AI_SUMMARY = "ai_summary"          # FREE+: placeholder AI match summary
    PREDICTIONS = "predictions"        # PRO  : placeholder prediction model
    EXTENDED_STATS = "extended_stats"  # PRO  : richer statistics
    ALL_LEAGUES = "all_leagues"        # PRO  : access every league
    FAST_UPDATES = "fast_updates"      # PRO  : faster refresh cadence


@dataclass(frozen=True)
class League:
    id: str
    name: str
    sport: Sport
    pro_only: bool = False


# Catalog.
#   FREE = major football leagues + NBA + EuroLeague.
#   PRO  = everything (secondary leagues flagged pro_only).
LEAGUE_CATALOG: List[League] = [
    League("epl", "Premier League (England)", Sport.FOOTBALL),
    League("laliga", "La Liga (Spain)", Sport.FOOTBALL),
    League("seriea", "Serie A (Italy)", Sport.FOOTBALL),
    League("bundesliga", "Bundesliga (Germany)", Sport.FOOTBALL),
    League("ligue1", "Ligue 1 (France)", Sport.FOOTBALL),
    League("eredivisie", "Eredivisie (Netherlands)", Sport.FOOTBALL),
    League("primeira", "Primeira Liga (Portugal)", Sport.FOOTBALL),
    League("championship", "Championship (England)", Sport.FOOTBALL),
    League("superleague", "Super League 1 (Greece)", Sport.FOOTBALL),
    League("denmark", "Superliga (Denmark)", Sport.FOOTBALL),
    League("scotland", "Premiership (Scotland)", Sport.FOOTBALL),
    League("nba", "NBA (USA)", Sport.BASKETBALL),
    League("euroleague", "EuroLeague", Sport.BASKETBALL),
]

LEAGUE_MAP: Dict[str, League] = {lg.id: lg for lg in LEAGUE_CATALOG}


# Statistic field sets -> limited for FREE, extended for PRO.
FREE_STAT_FIELDS = ("form", "goalsPerGame", "concededPerGame", "possession")
PRO_STAT_FIELDS = FREE_STAT_FIELDS + (
    "passAccuracy", "shotsPerGame", "shotsOnTargetPerGame", "btts",
    "over25", "cornersPerGame", "yellowsPerGame", "xg", "xga",
)

# Refresh cadence (seconds): FREE every 5 min, PRO faster (30s).
FREE_REFRESH_SECONDS = 300
PRO_REFRESH_SECONDS = 30


@dataclass(frozen=True)
class PlanConfig:
    role: Role
    features: frozenset
    stat_fields: tuple
    refresh_seconds: int
    all_leagues: bool


PLAN_MATRIX: Dict[Role, PlanConfig] = {
    Role.FREE: PlanConfig(
        role=Role.FREE,
        features=frozenset({Feature.AI_SUMMARY}),
        stat_fields=FREE_STAT_FIELDS,
        refresh_seconds=FREE_REFRESH_SECONDS,
        all_leagues=False,
    ),
    Role.PRO: PlanConfig(
        role=Role.PRO,
        features=frozenset({
            Feature.AI_SUMMARY, Feature.PREDICTIONS,
            Feature.EXTENDED_STATS, Feature.ALL_LEAGUES, Feature.FAST_UPDATES,
        }),
        stat_fields=PRO_STAT_FIELDS,
        refresh_seconds=PRO_REFRESH_SECONDS,
        all_leagues=True,
    ),
}


class FeatureNotAvailable(Exception):
    """Raised by guard helpers when a role lacks a feature."""

    def __init__(self, feature: Feature):
        self.feature = feature
        super().__init__(f"Feature '{feature.value}' requires Pro.")


class FeatureGate:
    """Central authority for every FREE/PRO access decision."""

    @staticmethod
    def plan(role: Role) -> PlanConfig:
        return PLAN_MATRIX[role]

    @classmethod
    def can(cls, role: Role, feature: Feature) -> bool:
        return feature in cls.plan(role).features

    @classmethod
    def require(cls, role: Role, feature: Feature) -> None:
        if not cls.can(role, feature):
            raise FeatureNotAvailable(feature)

    @classmethod
    def can_access_league(cls, role: Role, league_id: str) -> bool:
        league = LEAGUE_MAP.get(league_id)
        if league is None:
            return False
        if league.pro_only:
            return cls.plan(role).all_leagues
        return True

    @classmethod
    def visible_leagues(cls, role: Role) -> List[League]:
        if cls.plan(role).all_leagues:
            return list(LEAGUE_CATALOG)
        return [lg for lg in LEAGUE_CATALOG if not lg.pro_only]

    @classmethod
    def stat_fields(cls, role: Role) -> tuple:
        return cls.plan(role).stat_fields

    @classmethod
    def filter_stats(cls, role: Role, stats: dict) -> dict:
        """Trim a stats dict down to the fields this role is entitled to."""
        allowed = set(cls.stat_fields(role))
        return {k: v for k, v in (stats or {}).items() if k in allowed}

    @classmethod
    def refresh_seconds(cls, role: Role) -> int:
        return cls.plan(role).refresh_seconds

    @classmethod
    def entitlements(cls, role: Role) -> dict:
        p = cls.plan(role)
        return {
            "role": role.value,
            "features": sorted(f.value for f in p.features),
            "stat_fields": list(p.stat_fields),
            "refresh_seconds": p.refresh_seconds,
            "all_leagues": p.all_leagues,
            "leagues": [
                {"id": lg.id, "name": lg.name, "sport": lg.sport.value, "pro_only": lg.pro_only}
                for lg in cls.visible_leagues(role)
            ],
        }
