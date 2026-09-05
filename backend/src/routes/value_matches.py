"""GET /api/value-matches — ranked undervalued matches (single source of truth)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from ..data.mock_matches import MOCK_MATCHES
from ..services.value_engine import rank_value_matches

router = APIRouter(prefix="/api", tags=["value"])


@router.get("/value-matches")
async def value_matches(level: Optional[str] = None, limit: Optional[int] = None):
    # Real data only. If the live source is temporarily unavailable we return an
    # empty list (the UI shows "no matches") instead of placeholder mock teams
    # like "La Liga Club 9", which are misleading.
    base = []
    source = "live"
    try:
        import live_values
        base = await live_values.build_live_matches() or []
    except Exception:
        base = []
    ranked = rank_value_matches(base)
    if level:
        ranked = [e for e in ranked if e["value"]["value_level"] == level.upper()]
    if limit:
        ranked = ranked[: max(0, limit)]
    return {"count": len(ranked), "matches": ranked, "source": source}
