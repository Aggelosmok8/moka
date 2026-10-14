"""Superbet (superbet.gr) pre-match odds — the only feed we have that quotes
fouls, offsides, goalkeeper saves, per-team corners and shots.

The file is ~550 MB of JSON (238 markets for every soccer event worldwide), so
it is NEVER loaded into memory: ijson streams it and we keep only the fixtures
of our own match list and the ~20 markets we actually price. Memory stays flat
(~100 MB), the download takes ~11 s and the scan 1-3 minutes, which is why the
refresh only ever runs as a background task — no request waits on it.

One call per refresh, 4 refreshes a day = ~120 of the 200 free monthly calls.
"""
import os
import re
import json
import time
import asyncio
import logging
import datetime as _dt

import httpx
import ijson

import rapid_books as rb

logger = logging.getLogger(__name__)

BOOK = "Superbet"
HOST = "superbet-odds"
FILE = "site_pregame_superbet_soccer.json"
TTL = float(os.environ.get("SUPERBET_TTL_HOURS", "6")) * 3600
MAX_MONTHLY = int(os.environ.get("SUPERBET_MAX_MONTHLY", "120"))
HORIZON_DAYS = 12

_mem = {"picks": {}, "at": 0.0, "calls": 0, "month": ""}
_lock = asyncio.Lock()


def enabled() -> bool:
    return (os.environ.get("SUPERBET", "on").strip().lower() not in ("off", "0", "false")
            and bool((os.environ.get("RAPIDAPI_ODDS_KEY") or "").strip()))


def _month() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m")


# --------------------------------------------------------------------------- #
# market mapping
# --------------------------------------------------------------------------- #
_OU = re.compile(r"^(over|under)(?:\s+([\d.]+))?$", re.I)
_CS = re.compile(r"^(\d{1,2})\s*[:\-]\s*(\d{1,2})$")
_DC = {"1x": "home_or_draw", "x2": "away_or_draw", "12": "home_or_away"}

_BASE_MARKET = {
    "total goals": "goals",
    "1st half - total goals": "fh_goals",
    "total corners": "corners",
    "total cards": "cards",
    "total fouls": "fouls",
    "total offsides": "offsides",
    "total goalkeeper saves": "saves",
    "total shots": "shots",
    "total shots on target": "sot",
}


def _strip_team(nm: str, home: str, away: str):
    """'Total Corners Portsmouth' / 'Portsmouth - Total Cards' -> (side, base)."""
    for side, team in (("home", home), ("away", away)):
        if not team:
            continue
        pat = re.compile(rf"(^|\s|-)\s*{re.escape(team)}\s*(-|\s|$)", re.I)
        if pat.search(nm):
            base = pat.sub(" ", nm, count=1)
            return side, re.sub(r"\s{2,}", " ", base).strip(" -")
    return None, nm


def _pick_id(market: str, label: str, sbv, home: str, away: str):
    nm = (market or "").strip()
    lab = (label or "").strip()
    if not nm or not lab:
        return None
    low = lab.lower()

    if nm == "Both Teams to Score":
        return {"yes": "btts_yes", "no": "btts_no"}.get(low)
    if nm == "Double Chance":
        return _DC.get(low.replace(" ", ""))
    if nm == "Correct Score":
        g = _CS.match(lab)
        return f"cs_{int(g.group(1))}_{int(g.group(2))}" if g else None

    side, base = _strip_team(nm, home, away)
    kind = _BASE_MARKET.get(base.lower())
    if not kind:
        return None
    g = _OU.match(low)
    if not g:
        return None
    ou = g.group(1).lower()
    line = g.group(2) or (str(sbv or "").strip())
    try:
        line = f"{float(line):g}"
    except ValueError:
        return None
    # A whole line is a push at the book on totals it runs 2-way (goals), so we
    # only publish half lines for goals; the stat markets are 3-way there.
    if kind in ("goals", "fh_goals") and float(line) * 2 % 2 != 1:
        return None

    if kind == "goals":
        return f"{side}_{ou}_{line}" if side else f"{ou}_{line}"
    if kind == "fh_goals":
        return None if side else f"fh_{ou}_{line}"
    return f"{side}_{kind}_{ou}_{line}" if side else f"{kind}_{ou}_{line}"


# --------------------------------------------------------------------------- #
# streaming refresh
# --------------------------------------------------------------------------- #
class _Reader:
    """Turns httpx's byte iterator into the file-like object ijson expects."""

    def __init__(self, it):
        self._it, self._buf = it, b""

    def read(self, n=-1):
        while n < 0 or len(self._buf) < n:
            try:
                self._buf += next(self._it)
            except StopIteration:
                break
        if n < 0:
            out, self._buf = self._buf, b""
        else:
            out, self._buf = self._buf[:n], self._buf[n:]
        return out


def _wanted_keys(matches: list) -> set:
    out = set()
    for m in matches or []:
        h = ((m.get("home") or {}).get("name")) or ""
        a = ((m.get("away") or {}).get("name")) or ""
        if h and a:
            out.add(f"{rb._norm(h)}|{rb._norm(a)}")
    return out


async def _db():
    from database import Database
    return Database().odds_cache


async def _load_db():
    try:
        row = await (await _db()).find_one({"slug": "superbet"})
        if not row:
            return
        data = row.get("data")
        if isinstance(data, str):
            data = json.loads(data)
        _mem["picks"] = (data or {}).get("picks") or {}
        _mem["at"] = float(row.get("fetched_at") or 0)
        _mem["month"] = row.get("month") or ""
        _mem["calls"] = int(row.get("calls") or 0)
    except Exception as e:
        logger.warning("superbet load: %s", type(e).__name__)


