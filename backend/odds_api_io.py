"""Greek-market odds provider (odds-api.io, https://docs.odds-api.io).

API-Football / The Odds API do not return Greece-licensed bookmakers
(Stoiximan, Novibet, Pamestoixima). odds-api.io aggregates them. This client
fetches their Match-result (ML) prices and exposes them in the SAME entry schema
the value engine already uses: [{"bookmaker": str, "odds": {home,draw,away}}].

FAIL-OPEN + ZERO-RISK: everything is gated behind ODDS_API_IO_KEY. When the key
is absent (or on any quota/error), this module returns nothing and the app
behaves exactly as before — no odds are ever fabricated.

Free tier: 100 req/hour, 500/day, 2 recreational bookmakers — so aggressive 12h
caching and a single shared /events call cover every league at once.
"""
import os
import re
import time
import asyncio
import logging
import unicodedata

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.odds-api.io/v3"

# Greece-safe books we are willing to surface (env-overridable). The free tier
# only enables 2 recreational books, so whichever the account allows is used.
GREEK_BOOKMAKERS = tuple(
    x.strip() for x in os.environ.get(
        "ODDS_API_IO_BOOKMAKERS", "Stoiximan,Novibet,Pamestoixima,Betsson"
    ).split(",") if x.strip()
)

CACHE_TTL = 12 * 3600      # free-tier friendly
MAX_EVENTS = 100           # cap /odds fan-out (=> <=10 odds/multi calls per 12h)
_TIMEOUT = 12.0

_cache: dict = {}
_lock = asyncio.Lock()


def enabled() -> bool:
    return bool(os.environ.get("ODDS_API_IO_KEY", "").strip())


def _norm(name: str) -> str:
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


def _cache_get(k):
    e = _cache.get(k)
    if e and time.monotonic() < e[1]:
        return e[0]
    return None


def _cache_set(k, v, ttl):
    _cache[k] = (v, time.monotonic() + ttl)


def _ml_odds(markets: list) -> dict | None:
    """Pull the Match-result (ML) home/draw/away prices from a bookmaker's
    market list. Prices outside a sane range are dropped (guards data errors)."""
    for m in markets or []:
        if str(m.get("name", "")).strip().lower() != "ml":
            continue
        rows = m.get("odds") or []
        if not rows:
            return None
        row = rows[0]
        o = {"home": 0.0, "draw": 0.0, "away": 0.0}
        for k in ("home", "draw", "away"):
            try:
                p = float(row.get(k) or 0)
            except (TypeError, ValueError):
                p = 0.0
            if 1.0 < p <= 51.0:
                o[k] = p
        if o["home"] or o["draw"] or o["away"]:
            return o
        return None
    return None


async def _get(client: httpx.AsyncClient, path: str, params: dict):
    params = {**params, "apiKey": os.environ.get("ODDS_API_IO_KEY", "").strip()}
    r = await client.get(f"{BASE_URL}{path}", params=params)
    if r.status_code == 429:
        raise RuntimeError("odds-api.io quota exhausted")
    r.raise_for_status()
    return r.json()


async def _build_index(sport: str = "football") -> dict:
    """norm('home')+'|'+norm('away') -> [entries] for Greek books (all leagues)."""
    idx: dict = {}
    if not enabled() or not GREEK_BOOKMAKERS:
        return idx
    books = ",".join(GREEK_BOOKMAKERS)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            events = await _get(client, "/events", {"sport": sport, "status": "pending"})
            if not isinstance(events, list):
                return idx
            ids, meta = [], {}
            for e in events[:MAX_EVENTS]:
                eid = e.get("id")
                if eid is None:
                    continue
                ids.append(eid)
                meta[eid] = (e.get("home") or "", e.get("away") or "")
            for start in range(0, len(ids), 10):
                chunk = ids[start:start + 10]
                data = await _get(client, "/odds/multi", {
                    "eventIds": ",".join(str(i) for i in chunk), "bookmakers": books,
                })
                for ev in data if isinstance(data, list) else []:
                    eid = ev.get("id")
                    home = ev.get("home") or meta.get(eid, ("", ""))[0]
                    away = ev.get("away") or meta.get(eid, ("", ""))[1]
                    entries = []
                    for book, markets in (ev.get("bookmakers") or {}).items():
                        if book not in GREEK_BOOKMAKERS:
                            continue
                        o = _ml_odds(markets)
                        if o:
                            entries.append({"bookmaker": book, "odds": o})
                    if entries:
                        idx[f"{_norm(home)}|{_norm(away)}"] = entries
    except Exception as e:
        logger.warning("odds_api_io._build_index(%s): %s", sport, type(e).__name__)
        return {}
    return idx


async def greek_odds_index(sport: str = "football") -> dict:
    """Cached (12h) index of Greek-bookmaker ML odds keyed by team names."""
    if not enabled():
        return {}
    ck = f"oaio_idx_{sport}"
    hit = _cache_get(ck)
    if hit is not None:
        return hit
    async with _lock:
        hit = _cache_get(ck)
        if hit is not None:
            return hit
        idx = await _build_index(sport)
        _cache_set(ck, idx, CACHE_TTL if idx else 600)
        return idx


def lookup(idx: dict, home: str, away: str) -> list:
    """Fuzzy match a fixture to Greek-book entries (exact key, else substring)."""
    if not idx:
        return []
    hk, ak = _norm(home), _norm(away)
    if not hk or not ak:
        return []
    key = f"{hk}|{ak}"
    if key in idx:
        return idx[key]
    for k, v in idx.items():
        eh, _, ea = k.partition("|")
        home_ok = len(hk) >= 4 and (hk in eh or eh in hk)
        away_ok = len(ak) >= 4 and (ak in ea or ea in ak)
        if home_ok and away_ok:
            return v
    return []
