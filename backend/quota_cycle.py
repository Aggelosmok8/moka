"""Per-provider request budgets, anchored to the FIRST call we ever made.

RapidAPI resets a plan on the SUBSCRIPTION anniversary, not on the 1st of the
month. Counting per calendar month therefore drifts: a plan that renews on the
14th gives the app a fresh budget while our counter is still full, or worse, the
counter resets on the 1st while the provider's window still has two weeks to run
— which is how Elabet reached 100% of its 200-call plan.

So each provider stores the date of its very first call (`anchor`) and every
budget runs from the monthly anniversary of that date.
"""
from __future__ import annotations

import calendar
import logging
from datetime import date, datetime, timezone

logger = logging.getLogger(__name__)


def today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def cycle_start(anchor_iso: str, today_: date | None = None) -> str:
    """Start date of the budget window the given day falls into."""
    today_ = today_ or datetime.now(timezone.utc).date()
    try:
        anchor = date.fromisoformat((anchor_iso or "")[:10])
    except ValueError:
        anchor = today_
    if anchor > today_:
        anchor = today_
    y, m = today_.year, today_.month
    start = date(y, m, min(anchor.day, calendar.monthrange(y, m)[1]))
    if start > today_:
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
        start = date(y, m, min(anchor.day, calendar.monthrange(y, m)[1]))
    return start.isoformat()


async def usage(coll, slug: str) -> dict:
    """Read-only view of a provider's budget. Never writes, never counts."""
    try:
        row = await coll.find_one({"slug": slug}) or {}
    except Exception:
        row = {}
    anchor = (row.get("anchor") or "")[:10]
    cyc = cycle_start(anchor) if anchor else ""
    day = today_iso()
    return {
        "anchor": anchor,
        "cycle": cyc,
        "calls": int(row.get("calls") or 0) if row.get("cycle") == cyc and cyc else 0,
        "day": day,
        "day_calls": int(row.get("day_calls") or 0) if row.get("day") == day else 0,
    }


async def reserve(coll, slug: str, max_cycle: int, max_daily: int) -> dict:
    """Count one request BEFORE it leaves, atomically.

    A request that times out still costs a call at the provider, so it has to be
    counted up front; and the increment goes through the DB (`$inc` -> SQL
    `COALESCE(calls,0)+1`) so two concurrent refreshes can never read the same
    total and write it back.

    Returns {'allowed', 'calls', 'day_calls', 'cycle', 'anchor', 'reason'}.
    """
    day = today_iso()
    try:
        row = await coll.find_one({"slug": slug}) or {}
    except Exception as e:
        logger.warning("quota[%s]: read %s", slug, type(e).__name__)
        row = {}

    anchor = (row.get("anchor") or "")[:10] or day      # first call ever = anchor
    cyc = cycle_start(anchor)
    calls = int(row.get("calls") or 0) if row.get("cycle") == cyc else 0
    day_calls = int(row.get("day_calls") or 0) if row.get("day") == day else 0

    if calls >= max_cycle:
        return {"allowed": False, "calls": calls, "day_calls": day_calls, "cycle": cyc,
                "anchor": anchor, "reason": f"cycle ceiling {max_cycle} reached (since {cyc})"}
    if day_calls >= max_daily:
        return {"allowed": False, "calls": calls, "day_calls": day_calls, "cycle": cyc,
                "anchor": anchor, "reason": f"daily ceiling {max_daily} reached"}

    set_data = {"anchor": anchor}
    inc_data = {}
    if row.get("cycle") != cyc:
        set_data.update({"cycle": cyc, "calls": 1})
        calls = 1
    else:
        inc_data["calls"] = 1
        calls += 1
    if row.get("day") != day:
        set_data.update({"day": day, "day_calls": 1})
        day_calls = 1
    else:
        inc_data["day_calls"] = 1
        day_calls += 1

    upd = {"$set": set_data}
    if inc_data:
        upd["$inc"] = inc_data
    try:
        await coll.update_one({"slug": slug}, upd, upsert=True)
    except Exception as e:
        logger.warning("quota[%s]: write %s", slug, type(e).__name__)
    return {"allowed": True, "calls": calls, "day_calls": day_calls, "cycle": cyc,
            "anchor": anchor, "reason": ""}
