"""Live value-match builder.

Real upcoming fixtures + real bookmaker odds from The Odds API, combined with
real team stats (form, goals for/against) from API-Football standings (Pro
subscription, current season). Emitted in the value-engine schema so the
existing rank_value_matches() produces real "Moka values". The Moka
probability / value / EV model itself is UNCHANGED — this only feeds it real
data instead of mock data.

Call efficiency:
  * The Odds API — 1 request per league (all upcoming fixtures + odds), cached 12h.
  * API-Football — 1 standings request per league for team stats, cached 24h
    (goes through apifootball._get which enforces the <=100/day budget).
No per-match calls, no polling, no per-render calls.
"""
import re
import time
import logging
import unicodedata

import the_odds_api as oa
import apifootball as af

logger = logging.getLogger(__name__)

# internal slug -> The Odds API sport key. League id/name come from af.CATALOG.
LIVE_LEAGUES = {
    "epl":        "soccer_epl",
    "laliga":     "soccer_spain_la_liga",
    "seriea":     "soccer_italy_serie_a",
    "bundesliga": "soccer_germany_bundesliga",
    "ligue1":     "soccer_france_ligue_one",
}

ODDS_TTL = 12 * 3600      # The Odds API: 500 req/month -> cache hard
STATS_TTL = 24 * 3600     # standings barely change intraday
MATCHES_TTL = 30 * 60
MAX_PER_LEAGUE = 6        # keep the real-data set small (~20-30 matches total)

_cache: dict = {}


def _cache_get(k):
    e = _cache.get(k)
    if e and time.monotonic() < e[1]:
        return e[0]
    return None


def _cache_set(k, v, ttl):
    _cache[k] = (v, time.monotonic() + ttl)


def _norm(name: str) -> str:
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


def _best_odds_entries(event: dict) -> list:
    """Extract 1X2 (h2h) odds per bookmaker from a The Odds API event."""
    home, away = event.get("home_team"), event.get("away_team")
    entries = []
    for bk in event.get("bookmakers") or []:
        title = bk.get("title") or bk.get("key")
        h = d = a = 0.0
        for m in bk.get("markets") or []:
            if m.get("key") != "h2h":
                continue
            for o in m.get("outcomes") or []:
                nm, pr = o.get("name"), float(o.get("price") or 0)
                if nm == home:
                    h = pr
                elif nm == away:
                    a = pr
                elif (nm or "").lower() == "draw":
                    d = pr
        if h or d or a:
            entries.append({"bookmaker": title, "odds": {"home": h, "draw": d, "away": a}})
    return entries


def _form_num(form_list) -> float:
    """W/D/L list -> 0-10 form number (same scale the model expects)."""
    recent = (form_list or [])[-5:]
    if not recent:
        return 5.0
    pts = sum(2 if c == "W" else 1 if c == "D" else 0 for c in recent)
    return round(pts / (len(recent) * 2) * 10, 1)


def _team_obj(name: str, st: dict) -> dict:
    st = st or {}
    return {
        "name": name,
        "form": _form_num(st.get("form")),
        "goalsScored": st.get("goalsPerGame") or 1.2,
        "goalsConceded": st.get("concededPerGame") or 1.1,
        "possession": None,
    }


async def _stats_index(slug: str) -> dict:
    """Normalised team-name -> standings stats for a league (API-Football)."""
    ck = f"stats_idx_{slug}"
    hit = _cache_get(ck)
    if hit is not None:
        return hit
    idx = {}
    try:
        teams = await af.teams_for_league(slug)
        for t in teams or []:
            idx[_norm(t.get("name"))] = t
    except Exception as e:
        logger.warning("live_values stats %s: %s", slug, e)
    _cache_set(ck, idx, STATS_TTL)
    return idx


def _lookup(idx: dict, name: str):
    n = _norm(name)
    if not n:
        return None
    if n in idx:
        return idx[n]
    for k, v in idx.items():
        if len(n) >= 4 and (n in k or k in n):
            return v
    return None


async def build_live_matches() -> list:
    cached = _cache_get("live_matches")
    if cached is not None:
        return cached

    matches = []
    for slug, sport_key in LIVE_LEAGUES.items():
        c = af.CATALOG.get(slug, {})
        lid, lname = slug, c.get("name", slug)

        idx = await _stats_index(slug)

        events = _cache_get(f"odds_{sport_key}")
        if events is None:
            try:
                events, _quota = await oa.league_odds(sport_key)
                _cache_set(f"odds_{sport_key}", events, ODDS_TTL)
            except Exception as e:
                logger.warning("odds %s: %s", sport_key, e)
                events = []

        count = 0
        covered = set()
        league_matches = []
        for ev in events or []:
            if count >= MAX_PER_LEAGUE:
                break
            home, away = ev.get("home_team"), ev.get("away_team")
            if not home or not away:
                continue
            odds = _best_odds_entries(ev)
            if not odds:
                continue
            hs = _lookup(idx, home)
            as_ = _lookup(idx, away)
            league_matches.append({
                "id": f"live_{ev.get('id')}",
                "leagueId": lid,
                "leagueName": lname,
                "sport": "football",
                "status": "upcoming",
                "commence_time": ev.get("commence_time"),
                "home": _team_obj(home, hs),
                "away": _team_obj(away, as_),
                "odds": odds,
                "dataSource": "odds_api+apifootball" if (hs or as_) else "odds_api",
            })
            covered.add((_norm(home), _norm(away)))
            count += 1

        # Fill any gap with API-Football fixtures + odds so no match is left
        # without odds (only runs when The Odds API under-covers the league;
        # lazy -> zero extra API-Football calls when odds_api already fills up).
        if count < MAX_PER_LEAGUE:
            try:
                fixtures = await af.upcoming_fixtures_raw(slug, MAX_PER_LEAGUE)
                af_odds = None
                for fx in fixtures:
                    if count >= MAX_PER_LEAGUE:
                        break
                    pair = (_norm(fx.get("home")), _norm(fx.get("away")))
                    if pair in covered:
                        continue
                    if af_odds is None:
                        af_odds = await af.odds_by_fixture(slug)
                    odds = af_odds.get(fx.get("id"))
                    if not odds:
                        continue
                    hs = _lookup(idx, fx.get("home"))
                    as_ = _lookup(idx, fx.get("away"))
                    league_matches.append({
                        "id": f"live_af_{fx.get('id')}",
                        "leagueId": lid,
                        "leagueName": lname,
                        "sport": "football",
                        "status": "upcoming",
                        "commence_time": fx.get("kickoff"),
                        "home": _team_obj(fx.get("home"), hs),
                        "away": _team_obj(fx.get("away"), as_),
                        "odds": odds,
                        "dataSource": "apifootball",
                    })
                    covered.add(pair)
                    count += 1
            except Exception as e:
                logger.warning("live_values af-odds fill %s: %s", slug, e)

        matches.extend(league_matches)

    # Cache non-empty results for the full window; if empty (transient API
    # failure) retry soon so we don't get stuck on mock.
    _cache_set("live_matches", matches, MATCHES_TTL if matches else 60)
    return matches


def has_live_data() -> bool:
    return bool(_cache_get("live_matches"))