async def _save_db():
    try:
        await (await _db()).update_one(
            {"slug": "superbet"},
            {"$set": {"data": json.dumps({"picks": _mem["picks"]}),
                      "fetched_at": str(_mem["at"]), "month": _mem["month"],
                      "calls": _mem["calls"]}}, upsert=True)
    except Exception as e:
        logger.warning("superbet save: %s", type(e).__name__)


def _parse_stream(reader, wanted: set) -> dict:
    """Blocking: runs in a worker thread (it is CPU bound for 1-3 minutes)."""
    horizon = (_dt.datetime.now(_dt.timezone.utc)
               + _dt.timedelta(days=HORIZON_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    now = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    picks = {}
    pairs = [tuple(k.split("|", 1)) for k in (wanted or ()) if "|" in k]
    for ev in ijson.items(reader, "data.item"):
        fx = ev.get("fixture") or {}
        when = str(fx.get("utc_date") or "")
        if not (now <= when <= horizon):
            continue
        name = str(fx.get("event_name") or "")
        if "·" not in name:
            continue
        home, away = [p.strip() for p in name.split("·", 1)]
        hk, ak = rb._norm(home), rb._norm(away)
        key = f"{hk}|{ak}"
        if wanted and key not in wanted:
            # Superbet shortens club names ("Dortmund" vs "Borussia Dortmund"),
            # so fall back to the same tolerant match the other feeds use.
            key = next((f"{a}|{b}" for a, b in pairs
                        if rb._same_team(hk, a) and rb._same_team(ak, b)), None)
            if not key:
                continue
        slot = picks.setdefault(key, {})
        for m in ev.get("markets") or []:
            mname = m.get("name") or ""
            for o in m.get("odds") or []:
                if str(o.get("status") or "1") != "1":
                    continue
                price = rb._price(o.get("price"))
                if not price:
                    continue
                md = o.get("metadata") or {}
                pid = _pick_id(mname, md.get("name"), md.get("special_bet_value"), home, away)
                if not pid:
                    continue
                cur = slot.get(pid)
                if not cur or price > cur["odds"]:
                    slot[pid] = {"odds": price, "bookmaker": BOOK, "books": {BOOK: price}}
    return picks


def _download_and_parse(key: str, wanted: set) -> dict:
    """Blocking download + streaming parse, run in a worker thread (CPU bound
    for 1-3 minutes). A sync client is used on purpose: ijson needs a plain
    `read()` and an async stream cannot provide one."""
    with httpx.Client(timeout=httpx.Timeout(300.0, connect=15.0)) as c:
        with c.stream("GET", f"https://{HOST}.p.rapidapi.com/v1/data/{FILE}",
                      headers={"x-rapidapi-key": key,
                               "x-rapidapi-host": f"{HOST}.p.rapidapi.com"}) as r:
            r.raise_for_status()
            return _parse_stream(_Reader(r.iter_bytes(1024 * 256)), wanted)


async def refresh(force: bool = False) -> bool:
    """Stream one snapshot. Safe to call often — it no-ops while fresh."""
    if not enabled():
        return False
    async with _lock:
        if not _mem["at"]:
            await _load_db()
        if _mem["month"] != _month():
            _mem["month"], _mem["calls"] = _month(), 0
        if not force and time.time() - _mem["at"] < TTL:
            return False
        if _mem["calls"] >= MAX_MONTHLY:
            logger.warning("superbet: monthly call ceiling reached (%s)", MAX_MONTHLY)
            return False
        try:
            import live_values
            wanted = _wanted_keys(await live_values.build_live_matches())
        except Exception:
            wanted = set()
        if not wanted:
            return False
        key = (os.environ.get("RAPIDAPI_ODDS_KEY") or "").strip()
        t0 = time.time()
        try:
            _mem["calls"] += 1
            picks = await asyncio.to_thread(_download_and_parse, key, wanted)
        except Exception as e:
            logger.warning("superbet refresh: %s: %s", type(e).__name__, e)
            return False
        if picks:
            _mem["picks"], _mem["at"] = picks, time.time()
            await _save_db()
            logger.info("superbet: %d fixtures, %d prices in %.0fs",
                        len(picks), sum(len(v) for v in picks.values()), time.time() - t0)
        return bool(picks)


def _maybe_refresh():
    """Fire-and-forget: never blocks the request that noticed the staleness."""
    if enabled() and time.time() - _mem["at"] > TTL:
        asyncio.create_task(refresh())


async def pick_prices(home: str, away: str) -> dict:
    if not enabled():
        return {}
    if not _mem["at"]:
        await _load_db()
    _maybe_refresh()
    return dict(rb._lookup_picks(_mem["picks"], home, away) or {})


async def snapshot_at() -> float:
    if not _mem["at"]:
        await _load_db()
    return _mem["at"]


async def status() -> dict:
    if not _mem["at"]:
        await _load_db()
    return {"provider": BOOK, "callsThisMonth": _mem["calls"], "ceiling": MAX_MONTHLY,
            "fixtures": len(_mem["picks"]),
            "cachedAt": _dt.datetime.fromtimestamp(_mem["at"], _dt.timezone.utc).isoformat()
            if _mem["at"] else None}
