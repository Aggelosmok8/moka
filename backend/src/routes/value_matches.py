"""GET /api/value-matches — ranked undervalued matches (single source of truth)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from ..data.mock_matches import MOCK_MATCHES
from ..services.value_engine import rank_value_matches

router = APIRouter(prefix="/api", tags=["value"])


@router.get("/value-matches")
async def value_matches(level: Optional[str] = None, limit: Optional[int] = None):
    source = "mock"
    base = MOCK_MATCHES
    try:
        import live_values
        live = await live_values.build_live_matches()
        if live:
            base = live
            source = "live"
    except Exception:
        base = MOCK_MATCHES
    ranked = rank_value_matches(base)
    if level:
        ranked = [e for e in ranked if e["value"]["value_level"] == level.upper()]
    if limit:
        ranked = ranked[: max(0, limit)]
    return {"count": len(ranked), "matches": ranked, "source": source}
