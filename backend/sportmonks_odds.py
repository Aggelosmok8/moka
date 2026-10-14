"""Sportmonks pre-match odds — the only feed we have that actually quotes the
"extra" markets: alternative corner lines, card counts, player bookings,
player shots/assists and full correct-score grids.

API-Football gives one corners line and (sometimes) one cards line per fixture;
Sportmonks gives a dozen. Fouls, offsides and goalkeeper saves do NOT exist in
any feed we have access to.

Budget: the plan allows 180 odds requests per hour, so a fixture's odds are
cached for an hour and the date index (one call per kickoff day, shared by every
fixture of that day) for six.
"""
import os
import re
import time
import logging
from difflib import SequenceMatcher

import httpx

import rapid_books as rb
from apifootball import _c_get, _c_set, _bookmaker_approved, player_key

logger = logging.getLogger(__name__)

BASE = "https://api.sportmonks.com/v3/football"
MAX_PER_HOUR = int(os.environ.get("SPORTMONKS_MAX_HOURLY", "150"))
_hour = {"slot": 0, "count": 0}


def enabled() -> bool:
    return bool((os.environ.get("SPORTMONKS_API_KEY") or "").strip())


def _budget_ok() -> bool:
    slot = int(time.time() // 3600)
    if _hour["slot"] != slot:
        _hour.update(slot=slot, count=0)
    if _hour["count"] >= MAX_PER_HOUR:
        return False
    _hour["count"] += 1
    return True


async def _get(path: str, params: dict) -> dict:
    if not _budget_ok():
        raise RuntimeError("sportmonks hourly odds budget reached")
    p = dict(params or {})
    p["api_token"] = (os.environ.get("SPORTMONKS_API_KEY") or "").strip()
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{BASE}{path}", params=p)
    r.raise_for_status()
    return r.json()


async def _date_index(day: str) -> dict:
    """{fixture_id: (home, away, kickoff)} for one kickoff day."""
    ck = f"sm_day_{day}"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    out = {}
    try:
        page, pages = 1, 1
        while page <= pages and page <= 5:
            d = await _get(f"/fixtures/date/{day}",
                           {"per_page": 100, "page": page, "include": "participants"})
            for f in d.get("data") or []:
                home = away = None
                for p in f.get("participants") or []:
                    loc = ((p.get("meta") or {}).get("location") or "").lower()
                    if loc == "home":
                        home = p.get("name")
                    elif loc == "away":
                        away = p.get("name")
                if home and away:
                    out[str(f.get("id"))] = (home, away, f.get("starting_at") or "")
            pages = ((d.get("pagination") or {}).get("total_pages")) or 1
            page += 1
    except Exception as e:
        logger.warning("sportmonks date index %s: %s", day, type(e).__name__)
    _c_set(ck, out, ttl=6 * 3600 if out else 300)
    return out


_ALIAS = {"copenhagen": "kbenhavn", "fccopenhagen": "fckbenhavn", "aarhus": "agf"}


def _close(a: str, b: str) -> float:
    na, nb = rb._norm(a), rb._norm(b)
    na, nb = _ALIAS.get(na, na), _ALIAS.get(nb, nb)
    return SequenceMatcher(None, na, nb).ratio()


async def _fixture_id(home: str, away: str, kickoff: str):
    """Sportmonks spells clubs differently from API-Football (FC København vs
    FC Copenhagen, AGF vs Aarhus), so names are matched fuzzily and only ever
    within the same kickoff day."""
    day = (kickoff or "")[:10]
    if not day:
        return None
    idx = await _date_index(day)
    best, score = None, 0.0
    for fid, (h, a, _at) in (idx or {}).items():
        s = (_close(home, h) + _close(away, a)) / 2
        if s > score:
            best, score = fid, s
    return best if score >= 0.62 else None


_PLUS = re.compile(r"^(\d+)\s*\+$")
_CS = re.compile(r"^(\d{1,2})\s*[:\-]\s*(\d{1,2})$")
_TEAM_TOTAL = re.compile(r"^(over|under)\s*([\d.]+)$", re.I)

_GOALS = ("Goals Over/Under", "Alternative Total Goals", "Total Goals")
_FH_GOALS = ("1st Half Goals", "Alternative 1st Half Goals")
_CORNERS = ("Corners", "Total Corners", "Alternative Corners", "2-Way Corners",
            "Asian Total Corners")
_CARDS = ("Number of Cards", "Asian Total Cards", "Total Cards", "Cards Over/Under")


def _line(total, name) -> str:
    """Sportmonks puts the line in `total` (sometimes in `name`), as '2.5', '3',
    or even '1.0, 1.5' for split Asian lines (which we skip)."""
    for v in (total, name):
        s = str(v or "").strip()
        if not s or "," in s:
            continue
        try:
            f = float(s)
        except ValueError:
            continue
        return f"{f:g}"
    return ""


def _sm_pick(market: str, label: str, total, handicap, name: str):
    """One Sportmonks odd row -> our pick id (or None)."""
    m = (market or "").strip()
    lab = (label or "").strip()
    low = lab.lower()

    if m in _GOALS or m in _FH_GOALS or m in _CORNERS or m in _CARDS:
        if low not in ("over", "under"):
            return None
        line = _line(total, name)
        if not line:
            return None
        # Asian markets push on the exact number; our settlement has no push, so
        # only their half lines are safe to publish. The "Alternative …" markets
        # are 3-way (Over / Under / Exactly), where an exact hit loses both
        # sides — exactly how we settle whole-number lines.
        if m.startswith("Asian") and float(line) * 2 % 2 != 1:
            return None
        if m in _FH_GOALS:
            return f"fh_{low}_{line}"
        if m in _CORNERS:
            return f"corners_{low}_{line}"
        if m in _CARDS:
            return f"cards_{low}_{line}"
        return f"{low}_{line}"

    if m == "Team Total Goals":
        g = _TEAM_TOTAL.match(str(total or "").strip())
        side = {"1": "home", "2": "away"}.get(lab)
        if g and side:
            return f"{side}_{g.group(1).lower()}_{float(g.group(2)):g}"
        return None

    if m == "Correct Score":
        g = _CS.match(str(name or "").strip())
        return f"cs_{int(g.group(1))}_{int(g.group(2))}" if g else None

    if m == "Both Teams To Score":
        return {"yes": "btts_yes", "no": "btts_no"}.get(low)

    # ---- player markets (keyed by name; Specific Bets resolves the squad) ----
    key = player_key(name)
    if not key:
        return None
    if m in ("Goalscorers", "Player to Score", "Team Goalscorer") and low == "anytime":
        return f"pn:{key}:score"
    if m in ("Player to Score", "Goalscorers") and low == "score":
        return f"pn:{key}:score"
    if m == "Player to Assist":
        return f"pn:{key}:assist"
    if m == "Player to be booked":
        return f"pn:{key}:card"
    g = _PLUS.match(lab)
    if g:
        n = int(g.group(1))
        if m == "Player Shots":
            return f"pn:{key}:shots_over_{n - 0.5:g}"
        if m == "Player Shots on Target":
            return f"pn:{key}:sot_over_{n - 0.5:g}"
    return None


_BOOK_NAMES = {"bet365": "Bet365", "bwin": "bwin", "novibet": "Novibet",
               "stoiximan": "Stoiximan", "betsson": "Betsson", "netbet": "NetBet",
               "interwetten": "Interwetten", "winmasters": "Winmasters"}


async def pick_odds(home: str, away: str, kickoff: str) -> dict:
    """{pick_id: {odds, bookmaker, books}} for one fixture, Greek-licensed books
    only. Returns {} when the fixture or the budget isn't there."""
    if not enabled():
        return {}
    ck = f"sm_odds_{rb._norm(home)}_{rb._norm(away)}_{(kickoff or '')[:10]}"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    out = {}
    try:
        fid = await _fixture_id(home, away, kickoff)
        if fid:
            d = await _get(f"/odds/pre-match/fixtures/{fid}",
                           {"per_page": 1000, "include": "bookmaker;market"})
            for x in d.get("data") or []:
                book = ((x.get("bookmaker") or {}).get("name") or "").strip()
                if not _bookmaker_approved(book):
                    continue
                book = _BOOK_NAMES.get(book.lower(), book)
                price = rb._price(x.get("value"))
                if not price:
                    continue
                pick = _sm_pick((x.get("market") or {}).get("name"), x.get("label"),
                                x.get("total"), x.get("handicap"), x.get("name"))
                if not pick:
                    continue
                slot = out.setdefault(pick, {"odds": 0.0, "bookmaker": "", "books": {}})
                if price > (slot["books"].get(book) or 0):
                    slot["books"][book] = price
                if price > slot["odds"]:
                    slot.update(odds=price, bookmaker=book)
    except Exception as e:
        logger.warning("sportmonks odds %s-%s: %s", home, away, type(e).__name__)
    _c_set(ck, out, ttl=3600 if out else 300)
    return out
