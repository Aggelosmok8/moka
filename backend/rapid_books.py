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


_OU = re.compile(r"^(over|under)\s*([\d.]+)?$", re.I)
_LINE_IN_NAME = re.compile(r"(\d+(?:\.\d+)?)")


def _dc_id(s: str, home: str, away: str):
    """Double chance: providers write it as "1X" / "1 or X" / "<home> or Draw"."""
    t = re.sub(r"\s+|-", "", s).replace("or", "")
    h, a = _norm(home), _norm(away)
    if h:
        t = t.replace(re.sub(r"\s+", "", h), "1")
    if a:
        t = t.replace(re.sub(r"\s+", "", a), "2")
    t = t.replace("draw", "x")
    if t in ("1x", "x1"):
        return "home_or_draw"
    if t in ("x2", "2x"):
        return "away_or_draw"
    if t in ("12", "21"):
        return "home_or_away"
    return None


def _side_id(s: str, home: str, away: str, prefix: str):
    """1 / X / 2 or a team name -> <prefix>_home | _draw | _away."""
    t = re.sub(r"\s+", "", s)
    h, a = re.sub(r"\s+", "", _norm(home)), re.sub(r"\s+", "", _norm(away))
    if t == "1" or (h and t == h):
        return f"{prefix}_home"
    if t == "2" or (a and t == a):
        return f"{prefix}_away"
    if t in ("x", "draw", "tie"):
        return f"{prefix}_draw"
    return None


def _pick_id(mkt: str, sel: str, line=None, home: str = "", away: str = ""):
    """Map a provider's market+selection to one of our Specific Bets pick ids."""
    m, s = (mkt or "").lower(), (sel or "").strip().lower()
    if "double chance" in m or "doublechance" in m:
        return _dc_id(s, home, away)
    if ("half" in m and "result" in m) or "half time result" in m or "1st half result" in m:
        return _side_id(s, home, away, "ht")
    if "first team to score" in m or "first goal" in m:
        if s in ("no goal", "none", "no goals", "neither"):
            return "fts_none"
        return _side_id(s, home, away, "fts")
    g = _OU.match(s)
    if g:
        side = g.group(1).lower()
        ln = g.group(2) or line
        if ln is None:
            hit = _LINE_IN_NAME.search(m)
            ln = hit.group(1) if hit else None
        if ln is None:
            return None
        try:
            ln = float(str(ln).replace(",", "."))
        except ValueError:
            return None
        if "corner" in m:
            return f"corners_{side}_{ln}"
        if "card" in m or "booking" in m:
            return f"cards_{side}_{ln}"
        if "half" in m:
            return f"fh_{side}_{ln}"
        if "goal" in m or "total" in m or "over" in m or "under" in m:
            return f"{side}_{ln}"
        return None
    if "both teams" in m or "btts" in m or "goal/no goal" in m:
        if s in ("yes", "goal", "gg", "both teams to score"):
            return "btts_yes"
        if s in ("no", "no goal", "ng"):
            return "btts_no"
    return None


def _extra(pidx: dict, key: str, book: str, mkt: str, sel: str, price, line=None,
           home: str = "", away: str = ""):
    p = _price(price)
    if not p or not key:
        return
    pick = _pick_id(mkt, sel, line, home, away)
    if not pick:
        return
    slot = pidx.setdefault(key, {}).setdefault(pick, {"odds": 0.0, "bookmaker": "", "books": {}})
    # Keep every book's price: a parlay can only be placed inside ONE bookmaker.
    if p > slot["books"].get(book, 0):
        slot["books"][book] = p
    if p > slot["odds"]:
        slot.update(odds=p, bookmaker=book)


# --- One parser per provider (their JSON shapes have nothing in common) -----

