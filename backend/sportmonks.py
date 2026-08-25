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
