"""Async client for API-Football / API-Basketball (api-sports.io direct).

Free plan: 100 requests/day, seasons 2022-2024 only (no current season). We use
season 2024 (football) / 2023-2024 (basketball) for standings, squads, fixtures.
Aggressive in-process caching (24h) because the historical data never changes,
so a normal browsing session stays well within the daily quota. Live upcoming
odds/matches keep coming from The Odds API separately.
"""
import os
import time as _time
import datetime as _dt
import logging
import httpx
import mockdata

logger = logging.getLogger(__name__)

FOOTBALL_BASE = "https://v3.football.api-sports.io"
BASKETBALL_BASE = "https://v1.basketball.api-sports.io"


def _current_football_season() -> int:
    """European seasons span two years; api-sports keys them by the start year.
    Always computed from the current date (Sept 2026 -> season 2026). We do NOT
    read a season override from the environment anymore: a stale
    API_FOOTBALL_SEASON=2024 left over from the free-plan era was forcing old,
    finished-season standings and breaking live odds (season/date mismatch)."""
    now = _dt.datetime.now(_dt.timezone.utc)
    return now.year if now.month >= 7 else now.year - 1


FOOTBALL_SEASON = _current_football_season()
BASKETBALL_SEASON = "2023-2024"

# ── API-Football request budget (safety cap + daily logging) ──────────────────
# 100/day was the implementation/testing cap. Production serves 11 leagues, so
# the default is higher (still a tiny fraction of the Pro 7500/day limit) and is
# env-overridable. Aggressive caching keeps real usage ~50-70/day.
MAX_CALLS = int(os.environ.get("API_FOOTBALL_MAX_CALLS", "500"))
_usage = {"date": None, "count": 0}


def _bump_usage() -> int:
    today = _dt.date.today().isoformat()
    if _usage["date"] != today:
        _usage["date"], _usage["count"] = today, 0
    if _usage["count"] >= MAX_CALLS:
        raise RuntimeError(f"API-Football daily call budget reached ({MAX_CALLS})")
    _usage["count"] += 1
    return _usage["count"]


def usage() -> dict:
    return {"date": _usage["date"], "count": _usage["count"], "max": MAX_CALLS}

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
    return os.environ.get("API_FOOTBALL_KEY") or os.environ.get("APISPORTS_KEY", "")


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
        raise RuntimeError("API_FOOTBALL_KEY not configured")
    n = _bump_usage()
    logger.info("[api-football] call #%d/%d GET %s%s %s", n, MAX_CALLS, base, path, params)
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


async def player_stats(player_id: str, season: int = None) -> dict:
    """Real per-player statistics for a season (api-football /players).
    Fetched lazily (only when a player is opened) and cached."""
    season = season or FOOTBALL_SEASON
    ck = f"pstats_{player_id}_{season}"
    hit = _c_get(ck)
    if hit is not None:
        return hit or None
    try:
        d = await _get(FOOTBALL_BASE, "/players", {"id": player_id, "season": season})
        resp = d.get("response") or []
        if not resp:
            _c_set(ck, {}, ttl=600)
            return None
        player = resp[0].get("player") or {}
        stats = resp[0].get("statistics") or []
        agg = {k: 0 for k in ("appearances", "minutes", "goals", "assists", "shots",
                              "shotsOn", "passes", "keyPasses", "tackles", "interceptions",
                              "duelsWon", "fouls", "yellow", "red")}
        ratings, team, position, team_apps = [], None, None, -1
        for s in stats:
            g = s.get("games") or {}
            apps = g.get("appearences") or 0
            agg["appearances"] += apps
            agg["minutes"] += g.get("minutes") or 0
            position = position or g.get("position")
            if apps > team_apps and s.get("team"):
                team = (s["team"] or {}).get("name")
                team_apps = apps
            if g.get("rating"):
                try:
                    ratings.append(float(g["rating"]))
                except (TypeError, ValueError):
                    pass
            go = s.get("goals") or {}
            agg["goals"] += go.get("total") or 0
            agg["assists"] += go.get("assists") or 0
            sh = s.get("shots") or {}
            agg["shots"] += sh.get("total") or 0
            agg["shotsOn"] += sh.get("on") or 0
            ps = s.get("passes") or {}
            agg["passes"] += ps.get("total") or 0
            agg["keyPasses"] += ps.get("key") or 0
            tk = s.get("tackles") or {}
            agg["tackles"] += tk.get("total") or 0
            agg["interceptions"] += tk.get("interceptions") or 0
            du = s.get("duels") or {}
            agg["duelsWon"] += du.get("won") or 0
            fo = s.get("fouls") or {}
            agg["fouls"] += fo.get("committed") or 0
            cd = s.get("cards") or {}
            agg["yellow"] += cd.get("yellow") or 0
            agg["red"] += cd.get("red") or 0
        out = {
            "id": str(player.get("id")),
            "name": player.get("name"),
            "photo": player.get("photo"),
            "age": player.get("age"),
            "nationality": player.get("nationality"),
            "position": position,
            "team": team,
            "season": season,
            "rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
            "stats": agg,
        }
        _c_set(ck, out)
        return out
    except Exception as e:
        logger.warning("apifootball.player_stats(%s): %s", player_id, e)
        return None


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



