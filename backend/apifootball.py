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
    "ucl":          {"name": "UEFA Champions League",    "sport": "football", "league_id": 2},
    "uel":          {"name": "UEFA Europa League",       "sport": "football", "league_id": 3},
    "uecl":         {"name": "UEFA Conference League",   "sport": "football", "league_id": 848},
    "facup":        {"name": "FA Cup (England)",         "sport": "football", "league_id": 45},
    "eflcup":       {"name": "EFL Cup (England)",        "sport": "football", "league_id": 48},
    "copadelrey":   {"name": "Copa del Rey (Spain)",     "sport": "football", "league_id": 143},
    "coppaitalia":  {"name": "Coppa Italia (Italy)",     "sport": "football", "league_id": 137},
    "dfbpokal":     {"name": "DFB Pokal (Germany)",      "sport": "football", "league_id": 81},
    "coupedefrance":{"name": "Coupe de France",          "sport": "football", "league_id": 66},
    "greekcup":     {"name": "Greek Cup",                "sport": "football", "league_id": 199},
    "portugalcup":  {"name": "Taça de Portugal",         "sport": "football", "league_id": 96},
    "knvbbeker":    {"name": "KNVB Beker (Netherlands)", "sport": "football", "league_id": 90},
    "scottishcup":  {"name": "Scottish Cup",             "sport": "football", "league_id": 181},
    "danishcup":    {"name": "DBU Pokalen (Denmark)",    "sport": "football", "league_id": 121},
    # National teams ("Nations Tournaments"). `season` is the tournament year —
    # it differs from the club season, and `national` switches off club-only
    # logic (player markets, home advantage on neutral ground).
    "worldcup":     {"name": "World Cup", "sport": "football", "league_id": 1, "season": 2026, "national": True, "neutral": True},
    "nationsleague": {"name": "UEFA Nations League", "sport": "football", "league_id": 5, "season": 2026, "national": True},
    "euro":         {"name": "Euro Championship", "sport": "football", "league_id": 4, "season": 2024, "national": True, "neutral": True},
    "euroqual":     {"name": "Euro Qualification", "sport": "football", "league_id": 960, "season": 2027, "national": True},
    "wcq_europe":   {"name": "World Cup Qual. — Europe", "sport": "football", "league_id": 32, "season": 2024, "national": True},
    "wcq_sa":       {"name": "World Cup Qual. — South America", "sport": "football", "league_id": 34, "season": 2026, "national": True},
    "wcq_asia":     {"name": "World Cup Qual. — Asia", "sport": "football", "league_id": 30, "season": 2026, "national": True},
    "wcq_africa":   {"name": "World Cup Qual. — Africa", "sport": "football", "league_id": 29, "season": 2023, "national": True},
    "wcq_concacaf": {"name": "World Cup Qual. — CONCACAF", "sport": "football", "league_id": 31, "season": 2026, "national": True},
    "wcq_oceania":  {"name": "World Cup Qual. — Oceania", "sport": "football", "league_id": 33, "season": 2026, "national": True},
    "wcq_playoffs": {"name": "World Cup Qual. — Play-offs", "sport": "football", "league_id": 37, "season": 2026, "national": True, "neutral": True},
    "copaamerica":  {"name": "Copa América", "sport": "football", "league_id": 9, "season": 2024, "national": True, "neutral": True},
    "afcon":        {"name": "Africa Cup of Nations", "sport": "football", "league_id": 6, "season": 2025, "national": True, "neutral": True},
    "afcon_qual":   {"name": "Africa Cup of Nations Qual.", "sport": "football", "league_id": 36, "season": 2027, "national": True},
    "asiancup":     {"name": "AFC Asian Cup", "sport": "football", "league_id": 7, "season": 2027, "national": True, "neutral": True},
    "goldcup":      {"name": "CONCACAF Gold Cup", "sport": "football", "league_id": 22, "season": 2025, "national": True, "neutral": True},
    "concacafnl":   {"name": "CONCACAF Nations League", "sport": "football", "league_id": 536, "season": 2025, "national": True},
    # Basketball
    "nba":          {"name": "NBA (USA)",                "sport": "basketball", "league_id": 12},
    "euroleague":   {"name": "EuroLeague",               "sport": "basketball", "league_id": 120},
}