def _p_stoiximan(payload, book, idx, pidx):
    up = payload.get("updated_at")
    for blk in payload.get("data") or []:
        for b in ((blk or {}).get("data") or {}).get("blocks") or []:
            for ev in b.get("events") or []:
                key = ""
                h = a = ""
                for mkt in ev.get("markets") or []:
                    sels = {x.get("name"): x for x in mkt.get("selections") or []}
                    if mkt.get("type") == "MRES":
                        h = (sels.get("1") or {}).get("fullName")
                        a = (sels.get("2") or {}).get("fullName")
                        key = f"{_norm(h)}|{_norm(a)}" if h and a else key
                        _row(idx, book, h, a,
                             {k: _price((sels.get(n) or {}).get("price"))
                              for k, n in (("home", "1"), ("draw", "X"), ("away", "2"))}, up)
                        continue
                    for x in mkt.get("selections") or []:
                        _extra(pidx, key, book, mkt.get("name") or "",
                               x.get("name") or "", x.get("price"), mkt.get("handicap"),
                               h or "", a or "")


_NOVI_MKT = {"SOCCER_UNDER_OVER": "Goals Over/Under",
             "SOCCER_BOTH_TEAMS_TO_SCORE": "Both Teams To Score",
             "SOCCER_CORNERS_UNDER_OVER": "Corners Over/Under",
             "SOCCER_FIRST_HALF_UNDER_OVER": "1st Half Goals Over/Under",
             "SOCCER_DOUBLE_CHANCE": "Double Chance",
             "SOCCER_FIRST_HALF_RESULT": "Half Time Result"}


def _p_novibet(payload, book, idx, pidx):
    up = payload.get("updated_at")
    for view in payload.get("data") or []:
        for bv in (view or {}).get("betViews") or []:
            for it in bv.get("items") or []:
                cap = it.get("additionalCaptions") or {}
                h, a = cap.get("competitor1"), cap.get("competitor2")
                key = f"{_norm(h)}|{_norm(a)}" if h and a else ""
                for mkt in it.get("markets") or []:
                    sys_name = mkt.get("betTypeSysname")
                    items = mkt.get("betItems") or []
                    if sys_name == "SOCCER_MATCH_RESULT":
                        s = {x.get("code"): x for x in items}
                        _row(idx, book, h, a,
                             {k: _price((s.get(n) or {}).get("price"))
                              for k, n in (("home", "1"), ("draw", "X"), ("away", "2"))}, up)
                        continue
                    name = _NOVI_MKT.get(sys_name)
                    if not name:
                        continue
                    for x in items:
                        # Novibet puts the line in the selection caption, e.g. "Over 2.5".
                        # `caption` holds "Over 2.5"; instanceCaption is the bare line.
                        # For 1X2-shaped markets the outcome lives in `code` ("1"/"X"/"2").
                        _extra(pidx, key, book, name,
                               x.get("caption") or x.get("betDisplayCaption")
                               or x.get("code") or "",
                               x.get("price"), x.get("instanceCaption"), h, a)


def _p_bwin(payload, book, idx, pidx):
    up = payload.get("updated_at")
    for fx in ((payload.get("data") or {}).get("fixtures")) or []:
        parts = {((p.get("properties") or {}).get("type")): ((p.get("name") or {}).get("value"))
                 for p in fx.get("participants") or []}
        key = f"{_norm(parts.get('HomeTeam'))}|{_norm(parts.get('AwayTeam'))}"
        for mkt in fx.get("optionMarkets") or []:
            mname = ((mkt.get("name") or {}).get("value")) or ""
            if mname != "Match Result":
                for opt in mkt.get("options") or []:
                    _extra(pidx, key, book, mname, ((opt.get("name") or {}).get("value")) or "",
                           ((opt.get("price") or {}).get("odds")),
                           (opt.get("parameters") or {}).get("attribute"),
                           parts.get("HomeTeam") or "", parts.get("AwayTeam") or "")
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


def _p_opap(payload, book, idx, pidx):
    up = payload.get("updated_at")
    for ev in (((payload.get("data") or {}).get("data")) or {}).get("events") or []:
        name = ev.get("name") or ""
        parts = re.split(r"\s+v\.?\s+|\s+vs\.?\s+", name, maxsplit=1)
        if len(parts) != 2:
            continue
        home, away = parts[0].strip(), parts[1].strip()
        key = f"{_norm(home)}|{_norm(away)}"
        for mkt in ev.get("markets") or []:
            if mkt.get("groupCode") != "MATCH_RESULT":
                for out in mkt.get("outcomes") or []:
                    _extra(pidx, key, book, mkt.get("name") or mkt.get("groupCode") or "",
                           out.get("name") or "",
                           ((out.get("prices") or [{}])[0] or {}).get("decimal"),
                           mkt.get("handicapValue"), home, away)
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


