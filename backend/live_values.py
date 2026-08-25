"""Live value-match builder.

Combines The Odds API (real fixtures + bookmaker odds) with SportMonks (real team
stats) for the leagues the SportMonks free plan covers (Denmark Superliga,
Scotland Premiership) and emits matches in the value-engine schema so the existing
rank_value_matches() produces real 'Moka values'.
"""
import time
import logging

import the_odds_api as oa
import sportmonks as sm

logger = logging.getLogger(__name__)

# internal slug -> (odds api sport key, leagueId, leagueName, sportmonks league id)
LIVE_LEAGUES = {
    "denmark": ("soccer_denmark_superliga", "dk_superliga", "Superliga (Denmark)", 271),
    "scotland": ("soccer_spl", "scot_prem", "Premiership (Scotland)", 501),
}

ODDS_TTL = 12 * 3600     # respect Odds API 500 req/month
STATS_TTL = 6 * 3600
MATCHES_TTL = 15 * 60

_cache: dict = {}  # key -> (value, expires_monotonic)


def _cache_get(k):
    e = _cache.get(k)
    if e and time.monotonic() < e[1]:
        return e[0]
    return None


def _cache_set(k, v, ttl):
    _cache[k] = (v, time.monotonic() + ttl)


def _best_odds_entries(event: dict) -> list:
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


def _match_stat(stats: dict, name: str):
    n = sm.norm_name(name)
    if n in stats:
        return stats[n]
    for k, v in stats.items():
        if n and (n in k or k in n):
            return v
    return None


def _team_obj(name: str, st: dict) -> dict:
    st = st or {}
    return {
        "name": name,
        "form": st.get("form", 5),
        "goalsScored": st.get("goalsScored", 1.2),
        "goalsConceded": st.get("goalsConceded", 1.2),
        "possession": st.get("possession"),
    }


async def build_live_matches() -> list:
    cached = _cache_get("live_matches")
    if cached is not None:
        return cached

    matches = []
    for _slug, (sport_key, lid, lname, sm_league) in LIVE_LEAGUES.items():
        # Real team stats from SportMonks (best-effort)
        stats = _cache_get(f"stats_{sm_league}")
        if stats is None:
            try:
                stats = await sm.team_stats_for_league(sm_league)
                _cache_set(f"stats_{sm_league}", stats, STATS_TTL)
            except Exception as e:
                logger.warning("sportmonks stats %s: %s", sm_league, e)
                stats = {}

        # Real fixtures + odds from The Odds API
        events = _cache_get(f"odds_{sport_key}")
        if events is None:
            try:
                events, _quota = await oa.league_odds(sport_key)
                _cache_set(f"odds_{sport_key}", events, ODDS_TTL)
            except Exception as e:
                logger.warning("odds %s: %s", sport_key, e)
                events = []

        for ev in events or []:
            home, away = ev.get("home_team"), ev.get("away_team")
            if not home or not away:
                continue
            odds = _best_odds_entries(ev)
            if not odds:
                continue
            hs = _match_stat(stats, home)
            as_ = _match_stat(stats, away)
            matches.append({
                "id": f"live_{ev.get('id')}",
                "leagueId": lid,
                "leagueName": lname,
                "sport": "football",
                "status": "upcoming",
                "commence_time": ev.get("commence_time"),
                "home": _team_obj(home, hs),
                "away": _team_obj(away, as_),
                "odds": odds,
                "dataSource": "odds_api+sportmonks" if (hs or as_) else "odds_api",
            })

    # Cache non-empty results for the full window; if empty (transient API
    # failure), retry soon so we don't get stuck on mock for 15 minutes.
    _cache_set("live_matches", matches, MATCHES_TTL if matches else 60)
    return matches


def has_live_data() -> bool:
    return bool(_cache_get("live_matches"))