SUPPORTED_FOOTBALL_LEAGUE_IDS = {
    c["league_id"] for c in CATALOG.values() if c["sport"] == "football"
}

# National-team competitions: no club player markets, flatter home advantage.
NATION_LEAGUE_IDS = {c["league_id"] for c in CATALOG.values() if c.get("national")}
NEUTRAL_LEAGUE_IDS = {c["league_id"] for c in CATALOG.values() if c.get("neutral")}


def season_for(slug: str) -> int:
    """Tournament year for national competitions, club season otherwise."""
    c = CATALOG.get(slug) or {}
    return c.get("season") or (BASKETBALL_SEASON if c.get("sport") == "basketball" else FOOTBALL_SEASON)


def _key() -> str:
    return os.environ.get("API_FOOTBALL_KEY") or os.environ.get("APISPORTS_KEY", "")


def league_logo(slug: str) -> str:
    """Static api-sports CDN badge (no API call, no quota)."""
    c = CATALOG.get(slug) or {}
    lid = c.get("league_id")
    sport = "basketball" if c.get("sport") == "basketball" else "football"
    return f"https://media.api-sports.io/{sport}/leagues/{lid}.png" if lid else ""


def leagues_list() -> list:
    return [{"id": slug, "name": c["name"], "sport": c["sport"], "logo": league_logo(slug)}
            for slug, c in CATALOG.items()]


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


async def recent_fixtures_for_team(team_id: str, last: int = 6) -> list:
    """Last finished matches of a club across ALL competitions."""
    if not str(team_id).isdigit():
        return []
    ck = f"recent_team_{team_id}_{last}"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    try:
        d = await _get(FOOTBALL_BASE, "/fixtures", {"team": team_id, "last": last})
        out = []
        for f in d.get("response") or []:
            fx, tm, gl = f.get("fixture") or {}, f.get("teams") or {}, f.get("goals") or {}
            out.append({
                "kickoff": fx.get("date"),
                "home": (tm.get("home") or {}).get("name"),
                "away": (tm.get("away") or {}).get("name"),
                "homeImg": (tm.get("home") or {}).get("logo"),
                "awayImg": (tm.get("away") or {}).get("logo"),
                "homeScore": gl.get("home"),
                "awayScore": gl.get("away"),
                "league": (f.get("league") or {}).get("name"),
                "finished": True,
            })
        _c_set(ck, out, ttl=6 * 3600)
        return out
    except Exception as e:
        logger.warning("apifootball.recent_fixtures_for_team(%s): %s", team_id, e)
        return []


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
                           {"league": c["league_id"], "season": season_for(slug)})
            resp = d.get("response") or []
            # Every group, not just the first: qualifying rounds and group-stage
            # tournaments have one table per group.
            table = []
            for grp in (resp[0]["league"]["standings"] if resp else []):
                table.extend(grp or [])
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
                    "goalDiff": gf - ga,
                    "winPct": round(((t.get("all") or {}).get("win") or 0) / played * 100) if played else None,
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


async def nations_strength_index() -> dict:
    """name -> {gf, ga} per game for every national team we track, plus the
    averages. Built from the standings tables already cached by the normal
    build cycle, so it normally costs ZERO extra calls."""
    ck = "nations_strength"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    idx = {}
    for slug, c in CATALOG.items():
        if not c.get("national"):
            continue
        try:
            for t in await teams_for_league(slug) or []:
                if (t.get("played") or 0) >= 2 and t.get("goalsPerGame") is not None:
                    idx[(t.get("name") or "").strip().lower()] = {
                        "gf": t["goalsPerGame"], "ga": t.get("concededPerGame") or 1.2}
        except Exception as e:
            logger.warning("nations_strength(%s): %s", slug, e)
    out = {"teams": idx,
           "avg_gf": round(sum(v["gf"] for v in idx.values()) / len(idx), 2) if idx else 1.3,
           "avg_ga": round(sum(v["ga"] for v in idx.values()) / len(idx), 2) if idx else 1.3}
    _c_set(ck, out, ttl=12 * 3600)
    return out


