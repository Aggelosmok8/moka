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
import asyncio
import logging
import unicodedata

import apifootball as af
import odds_api_io as oaio

logger = logging.getLogger(__name__)

# Football leagues surfaced on the Matches page (ids/names from af.CATALOG).
LIVE_LEAGUES = [
    "epl", "laliga", "seriea", "bundesliga", "ligue1",
    "eredivisie", "primeira", "championship", "superleague",
    "denmark", "scotland", "ucl", "uel", "uecl",
    "facup", "eflcup", "copadelrey", "coppaitalia", "dfbpokal", "coupedefrance", "greekcup",
    "portugalcup", "knvbbeker", "scottishcup", "danishcup",
]

STATS_TTL = 24 * 3600
MATCHES_TTL = 2 * 3600  # pre-match value list changes slowly; long cache saves quota
MAX_PER_LEAGUE = 14      # full matchday per competition (was 6 -> matches were lost)
_BUILD_CONCURRENCY = 6    # cap simultaneous league builds (API rate-limit safety)

_cache: dict = {}
_build_lock = asyncio.Lock()


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
    form = st.get("formNum")
    return {
        "name": name,
        "form": form if form is not None else _form_num(st.get("form")),
        "goalsScored": st.get("goalsPerGame") or 1.2,
        "goalsConceded": st.get("concededPerGame") or 1.1,
        "possession": None,
    }


# European competitions: a club's scoring level is mostly set by its domestic
# season (bigger sample), so stats are blended 70% domestic / 30% competition.
EURO_SLUGS = {"ucl", "uel", "uecl"}
DOMESTIC_WEIGHT = 0.7


def _blend_stats(dom: dict, comp: dict) -> dict:
    """70% domestic (league/cup table) + 30% European-competition numbers."""
    if not dom:
        return comp
    if not comp:
        return dom
    out = dict(comp)
    w = DOMESTIC_WEIGHT
    for k in ("goalsPerGame", "concededPerGame"):
        a, b = dom.get(k), comp.get(k)
        if a is not None and b is not None:
            out[k] = round(a * w + b * (1 - w), 2)
        elif a is not None:
            out[k] = a
    out["formNum"] = round(_form_num(dom.get("form")) * w + _form_num(comp.get("form")) * (1 - w), 1)
    return out


async def _domestic_index() -> dict:
    """Normalised team name -> stats across every domestic league/cup we cover."""
    ck = "domestic_stats_idx"
    hit = _cache_get(ck)
    if hit is not None:
        return hit
    idx = {}
    for slug in LIVE_LEAGUES:
        if slug in EURO_SLUGS:
            continue
        try:
            teams = await af.teams_for_league(slug)
        except Exception as e:
            logger.warning("domestic idx %s: %s", slug, e)
            continue
        for t in teams or []:
            k = _norm(t.get("name"))
            if k and k not in idx:
                idx[k] = t
    _cache_set(ck, idx, STATS_TTL)
    return idx


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


async def _build_one_league(slug: str) -> list:
    """Build the value-match list for a single league (stats + fixtures + odds)."""
    c = af.CATALOG.get(slug, {})
    lid, lname = slug, c.get("name", slug)

    idx = await _stats_index(slug)
    dom_idx = await _domestic_index() if slug in EURO_SLUGS else None

    try:
        fixtures = await af.upcoming_fixtures_raw(slug, MAX_PER_LEAGUE * 2)
    except Exception as e:
        logger.warning("fixtures %s: %s", slug, e)
        fixtures = []
    if not fixtures:
        return []

    # Odds for the 1-2 nearest match dates (bookmakers price near-term games).
    dates = []
    for f in fixtures:
        dd = (f.get("kickoff") or "")[:10]
        if dd and dd not in dates:
            dates.append(dd)
    try:
        odds_map = await af.odds_for_dates(slug, dates[:3])
    except Exception as e:
        logger.warning("odds %s: %s", slug, e)
        odds_map = {}

    # Greek-market odds (Stoiximan/Novibet/Pamestoixima) via odds-api.io — only
    # when ODDS_API_IO_KEY is set; otherwise this is an empty {} (no behaviour
    # change). Shared 12h cache means one fetch covers every league.
    greek_idx = await oaio.greek_odds_index("football")

    league_matches = []
    count = 0
    for f in fixtures:
        if count >= MAX_PER_LEAGUE:
            break
        home, away = f["home"], f["away"]
        # One unified, de-duplicated odds list from both providers.
        odds = oaio.merge_odds(odds_map.get(f["id"]) or [], oaio.lookup(greek_idx, home, away))
        if not odds:                     # no odds -> skip (never show empty odds)
            continue
        hs = _lookup(idx, home)
        as_ = _lookup(idx, away)
        if dom_idx is not None:
            hs = _blend_stats(_lookup(dom_idx, home), hs)
            as_ = _blend_stats(_lookup(dom_idx, away), as_)
        league_matches.append({
            "id": f"live_af_{f['id']}",
            "leagueId": lid,
            "leagueName": lname,
            "sport": "football",
            "status": "upcoming",
            "commence_time": f.get("kickoff"),
            "home": _team_obj(home, hs),
            "away": _team_obj(away, as_),
            "home_id": (hs or {}).get("id"),
            "away_id": (as_ or {}).get("id"),
            "odds": odds,
            "dataSource": "apifootball",
        })
        count += 1
    return league_matches


async def build_live_matches() -> list:
    cached = _cache_get("live_matches")
    if cached is not None:
        return cached
    # Single-flight: if two callers race on a cold cache (e.g. startup prewarm +
    # first visitor), only one builds; the other reuses the freshly cached result.
    async with _build_lock:
        cached = _cache_get("live_matches")
        if cached is not None:
            return cached
        return await _do_build_live_matches()


async def _do_build_live_matches() -> list:
    # Build all leagues concurrently so a cold cache loads in a few seconds
    # instead of ~1min (per-league calls are independent; each is still cached).
    sem = asyncio.Semaphore(_BUILD_CONCURRENCY)

    async def _guarded(slug):
        async with sem:
            return await _build_one_league(slug)

    results = await asyncio.gather(
        *(_guarded(slug) for slug in LIVE_LEAGUES),
        return_exceptions=True,
    )
    matches = []
    for r in results:
        if isinstance(r, list):
            matches.extend(r)
        elif isinstance(r, Exception):
            logger.warning("build league failed: %s", r)

    if matches:
        _cache_set("live_matches", matches, MATCHES_TTL)
        _cache_set("live_matches_last", matches, 12 * 3600)  # stale fallback
        return matches
    # Build produced nothing (quota exhausted / API errors / cold-start race).
    # Serve the last known-good set instead of an empty page, and retry soon.
    stale = _cache_get("live_matches_last")
    if stale is not None:
        _cache_set("live_matches", stale, 60)
        return stale
    _cache_set("live_matches", matches, 60)
    return matches


def has_live_data() -> bool:
    return bool(_cache_get("live_matches") or _cache_get("live_matches_last"))