def _p_elabet(payload, book, idx, pidx):
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
        key = f"{_norm(home)}|{_norm(away)}"
        for mid in ev.get("marketIds") or []:
            m = mks.get(mid) or {}
            mname = (m.get("name") or "").strip()
            if mname.lower() != "1x2":
                for oid in m.get("oddIds") or []:
                    od = ods.get(oid) or {}
                    _extra(pidx, key, book, mname, od.get("name") or "", od.get("price"),
                           None, home or "", away or "")
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


def _write_disk(slug: str, idx: dict, pidx: dict, at: float):
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _disk(slug).write_text(json.dumps({"idx": idx, "picks": pidx, "at": at}))
    except Exception:
        pass


# The month's call count and the parsed snapshot both live in the DB as well as
# on disk: /tmp is wiped on every redeploy, and an in-memory counter would let a
# restart storm spend the whole free quota without the ceiling ever noticing.

def _month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _db():
    from database import Database
    return Database().odds_cache


async def _read_db(slug: str):
    try:
        row = await _db().find_one({"slug": slug})
    except Exception as e:
        logger.warning("rapid_books[%s]: db read %s", slug, type(e).__name__)
        return None
    if not row:
        return None
    data = row.get("data") or {}
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            return None
    if not data.get("idx"):
        return None
    return {"idx": data["idx"], "picks": data.get("picks") or {},
            "at": float(row.get("fetched_at") or 0),
            "month": row.get("month") or "", "calls": int(row.get("calls") or 0)}


async def _write_db(slug: str, idx: dict, pidx: dict, at: float, calls: int):
    try:
        await _db().update_one(
            {"slug": slug},
            {"$set": {"data": json.dumps({"idx": idx, "picks": pidx}),
                      "fetched_at": str(at), "month": _month(), "calls": calls}},
            upsert=True)
    except Exception as e:
        logger.warning("rapid_books[%s]: db write %s", slug, type(e).__name__)


async def _bump_usage(slug: str) -> int:
    """Count this request against the month, in the DB, and return the new total."""
    row = await _read_db(slug)
    calls = (row or {}).get("calls", 0) + 1 if (row or {}).get("month") == _month() else 1
    _usage[slug] = {"month": _month(), "count": calls}
    return calls


async def _quota_left(slug: str) -> int:
    m = _month()
    u = _usage.get(slug)
    if not u or u["month"] != m:
        row = await _read_db(slug)
        used = row["calls"] if row and row.get("month") == m else 0
        u = _usage[slug] = {"month": m, "count": used}
    return MAX_MONTHLY - u["count"]


async def quota_status() -> list:
    """Per-provider call budget — what /api/admin/odds-quota reports."""
    out = []
    for slug in active_slugs():
        row = await _read_db(slug)
        left = await _quota_left(slug)
        out.append({"provider": PROVIDERS[slug][0], "slug": slug,
                    "callsThisMonth": MAX_MONTHLY - left, "ceiling": MAX_MONTHLY,
                    "left": left, "freePlanLimit": 200,
                    "cachedMatches": len((row or {}).get("idx") or {}),
                    "cachedAt": (datetime.fromtimestamp((row or {}).get("at") or 0, timezone.utc)
                                 .isoformat() if (row or {}).get("at") else None),
                    "servingStale": left <= 0})
    return out


