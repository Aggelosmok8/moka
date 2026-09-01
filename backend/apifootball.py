"""Async client for API-Football / API-Basketball (api-sports.io direct).

Free plan: 100 requests/day, seasons 2022-2024 only (no current season). We use
season 2024 (football) / 2023-2024 (basketball) for standings, squads, fixtures.
Aggressive in-process caching (24h) because the historical data never changes,
so a normal browsing session stays well within the daily quota. Live upcoming
odds/matches keep coming from The Odds API separately.
"""
import os
import time as _time
import logging
import httpx
import mockdata

logger = logging.getLogger(__name__)

FOOTBALL_BASE = "https://v3.football.api-sports.io"
BASKETBALL_BASE = "https://v1.basketball.api-sports.io"
FOOTBALL_SEASON = 2024
BASKETBALL_SEASON = "2023-2024"

# slug -> catalog entry. Verified league ids against api-sports.io.
CATALOG = {
    # Football
    "epl":          {"name": "Premier League (England)", "sport": "football", "league_id": 39},
    "laliga":       {"name": "La Liga (Spain)",          "sport": "football", "league_id": 140},
    "seriea":       {"name": "Serie A (Italy)",          "sport": "football", "league_id": 135},
    "bundesliga":   {"name": "Bundesliga (Germany)",     "sport": "football", "league_id": 78},
    "ligue1":       {"name": "Ligue 1 (France)",         "sport": "football", "league_id": 61},
    "eredivisie":   {"name": "Eredivisie (Netherlands)", "sport": "football", "league_id": 88},
    "primeira":     {"name": "Primeira Liga (Portugal)", "sport": "football", "league_id": 94},
    "championship": {"name": "Championship (England)",   "sport": "football", "league_id": 40},
    "superleague":  {"name": "Super League 1 (Greece)",  "sport": "football", "league_id": 197},
    "denmark":      {"name": "Superliga (Denmark)",      "sport": "football", "league_id": 119},
    "scotland":     {"name": "Premiership (Scotland)",   "sport": "football", "league_id": 179},
    # Basketball
    "nba":          {"name": "NBA (USA)",                "sport": "basketball", "league_id": 12},
    "euroleague":   {"name": "EuroLeague",               "sport": "basketball", "league_id": 120},
}


def _key() -> str:
    return os.environ.get("APISPORTS_KEY", "")


def leagues_list() -> list:
    return [{"id": slug, "name": c["name"], "sport": c["sport"]} for slug, c in CATALOG.items()]


_cache: dict = {}


def _c_get(k):
    e = _cache.get(k)
    if e and _time.monotonic() < e[1]:
        return e[0]
    return None


def _c_set(k, v, ttl=24 * 3600):
    _cache[k] = (v, _time.monotonic() + ttl)


async def _get(base: str, path: str, params: dict) -> dict:
    key = _key()
    if not key:
        raise RuntimeError("APISPORTS_KEY not configured")
    async with httpx.AsyncClient(timeout=25, headers={"x-apisports-key": key}) as c:
        r = await c.get(f"{base}{path}", params=params)
    r.raise_for_status()
    return r.json()


def _form_list(form_str):
    return list(form_str) if form_str else []