async def nation_form(team_id, name: str, last: int = 12):
    """Opponent- and recency-weighted scoring record of a national team over its
    last N matches across seasons and competitions.

    A goal against Andorra is not a goal against France: each match is weighted
    by how leaky/potent the opponent actually is, by recency, and friendlies
    count half. No extra API call beyond the cached fixtures list.
    """
    recent = await recent_fixtures_for_team(team_id, last)
    if not recent:
        return None
    si = await nations_strength_index()
    teams, avg_gf, avg_ga = si["teams"], si["avg_gf"], si["avg_ga"]
    me = (name or "").strip().lower()
    gf = ga = wsum = 0.0
    n = 0
    form = []
    for k, m in enumerate(recent):
        h, a = m.get("homeScore"), m.get("awayScore")
        if h is None or a is None:
            continue
        at_home = (m.get("home") or "").strip().lower() == me
        mine, theirs = (h, a) if at_home else (a, h)
        opp = ((m.get("away") if at_home else m.get("home")) or "").strip().lower()
        o = teams.get(opp) or {}
        # Scoring is discounted against a leaky defence, conceding against a
        # weak attack; clamped so one freak opponent cannot dominate.
        s_att = min(1.6, max(0.6, avg_ga / max(0.4, o.get("ga", avg_ga))))
        s_def = min(1.6, max(0.6, avg_gf / max(0.4, o.get("gf", avg_gf))))
        w = (0.92 ** k) * (0.5 if "friendl" in (m.get("league") or "").lower() else 1.0)
        gf += mine * s_att * w
        ga += theirs * s_def * w
        wsum += w
        n += 1
        form.append("W" if mine > theirs else ("D" if mine == theirs else "L"))
    if n < 4 or wsum <= 0:
        return None
    return {"played": n, "gf": round(gf / wsum, 2), "ga": round(ga / wsum, 2),
            "form": form[:5], "winPct": round(form.count("W") / n * 100)}


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
        # Attach lazy+cached injury/suspension status (best-effort).
        try:
            inj = await injuries_for_team(team_id)
            for p in players:
                st = inj.get(str(p["id"]))
                if st:
                    p["status"] = st["status"]
                    p["statusReason"] = st["reason"]
        except Exception as e:
            logger.warning("apifootball injuries attach %s: %s", team_id, e)
        _c_set(ck, players)
        return players
    except Exception as e:
        logger.warning("apifootball.players_for_team(%s): %s", team_id, e)
        return mockdata.players_for_mock_team(team_id)


def _injury_status(reason: str, itype: str) -> str:
    r = (reason or "").lower()
    if "red" in r or "suspend" in r:
        return "suspended"
    if "yellow" in r:
        return "yellow"
    if any(w in r for w in ("injur", "knock", "strain", "muscle", "surgery", "fitness", "ill", "broken", "tear", "sprain")):
        return "injured"
    if (itype or "").lower() == "questionable":
        return "doubtful"
    return "injured"