async def _provider_index(slug: str) -> dict:
    book, host, file, parser = PROVIDERS[slug]
    now = time.time()
    mem = _mem.get(slug)
    if mem and now - mem["at"] < CACHE_TTL:
        return mem
    disk = _read_disk(slug)
    if disk and now - disk.get("at", 0) < CACHE_TTL:
        _mem[slug] = {"idx": disk["idx"], "picks": disk.get("picks") or {}, "at": disk["at"]}
        # Mirror a disk-only snapshot into the DB so the next redeploy, which
        # wipes /tmp, still costs no request.
        row = await _read_db(slug)
        if not row or row["at"] < disk["at"]:
            keep = (row or {}).get("calls", 0) if (row or {}).get("month") == _month() else 0
            await _write_db(slug, disk["idx"], disk.get("picks") or {}, disk["at"], keep)
        return _mem[slug]
    # /tmp is empty after a redeploy — the DB copy means a restart costs no request.
    row = await _read_db(slug)
    if row and now - row["at"] < CACHE_TTL:
        _mem[slug] = {"idx": row["idx"], "picks": row["picks"], "at": row["at"]}
        _write_disk(slug, row["idx"], row["picks"], row["at"])
        return _mem[slug]
    stale = disk or mem or ({"idx": row["idx"], "picks": row["picks"], "at": row["at"]} if row else {})
    if await _quota_left(slug) <= 0:
        logger.warning("rapid_books[%s]: monthly ceiling reached, serving stale", slug)
        return stale
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(40.0, connect=8.0)) as client:
            r = await client.get(f"https://{host}.p.rapidapi.com/v1/data/{file}",
                                 headers={"x-rapidapi-key": _key(),
                                          "x-rapidapi-host": f"{host}.p.rapidapi.com",
                                          "accept": "application/json"})
        calls = await _bump_usage(slug)
        if r.status_code != 200:
            logger.warning("rapid_books[%s]: HTTP %s (call %s/%s this month)",
                           slug, r.status_code, calls, MAX_MONTHLY)
            await _write_db(slug, (stale.get("idx") or {}), (stale.get("picks") or {}),
                            stale.get("at") or 0, calls)
            return stale
        idx, pidx = {}, {}
        parser(r.json(), book, idx, pidx)
    except Exception as e:
        logger.warning("rapid_books[%s]: %s", slug, type(e).__name__)
        return stale
    if not idx:
        return stale
    _mem[slug] = {"idx": idx, "picks": pidx, "at": now}
    _write_disk(slug, idx, pidx, now)
    await _write_db(slug, idx, pidx, now, calls)
    logger.info("rapid_books[%s]: %s matches priced, %s with extra markets (call %s/%s this month)",
                slug, len(idx), len(pidx), calls, MAX_MONTHLY)
    return _mem[slug]


async def _provider_bundle(slug: str) -> dict:
    return await _provider_index(slug)


async def provider_indexes() -> list:
    """One index PER provider. They spell team names differently, so a fuzzy
    lookup must run separately on each — a single merged index would resolve a
    fixture to whichever provider happened to match first and drop the rest."""
    if not enabled():
        return []
    out = []
    for slug in active_slugs():
        try:
            b = await _provider_index(slug)
        except Exception as e:
            logger.warning("rapid_books.provider_indexes(%s): %s", slug, type(e).__name__)
            continue
        if (b or {}).get("idx"):
            out.append(b["idx"])
    return out


async def pick_prices(home: str, away: str) -> dict:
    """Best available price per Specific Bets pick id for one fixture.

    Reads the SAME cached snapshots as the 1X2 index — no extra API call."""
    if not enabled():
        return {}
    out: dict = {}
    for slug in active_slugs():
        try:
            picks = (await _provider_index(slug) or {}).get("picks") or {}
        except Exception:
            continue
        got = _lookup_picks(picks, home, away)
        for pick, v in got.items():
            cur = out.setdefault(pick, {"odds": 0.0, "bookmaker": "", "books": {}})
            for b, p in (v.get("books") or {}).items():
                if p > cur["books"].get(b, 0):
                    cur["books"][b] = p
            if v["odds"] > cur["odds"]:
                cur.update(odds=v["odds"], bookmaker=v["bookmaker"])
    return out


def _lookup_picks(picks: dict, home: str, away: str) -> dict:
    """Exact key first, then a contains-match on either side (team naming
    differs between providers and API-Football)."""
    hk, ak = _norm(home), _norm(away)
    if not hk or not ak:
        return {}
    hit = picks.get(f"{hk}|{ak}")
    if hit:
        return hit
    for key, v in picks.items():
        a, b = key.split("|", 1) if "|" in key else ("", "")
        if not a or not b:
            continue
        if (hk in a or a in hk) and (ak in b or b in ak):
            return v
    return {}


async def odds_index() -> dict:
    """Merged index of every active provider. {} when disabled/unavailable."""
    out: dict = {}
    for idx in await provider_indexes():
        for k, entries in idx.items():
            out.setdefault(k, []).extend(entries)
    return out
