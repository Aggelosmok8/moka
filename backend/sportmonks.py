"""Async client for SportMonks Football API v3.

Free plan covers Danish Superliga (271) + Scottish Premiership (501). Used to
enrich live matches with real team stats (form, goals per game) for the value
engine. Odds come from The Odds API separately.
"""
import os
import re
import logging
import unicodedata
import httpx

logger = logging.getLogger(__name__)

BASE = "https://api.sportmonks.com/v3/football"

# internal slug -> SportMonks league id
LEAGUE_IDS = {"denmark": 271, "scotland": 501}


def _key() -> str:
    return os.environ.get("SPORTMONKS_API_KEY", "")


def norm_name(name: str) -> str:
    """Accent-stripped, alnum-only lowercase key for fuzzy team matching."""
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", name).encode("ASCII", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


async def _get(path: str, params: dict = None) -> dict:
    key = _key()
    if not key:
        raise RuntimeError("SPORTMONKS_API_KEY not configured")
    p = {"api_token": key}
    p.update(params or {})
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{BASE}{path}", params=p)
    r.raise_for_status()
    return r.json()


async def current_season_id(league_id: int):
    d = await _get(f"/leagues/{league_id}", {"include": "currentSeason"})
    data = d.get("data") or {}
    cs = data.get("currentseason") or data.get("currentSeason") or {}
    return cs.get("id")


def _form_score(form_list) -> float:
    """Recent W/D/L -> 0-10 score."""
    if not form_list:
        return 5.0
    pts = {"W": 3, "D": 1, "L": 0}
    recent = form_list[-5:]
    earned = sum(pts.get((f.get("form") or "").upper(), 0) for f in recent)
    return round(earned / (len(recent) * 3) * 10, 1)


def _detail(details, *names):
    for x in details or []:
        nm = ((x.get("type") or {}).get("name") or "")
        if nm in names:
            return x.get("value")
    return None


async def team_stats_for_league(league_id: int) -> dict:
    """Return {norm_name: stats} from the league's current standings."""
    sid = await current_season_id(league_id)
    if not sid:
        return {}
    d = await _get(f"/standings/seasons/{sid}", {"include": "participant;details.type;form"})
    out = {}
    for r in d.get("data") or []:
        p = r.get("participant") or {}
        name = p.get("name")
        if not name:
            continue
        det = r.get("details") or []
        played = float(_detail(det, "Overall Matches Played") or 0)
        gs = float(_detail(det, "Overal Goals Scored", "Overall Goals Scored") or 0)
        gc = float(_detail(det, "Overall Goals Conceded") or 0)
        out[norm_name(name)] = {
            "name": name,
            "form": _form_score(r.get("form")),
            "goalsScored": round(gs / played, 2) if played else 1.2,
            "goalsConceded": round(gc / played, 2) if played else 1.2,
            "possession": None,
            "position": r.get("position"),
            "points": r.get("points"),
        }
    return out


# ── Teams + players for the Teams tab (Denmark/Scotland only) ─────────────────
import time as _time

LEAGUE_NAMES = {"denmark": "Superliga (Denmark)", "scotland": "Premiership (Scotland)"}
_sm_cache: dict = {}


def _c_get(k):
    e = _sm_cache.get(k)
    if e and _time.monotonic() < e[1]:
        return e[0]
    return None


def _c_set(k, v, ttl=6 * 3600):
    _sm_cache[k] = (v, _time.monotonic() + ttl)


async def teams_for_league(slug: str) -> list:
    """Real standings-based teams for a free-plan league, in the frontend shape."""
    lid = LEAGUE_IDS.get(slug)
    if not lid:
        return []
    ck = f"teams_{slug}"
    c = _c_get(ck)
    if c is not None:
        return c
    sid = await current_season_id(lid)
    if not sid:
        return []
    d = await _get(f"/standings/seasons/{sid}", {"include": "participant;details.type;form"})
    teams = []
    for r in d.get("data") or []:
        p = r.get("participant") or {}
        name = p.get("name")
        if not name:
            continue
        det = r.get("details") or []
        played = float(_detail(det, "Overall Matches Played") or 0)
        gs = float(_detail(det, "Overal Goals Scored", "Overall Goals Scored") or 0)
        gc = float(_detail(det, "Overall Goals Conceded") or 0)
        teams.append({
            "id": str(p.get("id")),
            "name": name,
            "short": (p.get("short_code") or name[:3]).upper(),
            "color": "#39FF14",
            "form": [(f.get("form") or "").upper() for f in (r.get("form") or [])][-6:],
            "goalsPerGame": round(gs / played, 2) if played else None,
            "concededPerGame": round(gc / played, 2) if played else None,
            "possession": None, "btts": None, "over25": None,
            "passAccuracy": None, "shotsPerGame": None,
            "position": r.get("position"), "points": r.get("points"),
            "played": int(played),
            "leagueName": LEAGUE_NAMES.get(slug, slug),
            "image": p.get("image_path"),
        })
    _c_set(ck, teams)
    return teams


async def players_for_team(team_id: str) -> list:
    """Real squad roster for a SportMonks team id."""
    ck = f"squad_{team_id}"
    c = _c_get(ck)
    if c is not None:
        return c
    d = await _get(f"/squads/teams/{team_id}", {"include": "player;position"})
    players = []
    for r in d.get("data") or []:
        p = r.get("player") or {}
        pos = (r.get("position") or {}).get("name")
        players.append({
            "id": str(r.get("player_id") or r.get("id")),
            "name": p.get("display_name") or p.get("name") or f"#{r.get('jersey_number')}",
            "number": r.get("jersey_number"),
            "position": pos or "—",
            "age": None, "nationality": None, "appearances": None,
            "minutes": None, "goals": None, "assists": None, "shots": None,
            "passes": None, "tackles": None, "yellow": None, "red": None,
            "rating": None, "injured": False,
            "photo": p.get("image_path"),
        })
    players.sort(key=lambda x: (x["number"] is None, x["number"] or 999))
    _c_set(ck, players)
    return players
