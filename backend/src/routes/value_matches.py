"""GET /api/value-matches — ranked undervalued matches (single source of truth)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter

from ..services.value_engine import rank_value_matches

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["value"])


@router.get("/value-matches")
async def value_matches(level: Optional[str] = None, limit: Optional[int] = None):
    # Real data only. build_live_matches() serves the last known-good cache (even
    # if stale) on provider errors; only a hard failure with NO cache reaches here.
    try:
        import live_values
        base = await live_values.build_live_matches() or []
    except Exception as e:
        logger.error("[%s] value-matches: live build failed, no cache: %s",
                     datetime.now(timezone.utc).isoformat(), e)
        return {"status": "unavailable", "message": "Data temporarily unavailable"}
    ranked = rank_value_matches(base)
    if level:
        ranked = [e for e in ranked if e["value"]["value_level"] == level.upper()]
    if limit:
        ranked = ranked[: max(0, limit)]
    return {"count": len(ranked), "matches": ranked, "source": "live"}