async def teams_for_league(slug: str) -> list:
    c = CATALOG.get(slug)
    if not c:
        return []
    ck = f"teams_{slug}"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    try:
        if c["sport"] == "football":
            d = await _get(FOOTBALL_BASE, "/standings",
                           {"league": c["league_id"], "season": FOOTBALL_SEASON})
            resp = d.get("response") or []
            table = resp[0]["league"]["standings"][0] if resp else []
            teams = []
            for t in table:
                played = (t.get("all") or {}).get("played") or 0
                gf = ((t.get("all") or {}).get("goals") or {}).get("for") or 0
                ga = ((t.get("all") or {}).get("goals") or {}).get("against") or 0
                teams.append({
                    "id": str(t["team"]["id"]),
                    "name": t["team"]["name"],
                    "image": t["team"].get("logo"),
                    "position": t.get("rank"),
                    "points": t.get("points"),
                    "played": played,
                    "form": _form_list(t.get("form")),
                    "goalsPerGame": round(gf / played, 2) if played else None,
                    "concededPerGame": round(ga / played, 2) if played else None,
                    "leagueName": c["name"],
                    "sport": "football",
                })
        else:
            d = await _get(BASKETBALL_BASE, "/standings",
                           {"league": c["league_id"], "season": BASKETBALL_SEASON})
            resp = d.get("response") or []
            rows = resp[0] if resp and isinstance(resp[0], list) else resp
            teams = []
            seen = set()
            for t in rows:
                tid = str(t["team"]["id"])
                if tid in seen:
                    continue
                seen.add(tid)
                games = t.get("games") or {}
                win = (games.get("win") or {}).get("total") or 0
                lose = (games.get("lose") or {}).get("total") or 0
                teams.append({
                    "id": str(t["team"]["id"]),
                    "name": t["team"]["name"],
                    "image": t["team"].get("logo"),
                    "position": t.get("position"),
                    "points": win,
                    "played": (win + lose),
                    "wins": win,
                    "losses": lose,
                    "winPct": (games.get("win") or {}).get("percentage"),
                    "form": [],
                    "goalsPerGame": None,
                    "concededPerGame": None,
                    "leagueName": c["name"],
                    "sport": "basketball",
                })
            teams.sort(key=lambda x: x["wins"], reverse=True)
            for i, t in enumerate(teams):
                t["position"] = i + 1
        if not teams:
            teams = mockdata.standings(slug)
            _c_set(ck, teams, ttl=300)
            return teams
        _c_set(ck, teams)
        return teams
    except Exception as e:
        logger.warning("apifootball.teams_for_league(%s): %s", slug, e)
        m = mockdata.standings(slug)
        _c_set(ck, m, ttl=300)
        return m


async def players_for_team(team_id: str) -> list:
    """Football squad (api-football). Basketball squads not on free plan."""
    if team_id.startswith("m_"):
        return mockdata.players_for_mock_team(team_id)
    ck = f"squad_{team_id}"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    try:
        d = await _get(FOOTBALL_BASE, "/players/squads", {"team": team_id})
        resp = d.get("response") or []
        players = []
        if resp:
            for p in resp[0].get("players") or []:
                players.append({
                    "id": str(p.get("id")),
                    "name": p.get("name"),
                    "number": p.get("number"),
                    "position": p.get("position"),
                    "photo": p.get("photo"),
                    "age": p.get("age"),
                })
        if not players:
            players = mockdata.players_for_mock_team(team_id)
            _c_set(ck, players, ttl=300)
            return players
        _c_set(ck, players)
        return players
    except Exception as e:
        logger.warning("apifootball.players_for_team(%s): %s", team_id, e)
        return mockdata.players_for_mock_team(team_id)


def _fx_shape(f: dict) -> dict:
    fx = f["fixture"]
    status = (fx.get("status") or {}).get("short")
    return {
        "id": str(fx["id"]),
        "home": f["teams"]["home"]["name"],
        "away": f["teams"]["away"]["name"],
        "homeImg": f["teams"]["home"].get("logo"),
        "awayImg": f["teams"]["away"].get("logo"),
        "kickoff": fx.get("date"),
        "homeScore": (f.get("goals") or {}).get("home"),
        "awayScore": (f.get("goals") or {}).get("away"),
        "finished": status in ("FT", "AET", "PEN"),
    }


async def fixtures_for_league(slug: str) -> dict:
    c = CATALOG.get(slug)
    if not c or c["sport"] != "football":
        return {"upcoming": [], "results": []}
    ck = f"fixtures_{slug}"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    try:
        d = await _get(FOOTBALL_BASE, "/fixtures",
                       {"league": c["league_id"], "season": FOOTBALL_SEASON})
        rows = [_fx_shape(f) for f in (d.get("response") or [])]
        results = [x for x in rows if x["finished"] and x["homeScore"] is not None]
        upcoming = [x for x in rows if not x["finished"]]
        results.sort(key=lambda x: x["kickoff"] or "", reverse=True)
        upcoming.sort(key=lambda x: x["kickoff"] or "")
        out = {"upcoming": upcoming[:20], "results": results[:20]}
        if not out["upcoming"] and not out["results"]:
            out = mockdata.fixtures(slug)
            _c_set(ck, out, ttl=300)
            return out
        _c_set(ck, out)
        return out
    except Exception as e:
        logger.warning("apifootball.fixtures_for_league(%s): %s", slug, e)
        return mockdata.fixtures(slug)