async def injuries_for_team(team_id: str, season: int = None) -> dict:
    """Player-id -> {status, reason} for a team's current injuries/suspensions.
    Lazy + cached (12h); returns {} on any failure. No mock invented data."""
    if not team_id or team_id.startswith("m_"):
        return {}
    season = season or FOOTBALL_SEASON
    ck = f"inj_{team_id}_{season}"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    out: dict = {}
    try:
        d = await _get(FOOTBALL_BASE, "/injuries", {"team": team_id, "season": season})
        for item in d.get("response") or []:
            p = item.get("player") or {}
            pid = p.get("id")
            if pid is None:
                continue
            reason = p.get("reason")
            itype = p.get("type")
            out[str(pid)] = {"status": _injury_status(reason, itype),
                             "reason": reason or itype or "Unavailable"}
    except Exception as e:
        logger.warning("apifootball.injuries_for_team(%s): %s", team_id, e)
    _c_set(ck, out, ttl=12 * 3600)
    return out


def _outcome(hs, a):
    if hs is None or a is None:
        return None
    if hs > a:
        return "home"
    if hs < a:
        return "away"
    return "draw"


_FINISHED = {"FT", "AET", "PEN"}


async def fixture_results(ids: list) -> dict:
    """Map 'live_af_<fid>' ids -> {finished, home, away, outcome, status}.

    Batched (up to 20 fixtures per call) and cached. Finished results are cached
    for 7 days (they never change); pending ones for 2 minutes."""
    out: dict = {}
    fid_map: dict = {}
    to_fetch: list = []
    for mid in ids:
        s = str(mid)
        if not s.startswith("live_af_"):
            continue
        fid = s.split("live_af_")[-1]
        if not fid.isdigit():
            continue
        hit = _c_get(f"result_{fid}")
        if hit is not None:
            out[mid] = hit
        else:
            fid_map[fid] = mid
            to_fetch.append(fid)
    for i in range(0, len(to_fetch), 20):
        chunk = to_fetch[i:i + 20]
        try:
            d = await _get(FOOTBALL_BASE, "/fixtures", {"ids": "-".join(chunk)})
            for item in d.get("response") or []:
                fx = item.get("fixture") or {}
                fid = str(fx.get("id"))
                status = ((fx.get("status") or {}).get("short")) or ""
                goals = item.get("goals") or {}
                ht = ((item.get("score") or {}).get("halftime")) or {}
                hs, a = goals.get("home"), goals.get("away")
                finished = status in _FINISHED
                res = {"finished": finished, "home": hs, "away": a,
                       "ht_home": ht.get("home"), "ht_away": ht.get("away"),
                       "outcome": _outcome(hs, a) if finished else None, "status": status}
                mid = fid_map.get(fid)
                if mid:
                    out[mid] = res
                    _c_set(f"result_{fid}", res, ttl=(7 * 24 * 3600 if finished else 120))
        except Exception as e:
            logger.warning("apifootball.fixture_results: %s", e)
    return out


