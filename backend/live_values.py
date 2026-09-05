"""Live value-match builder.

Real upcoming fixtures + real bookmaker odds + real team stats, all from
API-Football (Pro). Emitted in the value-engine schema so the existing
rank_value_matches() produces real "Moka values". The Moka probability / value
/ EV model itself is UNCHANGED — this only feeds it real data.

Why API-Football only: The Odds API free tier (500 req/month) gets exhausted
mid-month, which left matches empty (and the app fell back to mock team names).
API-Football Pro (7500 req/day) covers fixtures, odds and stats for every
league in one place, so it's the single reliable source.

Call efficiency (all cached, all through apifootball._get which enforces the
daily budget):
  * standings  -> 1 call/league (team stats), cached 24h
  * fixtures   -> 1 call/league (nearest upcoming),      cached 6h
  * odds       -> 1 call per near match-date/league,      cached 12h
No per-match calls, no polling, no per-render calls.
"""
import re
import time
import logging
import unicodedata

import apifootball as af

logger = logging.getLogger(__name__)

# Football leagues surfaced on the Matches page (ids/names from af.CATALOG).
LIVE_LEAGUES = [
    "epl", "laliga", "seriea", "bundesliga", "ligue1",
    "eredivisie", "primeira", "championship", "superleague",
    "denmark", "scotland",
]

STATS_TTL = 24 * 3600
MATCHES_TTL = 30 * 60
MAX_PER_LEAGUE = 6        # keep the real-data set reasonable

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


def _form_num(form_list) -> float:
    """W/D/L list -> 0-10 form number (the scale the model expects)."""
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
    for slug in LIVE_LEAGUES:
        c = af.CATALOG.get(slug, {})
        lid, lname = slug, c.get("name", slug)

        idx = await _stats_index(slug)

        try:
            fixtures = await af.upcoming_fixtures_raw(slug, MAX_PER_LEAGUE * 2)
        except Exception as e:
            logger.warning("fixtures %s: %s", slug, e)
            fixtures = []
        if not fixtures:
            continue

        # Odds for the 1-2 nearest match dates (bookmakers price near-term games).
        dates = []
        for f in fixtures:
            dd = (f.get("kickoff") or "")[:10]
            if dd and dd not in dates:
                dates.append(dd)
        try:
            odds_map = await af.odds_for_dates(slug, dates[:2])
        except Exception as e:
            logger.warning("odds %s: %s", slug, e)
            odds_map = {}

        count = 0
        for f in fixtures:
            if count >= MAX_PER_LEAGUE:
                break
            odds = odds_map.get(f["id"])
            if not odds:                     # no odds -> skip (never show empty odds)
                continue
            home, away = f["home"], f["away"]
            hs = _lookup(idx, home)
            as_ = _lookup(idx, away)
            matches.append({
                "id": f"live_af_{f['id']}",
                "leagueId": lid,
                "leagueName": lname,
                "sport": "football",
                "status": "upcoming",
                "commence_time": f.get("kickoff"),
                "home": _team_obj(home, hs),
                "away": _team_obj(away, as_),
                "odds": odds,
                "dataSource": "apifootball",
            })
            count += 1

    _cache_set("live_matches", matches, MATCHES_TTL if matches else 60)
    return matches


def has_live_data() -> bool:
    return bool(_cache_get("live_matches"))
