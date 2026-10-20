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
    # Real double-chance prices for the match panel's 4th box. Both lookups read
    # snapshots that are ALREADY cached (Greek feeds + the Superbet stream), so
    # this costs no provider request; without them the box could only show the
    # mathematically implied price with no bookmaker to click.
    try:
        import rapid_books as rb
        import superbet_odds as sb
        DC = ("home_or_draw", "away_or_draw", "home_or_away")
        for e in ranked:
            m = e.get("match") or {}
            h = (m.get("home") or {}).get("name") or ""
            a = (m.get("away") or {}).get("name") or ""
            if not h or not a:
                continue
            po = await rb.pick_prices(h, a)
            rb.merge_prices(po, await sb.pick_prices(h, a))
            dc = {k: {"odds": po[k]["odds"], "bookmaker": po[k]["bookmaker"]}
                  for k in DC if (po.get(k) or {}).get("odds")}
            if dc:
                m["dcOdds"] = dc
    except Exception as ex:
        logger.warning("value-matches dc prices: %s", ex)
    if level:
        ranked = [e for e in ranked if e["value"]["value_level"] == level.upper()]
    if limit:
        ranked = ranked[: max(0, limit)]
    out = {"count": len(ranked), "matches": ranked, "source": "live"}
    if not ranked:
        # Say WHY the page is empty instead of looking broken.
        import apifootball as af
        if af.usage().get("exhausted"):
            out["notice"] = ("The odds provider's daily request limit has been reached. "
                             "Matches will be back as soon as it resets.")
            out["source"] = "quota"
    return out