async def fixture_settlement_detail(fixture_id) -> dict:
    """Everything needed to settle a specific bet on a FINISHED fixture.

    Team stat totals, the running goal sequence (for "score at any time") and
    per-player numbers. Three calls, cached 7 days, and only ever fetched for a
    fixture the user actually has a pending specific bet on.
    """
    fid = str(fixture_id)
    ck = f"settle_detail_{fid}"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    out = {"totals": {}, "goal_seq": [], "players": {}}
    try:
        d = await _get(FOOTBALL_BASE, "/fixtures/statistics", {"fixture": fid})
        resp = d.get("response") or []

        def _m(block):
            return {s.get("type"): s.get("value")
                    for s in (block or {}).get("statistics") or [] if s.get("value") is not None}

        if len(resp) >= 2:
            h, a = _m(resp[0]), _m(resp[1])

            def num(m, key):
                try:
                    return float(str(m.get(key, 0) or 0).replace("%", ""))
                except (TypeError, ValueError):
                    return 0.0

            out["totals"] = {
                "corners": num(h, "Corner Kicks") + num(a, "Corner Kicks"),
                "corners_home": num(h, "Corner Kicks"), "corners_away": num(a, "Corner Kicks"),
                "cards": sum(num(m, k) for m in (h, a) for k in ("Yellow Cards", "Red Cards")),
                "fouls": num(h, "Fouls") + num(a, "Fouls"),
                "fouls_home": num(h, "Fouls"), "fouls_away": num(a, "Fouls"),
                "offsides": num(h, "Offsides") + num(a, "Offsides"),
                "saves_home": num(h, "Goalkeeper Saves"), "saves_away": num(a, "Goalkeeper Saves"),
            }
    except Exception as e:
        logger.warning("settlement stats(%s): %s", fid, e)
    try:
        d = await _get(FOOTBALL_BASE, "/fixtures/events", {"fixture": fid})
        evs = [e for e in (d.get("response") or []) if (e.get("type") or "") == "Goal"]
        evs.sort(key=lambda e: ((e.get("time") or {}).get("elapsed") or 0,
                                (e.get("time") or {}).get("extra") or 0))
        home_id = None
        seq, h, a = [], 0, 0
        for e in evs:
            tid = ((e.get("team") or {}).get("id"))
            if home_id is None:
                home_id = tid
            own = (e.get("detail") or "") == "Own Goal"
            scored_home = (tid == home_id) != own
            if scored_home:
                h += 1
            else:
                a += 1
            seq.append([h, a])
        out["goal_seq"] = seq
    except Exception as e:
        logger.warning("settlement events(%s): %s", fid, e)
    try:
        d = await _get(FOOTBALL_BASE, "/fixtures/players", {"fixture": fid})
        for team in d.get("response") or []:
            for p in team.get("players") or []:
                pid = str(((p.get("player") or {}).get("id")) or "")
                st = (p.get("statistics") or [{}])[0] or {}
                if not pid:
                    continue
                out["players"][pid] = {
                    "goals": ((st.get("goals") or {}).get("total")) or 0,
                    "assists": ((st.get("goals") or {}).get("assists")) or 0,
                    "shots": ((st.get("shots") or {}).get("total")) or 0,
                    "sot": ((st.get("shots") or {}).get("on")) or 0,
                    "cards": (((st.get("cards") or {}).get("yellow")) or 0)
                             + (((st.get("cards") or {}).get("red")) or 0),
                }
    except Exception as e:
        logger.warning("settlement players(%s): %s", fid, e)
    _c_set(ck, out, ttl=7 * 24 * 3600)
    return out


async def live_fixtures() -> list:
    """ALL in-play fixtures across every league in ONE call (/fixtures?live=all).
    Cached 150s — a single request powers the whole live ticker + live scores.
    Longer TTL keeps daily API-Football usage well under the plan quota."""
    ck = "live_all"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    out: list = []
    ok = False
    try:
        d = await _get(FOOTBALL_BASE, "/fixtures", {"live": "all"})
        for item in d.get("response") or []:
            fx = item.get("fixture") or {}
            lg = item.get("league") or {}
            tm = item.get("teams") or {}
            g = item.get("goals") or {}
            st = fx.get("status") or {}
            out.append({
                "id": f"live_af_{fx.get('id')}",
                "league": lg.get("name"),
                "leagueId": lg.get("id"),
                "home": (tm.get("home") or {}).get("name"),
                "away": (tm.get("away") or {}).get("name"),
                "homeId": (tm.get("home") or {}).get("id"),
                "awayId": (tm.get("away") or {}).get("id"),
                "homeLogo": (tm.get("home") or {}).get("logo"),
                "awayLogo": (tm.get("away") or {}).get("logo"),
                "homeScore": g.get("home"),
                "awayScore": g.get("away"),
                "minute": st.get("elapsed"),
                "status": st.get("short"),
                "supported": lg.get("id") in SUPPORTED_FOOTBALL_LEAGUE_IDS,
            })
        ok = True
    except Exception as e:
        logger.warning("apifootball.live_fixtures: %s", e)
    if ok:
        # Real result (even an empty one = genuinely no live games). Cache it and
        # keep a long-lived snapshot as a fallback for future failures.
        _c_set(ck, out, ttl=150)
        if out:
            _c_set("live_all_last", out, ttl=6 * 3600)
        return out
    # API failed (timeout / rate-limit / daily quota reached): DON'T cache empty
    # and wipe the live list. Serve the last known-good snapshot and retry soon.
    stale = _c_get("live_all_last")
    if stale is not None:
        _c_set(ck, stale, ttl=30)
        return stale
    return out


