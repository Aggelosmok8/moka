"""Greek-market bookmaker prices from the RapidAPI "<book>-odds" snapshot feeds.

Every provider has its OWN 200-requests-per-month free plan, so each one gets:
one shared fetch, a 12h TTL, the parsed index mirrored to disk (a process
restart must not spend a request), a hard monthly ceiling, and stale data on any
error. Output is exactly the odds_api_io index shape, so live_values merges it
through the existing path.

Inert unless RAPIDAPI_ODDS_KEY is set. Per-provider opt-out via RAPID_BOOKS.
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

CACHE_TTL = 12 * 3600                        # ~62 requests/month per provider
MAX_MONTHLY = int(os.environ.get("RAPID_BOOKS_MAX_MONTHLY", "150"))
CACHE_DIR = Path("/tmp/rapid_books")

_mem: dict = {}                              # slug -> {"idx":..., "at":...}
_usage: dict = {}                            # slug -> {"month":..., "count":...}


def _key() -> str:
    return (os.environ.get("RAPIDAPI_ODDS_KEY")
            or os.environ.get("STOIXIMAN_RAPIDAPI_KEY") or "").strip()


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").strip().lower())


def _price(v) -> float:
    try:
        p = float(v)
    except (TypeError, ValueError):
        return 0.0
    return p if 1.0 < p <= 51.0 else 0.0


def _row(idx: dict, book: str, home: str, away: str, o: dict, updated):
    o = {k: v for k, v in o.items() if v}
    if not (home and away and len(o) == 3):
        return
    idx.setdefault(f"{_norm(home)}|{_norm(away)}", []).append(
        {"bookmaker": book, "odds": o, "source": "rapidapi", "updatedAt": updated})


# --- One parser per provider (their JSON shapes have nothing in common) -----

def _p_stoiximan(payload, book, idx):
    up = payload.get("updated_at")
    for blk in payload.get("data") or []:
        for b in ((blk or {}).get("data") or {}).get("blocks") or []:
            for ev in b.get("events") or []:
                for mkt in ev.get("markets") or []:
                    if mkt.get("type") != "MRES":
                        continue
                    s = {x.get("name"): x for x in mkt.get("selections") or []}
                    _row(idx, book, (s.get("1") or {}).get("fullName"),
                         (s.get("2") or {}).get("fullName"),
                         {k: _price((s.get(n) or {}).get("price"))
                          for k, n in (("home", "1"), ("draw", "X"), ("away", "2"))}, up)


def _p_novibet(payload, book, idx):
    up = payload.get("updated_at")
    for view in payload.get("data") or []:
        for bv in (view or {}).get("betViews") or []:
            for it in bv.get("items") or []:
                cap = it.get("additionalCaptions") or {}
                for mkt in it.get("markets") or []:
                    if mkt.get("betTypeSysname") != "SOCCER_MATCH_RESULT":
                        continue
                    s = {x.get("code"): x for x in mkt.get("betItems") or []}
                    _row(idx, book, cap.get("competitor1"), cap.get("competitor2"),
                         {k: _price((s.get(n) or {}).get("price"))
                          for k, n in (("home", "1"), ("draw", "X"), ("away", "2"))}, up)


def _p_bwin(payload, book, idx):
    up = payload.get("updated_at")
    for fx in ((payload.get("data") or {}).get("fixtures")) or []:
        parts = {((p.get("properties") or {}).get("type")): ((p.get("name") or {}).get("value"))
                 for p in fx.get("participants") or []}
        for mkt in fx.get("optionMarkets") or []:
            if ((mkt.get("name") or {}).get("value")) != "Match Result":
                continue
            o = {}
            for opt in mkt.get("options") or []:
                t = ((opt.get("parameters") or {}).get("optionTypes") or [None])[0]
                src = ((opt.get("sourceName") or {}).get("value")) or ""
                nm = ((opt.get("name") or {}).get("value")) or ""
                price = _price(((opt.get("price") or {}).get("odds")))
                # sourceName is the authoritative 1/X/2 marker: both team options
                # carry optionTypes ["Max"], so types alone cannot tell them apart.
                if src == "1":
                    o["home"] = price
                elif src == "2":
                    o["away"] = price
                elif t == "Draw" or nm == "X":
                    o["draw"] = price
            _row(idx, book, parts.get("HomeTeam"), parts.get("AwayTeam"), o, up)


def _p_opap(payload, book, idx):
    up = payload.get("updated_at")
    for ev in (((payload.get("data") or {}).get("data")) or {}).get("events") or []:
        name = ev.get("name") or ""
        parts = re.split(r"\s+v\.?\s+|\s+vs\.?\s+", name, maxsplit=1)
        if len(parts) != 2:
            continue
        home, away = parts[0].strip(), parts[1].strip()
        for mkt in ev.get("markets") or []:
            if mkt.get("groupCode") != "MATCH_RESULT":
                continue
            o = {}
            for out in mkt.get("outcomes") or []:
                dec = _price(((out.get("prices") or [{}])[0] or {}).get("decimal"))
                sub = (out.get("subType") or "").upper()
                nm = (out.get("name") or "").strip()
                if sub == "D" or nm.lower() == "draw":
                    o["draw"] = dec
                elif sub == "H" or _norm(nm) == _norm(home):
                    o["home"] = dec
                elif sub == "A" or _norm(nm) == _norm(away):
                    o["away"] = dec
            _row(idx, book, home, away, o, up)


def _p_elabet(payload, book, idx):
    up = payload.get("updated_at")
    d = payload.get("data") or {}
    mks = {m.get("id"): m for m in d.get("markets") or []}
    ods = {o.get("id"): o for o in d.get("odds") or []}
    comp = {c.get("id"): (c.get("name") or "") for c in d.get("competitors") or []}
    for ev in d.get("events") or []:
        cids = ev.get("competitorIds") or []
        if len(cids) != 2:
            continue
        home, away = comp.get(cids[0]), comp.get(cids[1])
        for mid in ev.get("marketIds") or []:
            m = mks.get(mid) or {}
            if (m.get("name") or "").strip().lower() != "1x2":
                continue
            o = {}
            for oid in m.get("oddIds") or []:
                od = ods.get(oid) or {}
                nm = (od.get("name") or "").strip()
                p = _price(od.get("price"))
                if nm.lower() in ("x", "draw"):
                    o["draw"] = p
                elif _norm(nm) == _norm(home):
                    o["home"] = p
                elif _norm(nm) == _norm(away):
                    o["away"] = p
            _row(idx, book, home, away, o, up)


# Superbet is excluded on purpose: its snapshot is ~476 MB per fetch.
# Fonbet is excluded: the feed is an opaque versioned packet, not an odds list.
PROVIDERS = {
    "stoiximan":    ("Stoiximan", "stoiximan-odds", "site_pregame_stoiximan_soccer_leagues.json", _p_stoiximan),
    "novibet":      ("Novibet", "novibet-odds", "site_pregame_novibet_soccer.json", _p_novibet),
    "bwin":         ("bwin", "bwin-odds1", "site_pregame_bwin_soccer.json", _p_bwin),
    "pamestoixima": ("Pame Stoixima", "allwyn-odds", "site_pregame_opapstore_soccer.json", _p_opap),
    "elabet":       ("Elabet", "elabet-odds", "site_pregame_elabet_soccer.json", _p_elabet),
}


def active_slugs() -> list:
    wanted = os.environ.get("RAPID_BOOKS", "").strip()
    slugs = [s.strip() for s in wanted.split(",") if s.strip()] if wanted else list(PROVIDERS)
    return [s for s in slugs if s in PROVIDERS]


def enabled() -> bool:
    return bool(_key()) and bool(active_slugs())


def _quota_left(slug: str) -> int:
    m = datetime.now(timezone.utc).strftime("%Y-%m")
    u = _usage.setdefault(slug, {"month": "", "count": 0})
    if u["month"] != m:
        u.update(month=m, count=0)
    return MAX_MONTHLY - u["count"]


def _disk(slug: str) -> Path:
    return CACHE_DIR / f"{slug}.json"


def _read_disk(slug: str):
    try:
        d = json.loads(_disk(slug).read_text())
        return d if isinstance(d, dict) and d.get("idx") else None
    except Exception:
        return None


async def _provider_index(slug: str) -> dict:
    book, host, file, parser = PROVIDERS[slug]
    now = time.time()
    mem = _mem.get(slug)
    if mem and now - mem["at"] < CACHE_TTL:
        return mem["idx"]
    disk = _read_disk(slug)
    if disk and now - disk.get("at", 0) < CACHE_TTL:
        _mem[slug] = {"idx": disk["idx"], "at": disk["at"]}
        return disk["idx"]
    stale = (disk or {}).get("idx") or (mem or {}).get("idx") or {}
    if _quota_left(slug) <= 0:
        logger.warning("rapid_books[%s]: monthly ceiling reached, serving stale", slug)
        return stale
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(40.0, connect=8.0)) as client:
            r = await client.get(f"https://{host}.p.rapidapi.com/v1/data/{file}",
                                 headers={"x-rapidapi-key": _key(),
                                          "x-rapidapi-host": f"{host}.p.rapidapi.com",
                                          "accept": "application/json"})
        _usage[slug]["count"] += 1
        if r.status_code != 200:
            logger.warning("rapid_books[%s]: HTTP %s (call %s/%s this month)",
                           slug, r.status_code, _usage[slug]["count"], MAX_MONTHLY)
            return stale
        idx: dict = {}
        parser(r.json(), book, idx)
    except Exception as e:
        logger.warning("rapid_books[%s]: %s", slug, type(e).__name__)
        return stale
    if not idx:
        return stale
    _mem[slug] = {"idx": idx, "at": now}
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _disk(slug).write_text(json.dumps({"idx": idx, "at": now}))
    except Exception:
        pass
    logger.info("rapid_books[%s]: %s matches priced (call %s/%s this month)",
                slug, len(idx), _usage[slug]["count"], MAX_MONTHLY)
    return idx


async def provider_indexes() -> list:
    """One index PER provider. They spell team names differently, so a fuzzy
    lookup must run separately on each — a single merged index would resolve a
    fixture to whichever provider happened to match first and drop the rest."""
    if not enabled():
        return []
    out = []
    for slug in active_slugs():
        try:
            idx = await _provider_index(slug)
        except Exception as e:
            logger.warning("rapid_books.provider_indexes(%s): %s", slug, type(e).__name__)
            continue
        if idx:
            out.append(idx)
    return out


async def odds_index() -> dict:
    """Merged index of every active provider. {} when disabled/unavailable."""
    out: dict = {}
    for idx in await provider_indexes():
        for k, entries in idx.items():
            out.setdefault(k, []).extend(entries)
    return out
