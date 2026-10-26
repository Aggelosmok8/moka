"""Single source of truth for what a FREE account may see.

Everything gated for free users is decided here so the rules can't drift between
endpoints and the pricing page.
"""
from __future__ import annotations

import re

# Premier League and the UEFA club competitions are Pro-only: free accounts see
# that the fixture exists (teams + kick-off) but nothing else.
_PRO_ONLY = re.compile(
    r"(premier\s*league\s*\(england\)|^premier league$|champions\s*league|europa\s*league"
    r"|conference\s*league|uefa\s*super\s*cup|club\s*world\s*cup)",
    re.IGNORECASE,
)

# The one Specific Bets category a free account can open.
FREE_SPECIFIC_PANEL = "btts"
# How many of the newest tickets a free account keeps in history/stats/diagram.
FREE_TICKET_HISTORY = 10


def is_pro(user) -> bool:
    return bool(user and getattr(user, "is_pro", False))


def league_locked(league_name: str, pro: bool) -> bool:
    if pro:
        return False
    return bool(_PRO_ONLY.search(league_name or ""))


def lock_entry(entry: dict) -> dict:
    """Strip a value-matches entry down to the teaser: league, teams, kick-off.

    No odds, no pick, no probabilities — a free account must not get the answer
    for a Pro-only competition.
    """
    m = entry.get("match") or {}
    return {
        "locked": True,
        "match": {
            "id": m.get("id"),
            "leagueName": m.get("leagueName"),
            "home": {"name": (m.get("home") or {}).get("name")},
            "away": {"name": (m.get("away") or {}).get("name")},
            "kickoff": m.get("kickoff"),
            "date": m.get("date"),
            "time": m.get("time"),
            "status": m.get("status"),
        },
    }


def limit_specific_bets(data: dict) -> dict:
    """Free accounts get Both Teams To Score only."""
    panels = [p for p in (data.get("panels") or []) if p.get("key") == FREE_SPECIFIC_PANEL]
    return {**data, "panels": panels, "categories": [], "players": [],
            "limited": True, "freePanel": FREE_SPECIFIC_PANEL}