async def live_fixture_stats(fixture_id) -> dict:
    """In-play team statistics for ONE fixture (cached 60s). Only fetched when a
    user opens a live match — the live list itself never triggers this."""
    if not fixture_id:
        return None
    ck = f"livestat_{fixture_id}"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    out = None
    try:
        d = await _get(FOOTBALL_BASE, "/fixtures/statistics", {"fixture": fixture_id})
        resp = d.get("response") or []

        def _pick(block):
            m = {}
            for s in (block or {}).get("statistics") or []:
                if s.get("value") is not None:
                    m[s.get("type")] = s.get("value")
            return m

        if len(resp) >= 2:
            out = {"home": _pick(resp[0]), "away": _pick(resp[1])}
    except Exception as e:
        logger.warning("apifootball.live_fixture_stats(%s): %s", fixture_id, e)
    _c_set(ck, out, ttl=60)
    return out


async def head_to_head(hid, aid, last: int = 6) -> dict:
    """Recent head-to-head record between two teams (home-team perspective)."""
    if not hid or not aid:
        return None
    ck = f"h2h_{hid}_{aid}"
    hit = _c_get(ck)
    if hit is not None:
        return hit
    out = {"home_wins": 0, "away_wins": 0, "draws": 0, "count": 0}
    try:
        d = await _get(FOOTBALL_BASE, "/fixtures/headtohead", {"h2h": f"{hid}-{aid}", "last": last})
        for item in d.get("response") or []:
            g = item.get("goals") or {}
            hs, a = g.get("home"), g.get("away")
            if hs is None or a is None:
                continue
            tm = item.get("teams") or {}
            fx_home_is_our_home = str((tm.get("home") or {}).get("id")) == str(hid)
            out["count"] += 1
            if hs == a:
                out["draws"] += 1
            else:
                fixture_home_won = hs > a
                our_home_won = fixture_home_won == fx_home_is_our_home
                out["home_wins" if our_home_won else "away_wins"] += 1
    except Exception as e:
        logger.warning("apifootball.head_to_head(%s,%s): %s", hid, aid, e)
    _c_set(ck, out, ttl=24 * 3600)
    return out


