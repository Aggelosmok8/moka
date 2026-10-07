"""Stoiximan 1X2 prices via the RapidAPI "Stoiximan Odds" snapshot files.

The free plan allows 200 requests per MONTH, so this module is built around that
hard limit: one shared fetch of the top-leagues file, a 12h TTL, the payload
mirrored to disk so a process restart does not spend a request, a monthly call
ceiling, and stale data served on any error. It returns an index in exactly the
odds_api_io shape, so live_values can merge it with the existing providers.

Disabled (and completely inert) unless STOIXIMAN_RAPIDAPI_KEY is set.
"""
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

HOST = os.environ.get("STOIXIMAN_RAPIDAPI_HOST", "stoiximan-odds.p.rapidapi.com")
FILE = os.environ.get("STOIXIMAN_FILE", "site_pregame_stoiximan_soccer_leagues.json")
CACHE_TTL = 12 * 3600          # 2 refreshes/day -> ~62 requests/month
MAX_MONTHLY = int(os.environ.get("STOIXIMAN_MAX_MONTHLY", "150"))
DISK = Path("/tmp/stoiximan_odds.json")

_mem: dict = {}                # {"idx": {...}, "at": epoch}
_usage = {"month": "", "count": 0}


def enabled() -> bool:
    return bool(os.environ.get("STOIXIMAN_RAPIDAPI_KEY", "").strip())


def _norm(name: str) -> str:
    s = (name or "").strip().lower()
    return re.sub(r"[^a-z0-9]", "", s)


def _price(v) -> float:
    try:
        p = float(v)
    except (TypeError, ValueError):
        return 0.0
    return p if 1.0 < p <= 51.0 else 0.0


def _quota_left() -> int:
    m = datetime.now(timezone.utc).strftime("%Y-%m")
    if _usage["month"] != m:
        _usage.update(month=m, count=0)
    return MAX_MONTHLY - _usage["count"]


def _parse(payload) -> dict:
    """Snapshot -> {"norm(home)|norm(away)": [odds entry]} for Match Result."""
    idx = {}
    updated = (payload or {}).get("updated_at")
    for blk in (payload or {}).get("data") or []:
        for b in ((blk or {}).get("data") or {}).get("blocks") or []:
            for ev in b.get("events") or []:
                for mkt in ev.get("markets") or []:
                    if mkt.get("type") != "MRES":
                        continue
                    sel = {s.get("name"): s for s in mkt.get("selections") or []}
                    home = (sel.get("1") or {}).get("fullName")
                    away = (sel.get("2") or {}).get("fullName")
                    o = {k: _price((sel.get(n) or {}).get("price"))
                         for k, n in (("home", "1"), ("draw", "X"), ("away", "2"))}
                    o = {k: v for k, v in o.items() if v}
                    if not (home and away and len(o) == 3):
                        continue
                    idx[f"{_norm(home)}|{_norm(away)}"] = [{
                        "bookmaker": "Stoiximan", "odds": o,
                        "source": "stoiximan", "updatedAt": updated,
                    }]
    return idx


def _read_disk():
    try:
        d = json.loads(DISK.read_text())
        if isinstance(d, dict) and d.get("idx"):
            return d
    except Exception:
        pass
    return None


async def odds_index() -> dict:
    """Cached Stoiximan index. {} when disabled, out of quota or unavailable."""
    if not enabled():
        return {}
    now = time.time()
    if _mem.get("idx") and now - _mem.get("at", 0) < CACHE_TTL:
        return _mem["idx"]
    disk = _read_disk()
    if disk and now - disk.get("at", 0) < CACHE_TTL:
        _mem.update(idx=disk["idx"], at=disk["at"])
        return disk["idx"]
    if _quota_left() <= 0:
        logger.warning("stoiximan: monthly ceiling reached, serving stale")
        return (disk or {}).get("idx") or _mem.get("idx") or {}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(25.0, connect=8.0)) as client:
            r = await client.get(
                f"https://{HOST}/v1/data/{FILE}",
                headers={"x-rapidapi-key": os.environ["STOIXIMAN_RAPIDAPI_KEY"],
                         "x-rapidapi-host": HOST, "accept": "application/json"},
            )
        _usage["count"] += 1
        if r.status_code != 200:
            logger.warning("stoiximan: HTTP %s (call %s/%s this month)",
                           r.status_code, _usage["count"], MAX_MONTHLY)
            return (disk or {}).get("idx") or _mem.get("idx") or {}
        idx = _parse(r.json())
    except Exception as e:
        logger.warning("stoiximan.odds_index: %s", type(e).__name__)
        return (disk or {}).get("idx") or _mem.get("idx") or {}
    if not idx:
        return (disk or {}).get("idx") or {}
    _mem.update(idx=idx, at=now)
    try:
        DISK.write_text(json.dumps({"idx": idx, "at": now}))
    except Exception:
        pass
    logger.info("stoiximan: %s matches priced (call %s/%s this month)",
                len(idx), _usage["count"], MAX_MONTHLY)
    return idx