def _mw_entries(bookmakers: list) -> list:
    """API-Football odds -> value schema [{bookmaker, odds:{home,draw,away}}]."""
    entries = []
    for bk in bookmakers or []:
        mw = next((b for b in (bk.get("bets") or []) if b.get("name") == "Match Winner"), None)
        if not mw:
            continue
        o = {"home": 0.0, "draw": 0.0, "away": 0.0}
        for v in mw.get("values") or []:
            val = (v.get("value") or "").lower()
            try:
                price = float(v.get("odd") or 0)
            except (TypeError, ValueError):
                price = 0.0
            if val in o and 1.0 < price <= 51.0:
                o[val] = price
        if o["home"] or o["draw"] or o["away"]:
            entries.append({"bookmaker": bk.get("name"), "odds": o})
    return entries


async def upcoming_fixtures_raw(slug: str, n: int = 8) -> list:
    """Nearest N upcoming fixtures for a football league (1 batch call, cached).
    NOTE: the `next` param must NOT be combined with `season` (API-Football
    returns empty if both are sent)."""
    c = CATALOG.get(slug)
    if not c or c["sport"] != "football":
        return []
    ck = f"upfix_{slug}_{n}"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    out = []
    try:
        d = await _get(FOOTBALL_BASE, "/fixtures",
                       {"league": c["league_id"], "next": n})
        for f in d.get("response") or []:
            fx = f["fixture"]
            out.append({
                "id": str(fx["id"]),
                "home": f["teams"]["home"]["name"],
                "away": f["teams"]["away"]["name"],
                "kickoff": fx.get("date"),
            })
    except Exception as e:
        logger.warning("apifootball.upcoming_fixtures_raw(%s): %s", slug, e)
    _c_set(ck, out, ttl=12 * 3600 if out else 300)
    return out


async def odds_for_dates(slug: str, dates: list) -> dict:
    """fixture_id -> [odds entries] for a league on the given match dates
    (1 call per date, cached 12h). Aligns odds to upcoming fixtures by date."""
    c = CATALOG.get(slug)
    if not c or c["sport"] != "football":
        return {}
    out = {}
    for d in (dates or [])[:2]:
        # Derive the season from the fixture DATE, not the global season, so
        # odds always align with the fixture even if API_FOOTBALL_SEASON is set
        # to a stale value in the environment.
        try:
            yr, mo = int(d[:4]), int(d[5:7])
            season = yr if mo >= 7 else yr - 1
        except (ValueError, IndexError):
            season = FOOTBALL_SEASON
        ck = f"afodds_{slug}_{d}"
        hit = _c_get(ck)
        if hit is None:
            hit = {}
            try:
                page, total = 1, 1
                while page <= total and page <= 2:
                    r = await _get(FOOTBALL_BASE, "/odds",
                                   {"league": c["league_id"], "season": season,
                                    "date": d, "page": page})
                    for e in r.get("response") or []:
                        fid = str((e.get("fixture") or {}).get("id"))
                        ent = _mw_entries(e.get("bookmakers"))
                        if fid and ent:
                            hit[fid] = ent
                    total = (r.get("paging") or {}).get("total") or 1
                    page += 1
                _c_set(ck, hit, ttl=24 * 3600 if hit else 600)
            except Exception as e:
                logger.warning("apifootball.odds_for_dates(%s,%s): %s", slug, d, e)
                _c_set(ck, {}, ttl=300)
                hit = {}
        out.update(hit)
    return out


async def odds_by_fixture(slug: str) -> dict:
    """fixture_id -> [odds entries] for a league's near-term fixtures (1 batch
    call, page 1 ~10 fixtures, cached 12h). Used only to fill matches that The
    Odds API doesn't cover, so no fixture ever shows empty odds."""
    c = CATALOG.get(slug)
    if not c or c["sport"] != "football":
        return {}
    ck = f"afodds_{slug}"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    out = {}
    try:
        d = await _get(FOOTBALL_BASE, "/odds",
                       {"league": c["league_id"], "season": FOOTBALL_SEASON, "page": 1})
        for e in d.get("response") or []:
            fid = str((e.get("fixture") or {}).get("id"))
            ent = _mw_entries(e.get("bookmakers"))
            if fid and ent:
                out[fid] = ent
    except Exception as e:
        logger.warning("apifootball.odds_by_fixture(%s): %s", slug, e)
    _c_set(ck, out, ttl=12 * 3600)
    return out



async def fixtures_by_ids(ids: list) -> dict:
    """fixture_id -> {home, away, kickoff, finished} for up to 20 ids (1 call)."""
    ids = [str(i) for i in (ids or []) if i][:20]
    if not ids:
        return {}
    ck = "fxids_" + "_".join(sorted(ids))
    hit = _c_get(ck)
    if hit is not None:
        return hit
    out = {}
    try:
        d = await _get(FOOTBALL_BASE, "/fixtures", {"ids": "-".join(ids)})
        for f in d.get("response") or []:
            fx = f["fixture"]
            status = (fx.get("status") or {}).get("short")
            out[str(fx["id"])] = {
                "home": f["teams"]["home"]["name"],
                "away": f["teams"]["away"]["name"],
                "kickoff": fx.get("date"),
                "finished": status in ("FT", "AET", "PEN"),
            }
    except Exception as e:
        logger.warning("apifootball.fixtures_by_ids: %s", e)
    _c_set(ck, out, ttl=6 * 3600)
    return out