async def team_statistics(team_id, league_id, season: int = None) -> dict:
    """Home/away goal splits + clean sheets from /teams/statistics (cached 24h)."""
    if not team_id or not league_id:
        return None
    season = season or FOOTBALL_SEASON
    ck = f"tstat_{team_id}_{league_id}_{season}"
    hit = _c_get(ck)
    if hit is not None:
        return hit

    def _f(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    out = None
    try:
        d = await _get(FOOTBALL_BASE, "/teams/statistics",
                       {"team": team_id, "league": league_id, "season": season})
        r = d.get("response") or {}
        goals = r.get("goals") or {}
        gf = ((goals.get("for") or {}).get("average") or {})
        ga = ((goals.get("against") or {}).get("average") or {})
        cs = r.get("clean_sheet") or {}
        out = {
            "gf_home": _f(gf.get("home")), "gf_away": _f(gf.get("away")), "gf_total": _f(gf.get("total")),
            "ga_home": _f(ga.get("home")), "ga_away": _f(ga.get("away")), "ga_total": _f(ga.get("total")),
            "clean_sheets": cs.get("total"),
        }
    except Exception as e:
        logger.warning("apifootball.team_statistics(%s): %s", team_id, e)
    _c_set(ck, out, ttl=24 * 3600)
    return out


async def player_stats(player_id: str, season: int = None, team_id: str = None) -> dict:
    """Real per-player statistics for a season (api-football /players).
    If team_id is given, only that CLUB's stats are counted (national-team
    appearances are excluded) and `played` reflects club minutes.
    Fetched lazily (only when a player is opened) and cached."""
    season = season or FOOTBALL_SEASON
    ck = f"pstats_{player_id}_{season}_{team_id or 'all'}"
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
        club_name = None
        if team_id:
            try:
                tid = int(team_id)
            except (TypeError, ValueError):
                tid = None
            if tid is not None:
                for s in stats:
                    if ((s.get("team") or {}).get("id")) == tid:
                        club_name = (s.get("team") or {}).get("name")
                stats = [s for s in stats if ((s.get("team") or {}).get("id")) == tid]
        agg = {k: 0 for k in ("appearances", "minutes", "goals", "assists", "shots",
                              "shotsOn", "passes", "keyPasses", "tackles", "interceptions",
                              "duelsWon", "duelsTotal", "fouls", "yellow", "red",
                              "saves", "conceded")}
        acc_sum = 0
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
            agg["saves"] += go.get("saves") or 0
            agg["conceded"] += go.get("conceded") or 0
            sh = s.get("shots") or {}
            agg["shots"] += sh.get("total") or 0
            agg["shotsOn"] += sh.get("on") or 0
            ps = s.get("passes") or {}
            agg["passes"] += ps.get("total") or 0
            agg["keyPasses"] += ps.get("key") or 0
            try:
                acc_sum += float(str(ps.get("accuracy") or 0).replace("%", "")) * apps
            except (TypeError, ValueError):
                pass
            tk = s.get("tackles") or {}
            agg["tackles"] += tk.get("total") or 0
            agg["interceptions"] += tk.get("interceptions") or 0
            du = s.get("duels") or {}
            agg["duelsWon"] += du.get("won") or 0
            agg["duelsTotal"] += du.get("total") or 0
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
            "team": (club_name or team) if team_id else team,
            "season": season,
            "played": (agg["appearances"] > 0 or agg["minutes"] > 0),
            "rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
            "stats": {**agg, "passAccuracy": round(acc_sum / agg["appearances"]) if agg["appearances"] else 0},
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
                       {"league": c["league_id"], "season": season_for(slug)})
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



# Reputable bookmakers we are willing to surface + redirect to. Anything not
# matching (grey-market / blocked-in-Greece operators) is dropped from odds.
APPROVED_BOOKMAKERS = (
    "bet365", "betano", "bwin", "unibet", "betsson", "netbet", "888sport",
    "888 sport", "betway", "betvictor", "bet victor", "interwetten",
    "william hill", "coolbet", "nordicbet", "10bet", "leovegas",
    # Greek-market operators (shown when the provider actually returns them).
    "stoiximan", "novibet", "fonbet", "pamestoixima", "pame stoixima",
)


def _bookmaker_approved(name: str) -> bool:
    if not name:
        return False
    key = name.strip().lower()
    return any(a in key or key in a for a in APPROVED_BOOKMAKERS)


def _mw_entries(bookmakers: list) -> list:
    """API-Football odds -> value schema [{bookmaker, odds:{home,draw,away}}].
    Only APPROVED, reputable bookmakers are kept — grey-market / operators that
    are blocked in Greece (e.g. 1xBet, Marathonbet, Pinnacle, Stake) are dropped
    entirely so we never surface odds that redirect to an unsafe/blacklisted site.
    """
    entries = []
    for bk in bookmakers or []:
        if not _bookmaker_approved(bk.get("name")):
            continue
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
    _c_set(ck, out, ttl=12 * 3600 if out else (6 * 3600 if c.get("national") else 300))
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
            season = c.get("season") or (yr if mo >= 7 else yr - 1)
        except (ValueError, IndexError):
            season = season_for(slug)
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
                       {"league": c["league_id"], "season": season_for(slug), "page": 1})
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