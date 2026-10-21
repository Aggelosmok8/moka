"""GET /api/value-matches — ranked undervalued matches (single source of truth)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter

from ..services.value_engine import rank_value_matches

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["value"])

DC_KEYS = ("home_or_draw", "away_or_draw", "home_or_away")


async def _attach_dc_prices(ranked: list) -> None:
    """Real double-chance prices for the match panel's 4th box.

    Reads snapshots that are ALREADY cached (Greek feeds + the Superbet stream),
    so it costs no provider request. Builds ONE double-chance-only index up front:
    looking each fixture up against the full pick index meant a fuzzy scan over
    thousands of keys per match, which took ~100s for a 170-match board and made
    the page time out in production.
    """
    if not ranked:
        return
    try:
        import rapid_books as rb
        import superbet_odds as sb

        idx: dict = {}
        sources = []
        for slug in rb.active_slugs() if rb.enabled() else []:
            try:
                sources.append((await rb._provider_index(slug) or {}).get("picks") or {})
            except Exception:
                continue
        if sb.enabled():
            if not sb._mem["at"]:
                await sb._load_db()
            sources.append(sb._mem["picks"] or {})
        for picks in sources:
            for key, row in picks.items():
                keep = {k: row[k] for k in DC_KEYS if (row.get(k) or {}).get("odds")}
                if not keep:
                    continue
                cur = idx.setdefault(key, {})
                for k, v in keep.items():
                    if v["odds"] > (cur.get(k) or {}).get("odds", 0):
                        cur[k] = {"odds": v["odds"], "bookmaker": v["bookmaker"]}
        if not idx:
            return
        for e in ranked:
            m = e.get("match") or {}
            h = (m.get("home") or {}).get("name") or ""
            a = (m.get("away") or {}).get("name") or ""
            if not h or not a:
                continue
            hit = rb._lookup_picks(idx, h, a)
            if hit:
                m["dcOdds"] = hit
    except Exception as ex:
        logger.warning("value-matches dc prices: %s", ex)


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
    await _attach_dc_prices(ranked)
    out = {"count": len(ranked), "matches": ranked, "source": "live"}
    if not ranked:
        # Say WHY the page is empty instead of looking broken.
        import apifootball as af
        if af.usage().get("exhausted"):
            out["notice"] = ("The odds provider's daily request limit has been reached. "
                             "Matches will be back as soon as it resets.")
            out["source"] = "quota"
    return out
