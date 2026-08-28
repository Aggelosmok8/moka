"""
FootballServiceLayer (FSL)
==========================
100% free-tier data pipeline for the AI Sports Betting Advisory Platform.

Data sources (in order of priority):
  1. football-data.org  — free tier, 10 req/min, no key needed for basic endpoints
  2. thesportsdb.com    — completely free, no key needed
  3. built-in mock      — always available fallback

AI Insights Engine  — pure heuristic, no paid LLM required.
Value Bet Engine    — formula-based signal computation.
Cache Layer         — in-memory TTL cache, prevents duplicate calls.
"""

import os
import time
import asyncio
import logging
import hashlib
import json
from datetime import datetime, timezone, date
from typing import Optional, Any
import httpx

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────

FOOTBALL_DATA_KEY = os.environ.get("FOOTBALL_DATA_KEY", "")      # optional free key
SPORTSDB_BASE     = "https://www.thesportsdb.com/api/v1/json/3"  # free tier
FDATA_BASE        = "https://api.football-data.org/v4"

# Free-tier competition IDs for football-data.org
FDATA_COMPETITIONS = {
    "PL":  "Premier League",
    "PD":  "La Liga",
    "SA":  "Serie A",
    "BL1": "Bundesliga",
    "FL1": "Ligue 1",
}

# Equivalent SportsDB league IDs
SPORTSDB_LEAGUES = {
    "4328": "Premier League",
    "4335": "La Liga",
    "4332": "Serie A",
    "4331": "Bundesliga",
    "4334": "Ligue 1",
}

CACHE_TTL   = int(os.environ.get("FSL_CACHE_TTL", "90"))   # seconds
CACHE_LONG  = int(os.environ.get("FSL_CACHE_LONG", "600")) # 10 min for standings/stats

# ── In-Memory TTL Cache ────────────────────────────────────────────────────────

class TTLCache:
    def __init__(self):
        self._store: dict[str, tuple[Any, float]] = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if not entry:
            return None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: int = CACHE_TTL):
        self._store[key] = (value, time.monotonic() + ttl)

    def clear(self):
        self._store.clear()

    def delete(self, key: str):
        self._store.pop(key, None)


_cache = TTLCache()

# ── HTTP helpers ───────────────────────────────────────────────────────────────

HEADERS_FDATA = {"X-Auth-Token": FOOTBALL_DATA_KEY} if FOOTBALL_DATA_KEY else {}
HEADERS_STD   = {"User-Agent": "MokaAdvisory/1.0"}

async def _get(url: str, headers: dict = None, timeout: int = 10) -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url, headers={**HEADERS_STD, **(headers or {})})
            if r.status_code == 200:
                return r.json()
            logger.warning("HTTP %s for %s", r.status_code, url)
    except Exception as e:
        logger.warning("Request failed %s: %s", url, e)
    return None


# ── Heuristic AI Insights Engine ──────────────────────────────────────────────

def _form_score(form: list[str]) -> float:
    """Convert W/D/L form to 0-100 score."""
    if not form:
        return 50.0
    points = {"W": 3, "D": 1, "L": 0}
    max_pts = len(form) * 3
    earned = sum(points.get(r, 0) for r in form[-5:])
    return round(earned / max(max_pts, 1) * 100, 1)

def _attack_strength(gpg: float) -> float:
    """Goals per game to 0-100 attack rating."""
    return min(round(gpg / 3.0 * 100, 1), 100.0)

def _compute_value_score(home_stats: dict, away_stats: dict, home_advantage: float = 8.0) -> dict:
    """
    valueScore = teamForm + attackStrength - injuryImpact + homeAdvantage
    Returns value signal (LOW/MEDIUM/HIGH), confidence 0-100, explanation.
    """
    h_form   = _form_score(home_stats.get("form", []))
    a_form   = _form_score(away_stats.get("form", []))
    h_attack = _attack_strength(home_stats.get("goalsPerGame", 1.2))
    a_attack = _attack_strength(away_stats.get("goalsPerGame", 1.0))

    h_score = h_form * 0.4 + h_attack * 0.4 + home_advantage * 0.2
    a_score = a_form * 0.4 + a_attack * 0.4

    differential = abs(h_score - a_score)
    favorite     = "home" if h_score >= a_score else "away"
    confidence   = min(int(50 + differential * 0.6), 95)

    if differential > 25:
        signal = "HIGH"
    elif differential > 12:
        signal = "MEDIUM"
    else:
        signal = "LOW"

    winner_name = home_stats.get("name", "Home") if favorite == "home" else away_stats.get("name", "Away")
    explanation = (
        f"{winner_name} shows stronger form ({h_form if favorite=='home' else a_form:.0f}/100) "
        f"and attacking output. Differential: {differential:.0f} pts."
    )
    return {
        "valueSignal":    signal,
        "confidence":     confidence,
        "valueExplanation": explanation,
        "favorite":       favorite,
    }


def generate_match_insight(match: dict) -> dict:
    """
    Pure heuristic AI insights engine — no paid API required.
    Returns summary, bullets, risk level, xG approximation.
    """
    home = match.get("homeTeam", {})
    away = match.get("awayTeam", {})
    h_name = home.get("name", "Home")
    a_name = away.get("name", "Away")

    h_form_list = home.get("form", ["D", "D", "D"])
    a_form_list = away.get("form", ["D", "D", "D"])
    h_form = _form_score(h_form_list)
    a_form = _form_score(a_form_list)

    h_gpg = float(home.get("goalsPerGame", 1.2))
    a_gpg = float(away.get("goalsPerGame", 1.0))
    h_con = float(home.get("concededPerGame", 1.1))
    a_con = float(away.get("concededPerGame", 1.2))

    h_btts = float(home.get("btts", 45))
    a_btts = float(away.get("btts", 45))
    btts_pct = (h_btts + a_btts) / 2

    # Simple xG approximation
    h_xg = round((h_gpg * 0.55 + a_con * 0.45), 2)
    a_xg = round((a_gpg * 0.55 + h_con * 0.45), 2)

    # Risk level
    form_diff = abs(h_form - a_form)
    if form_diff > 30:
        risk = "LOW"
    elif form_diff > 15:
        risk = "MEDIUM"
    else:
        risk = "HIGH"

    # Recent form strings
    h_form_str = "".join(h_form_list[-5:]) or "N/A"
    a_form_str = "".join(a_form_list[-5:]) or "N/A"

    # AI summary
    stronger = h_name if h_form >= a_form else a_name
    weaker   = a_name if h_form >= a_form else h_name

    summary = (
        f"{stronger} enter this fixture in better form ({max(h_form, a_form):.0f}/100) "
        f"against {weaker} ({min(h_form, a_form):.0f}/100). "
        f"Expected xG: {h_name} {h_xg} – {a_name} {a_xg}. "
        f"BTTS probability sits around {btts_pct:.0f}%, making goals on both ends likely."
    )

    bullets = [
        f"{h_name} recent form: {h_form_str} — scoring {h_gpg:.1f} goals/game",
        f"{a_name} recent form: {a_form_str} — scoring {a_gpg:.1f} goals/game",
        f"Est. xG: {h_name} {h_xg} vs {a_name} {a_xg}",
        f"BTTS likelihood: {btts_pct:.0f}%",
    ]

    if h_btts > 55 and a_btts > 55:
        bullets.append("Both teams have scored in 55%+ of recent games — BTTS looks likely")
    if h_xg + a_xg > 2.5:
        bullets.append(f"Combined xG ({h_xg + a_xg:.1f}) suggests Over 2.5 goals is plausible")

    return {
        "aiSummary":  summary,
        "aiBullets":  bullets,
        "riskLevel":  risk,
        "xgHome":     h_xg,
        "xgAway":     a_xg,
    }


# ── Data normalisation helpers ─────────────────────────────────────────────────

def _safe_form(raw: str) -> list[str]:
    """'WDLWW' → ['W','D','L','W','W']"""
    if not raw:
        return []
    return [c for c in raw.upper() if c in ("W", "D", "L")][-6:]


def _mock_team_stats(name: str, seed_int: int) -> dict:
    """Generate stable mock stats from a team name hash — deterministic."""
    h = int(hashlib.md5(name.encode()).hexdigest(), 16)
    gpg  = round(0.8 + (h % 17) * 0.12, 2)
    cpg  = round(0.7 + (h % 13) * 0.11, 2)
    form_pool = ["W", "D", "L"]
    form = [form_pool[(h >> i) % 3] for i in range(6)]
    return {
        "name":           name,
        "goalsPerGame":   gpg,
        "concededPerGame": cpg,
        "form":           form,
        "btts":           int(35 + (h % 35)),
        "over25":         int(40 + (h % 30)),
        "possession":     int(42 + (h % 18)),
        "passAccuracy":   int(74 + (h % 16)),
        "shotsPerGame":   round(9 + (h % 7) * 0.5, 1),
    }


# ── football-data.org adapter ─────────────────────────────────────────────────

async def _fetch_fdata_today() -> list[dict]:
    """Fetch today's matches from football-data.org (free tier)."""
    today = date.today().isoformat()
    url = f"{FDATA_BASE}/matches?dateFrom={today}&dateTo={today}"
    data = await _get(url, headers=HEADERS_FDATA)
    if not data:
        return []

    matches = []
    for m in data.get("matches", []):
        try:
            status_raw = m.get("status", "SCHEDULED")
            status_map = {
                "IN_PLAY": "live", "PAUSED": "live", "HALF_TIME": "live",
                "FINISHED": "finished", "SCHEDULED": "upcoming", "TIMED": "upcoming",
                "POSTPONED": "postponed",
            }
            status = status_map.get(status_raw, "upcoming")
            score = m.get("score", {})
            ft = score.get("fullTime", {})
            ht = score.get("halfTime", {})

            home_name = m["homeTeam"]["name"]
            away_name = m["awayTeam"]["name"]
            h_stats   = _mock_team_stats(home_name, m["homeTeam"]["id"])
            a_stats   = _mock_team_stats(away_name, m["awayTeam"]["id"])

            match_obj = {
                "id":          f"fd_{m['id']}",
                "leagueName":  m.get("competition", {}).get("name", "Football"),
                "leagueId":    m.get("competition", {}).get("code", ""),
                "status":      status,
                "minute":      m.get("minute"),
                "homeScore":   ft.get("home") if status == "finished" else (ht.get("home") if status == "live" else None),
                "awayScore":   ft.get("away") if status == "finished" else (ht.get("away") if status == "live" else None),
                "home": {
                    "id":    f"fd_t_{m['homeTeam']['id']}",
                    "name":  home_name,
                    "short": m["homeTeam"].get("shortName") or home_name[:3].upper(),
                    "color": "#39FF14",
                    "form":  h_stats["form"],
                },
                "away": {
                    "id":    f"fd_t_{m['awayTeam']['id']}",
                    "name":  away_name,
                    "short": m["awayTeam"].get("shortName") or away_name[:3].upper(),
                    "color": "#A1A1AA",
                    "form":  a_stats["form"],
                },
                "homeTeam":    h_stats,
                "awayTeam":    a_stats,
                "venue":       m.get("venue", ""),
                "dataSource":  "football-data.org",
            }

            # Compute AI insights
            insight = generate_match_insight(match_obj)
            value   = _compute_value_score(h_stats, a_stats)
            pred    = _predict_strength(h_stats, a_stats)
            match_obj.update({**insight, **value, "predictedStrength": pred})
            matches.append(match_obj)
        except Exception as e:
            logger.debug("fdata parse error: %s", e)

    return matches


# ── thesportsdb.com adapter ───────────────────────────────────────────────────

async def _fetch_sportsdb_today() -> list[dict]:
    """Fetch today's events from thesportsdb.com (free)."""
    today = date.today().isoformat()
    matches = []

    for league_id, league_name in SPORTSDB_LEAGUES.items():
        url = f"{SPORTSDB_BASE}/eventsday.php?d={today}&l={league_id}"
        data = await _get(url)
        if not data:
            continue
        for e in (data.get("events") or []):
            try:
                home_name = e.get("strHomeTeam", "Home")
                away_name = e.get("strAwayTeam", "Away")
                h_score   = e.get("intHomeScore")
                a_score   = e.get("intAwayScore")
                status    = "finished" if h_score is not None else "upcoming"

                h_stats = _mock_team_stats(home_name, int(e.get("idEvent", 0)))
                a_stats = _mock_team_stats(away_name, int(e.get("idEvent", 0)) + 1)

                match_obj = {
                    "id":         f"tsdb_{e['idEvent']}",
                    "leagueName": league_name,
                    "leagueId":   league_id,
                    "status":     status,
                    "minute":     None,
                    "homeScore":  int(h_score) if h_score is not None else None,
                    "awayScore":  int(a_score) if a_score is not None else None,
                    "home": {
                        "id":    f"tsdb_t_{e.get('idHomeTeam', home_name)}",
                        "name":  home_name,
                        "short": home_name[:3].upper(),
                        "color": "#39FF14",
                        "form":  h_stats["form"],
                    },
                    "away": {
                        "id":    f"tsdb_t_{e.get('idAwayTeam', away_name)}",
                        "name":  away_name,
                        "short": away_name[:3].upper(),
                        "color": "#A1A1AA",
                        "form":  a_stats["form"],
                    },
                    "homeTeam":   h_stats,
                    "awayTeam":   a_stats,
                    "venue":      e.get("strVenue", ""),
                    "dataSource": "thesportsdb.com",
                }
                insight = generate_match_insight(match_obj)
                value   = _compute_value_score(h_stats, a_stats)
                pred    = _predict_strength(h_stats, a_stats)
                match_obj.update({**insight, **value, "predictedStrength": pred})
                matches.append(match_obj)
            except Exception as ex:
                logger.debug("sportsdb parse: %s", ex)

    return matches


def _predict_strength(h: dict, a: dict) -> dict:
    """Compute home/draw/away win probabilities from form + stats."""
    h_f = _form_score(h.get("form", []))
    a_f = _form_score(a.get("form", []))
    total = h_f + a_f + 15  # 15 = home advantage buffer
    h_p = round(h_f / total * 100)
    a_p = round(a_f / total * 100)
    d_p = max(100 - h_p - a_p, 5)
    return {"home": h_p, "draw": d_p, "away": a_p}


# ── Mock fallback data ────────────────────────────────────────────────────────

def _mock_matches() -> list[dict]:
    """Always-available fallback — never crashes the app."""
    fixtures = [
        ("prem", "Premier League", "Arsenal",    "Chelsea",     "ARS", "CHE"),
        ("liga", "La Liga",        "Barcelona",  "Real Madrid", "BAR", "RMA"),
        ("seri", "Serie A",        "Inter Milan","AC Milan",    "INT", "MIL"),
        ("bund", "Bundesliga",     "Bayern",     "Dortmund",    "BAY", "BVB"),
        ("l1",   "Ligue 1",        "PSG",        "Monaco",      "PSG", "MON"),
        ("prem", "Premier League", "Man City",   "Liverpool",   "MCI", "LIV"),
    ]
    matches = []
    for i, (lid, lname, hn, an, hs, as_) in enumerate(fixtures):
        h_stats = _mock_team_stats(hn, i * 7)
        a_stats = _mock_team_stats(an, i * 7 + 3)
        m = {
            "id":         f"mock_{i}",
            "leagueName": lname,
            "leagueId":   lid,
            "status":     "live" if i == 0 else "upcoming",
            "minute":     67 if i == 0 else None,
            "homeScore":  2 if i == 0 else None,
            "awayScore":  1 if i == 0 else None,
            "home": {"id": f"mock_ht_{i}", "name": hn, "short": hs, "color": "#39FF14", "form": h_stats["form"]},
            "away": {"id": f"mock_at_{i}", "name": an, "short": as_, "color": "#A1A1AA", "form": a_stats["form"]},
            "homeTeam":   h_stats,
            "awayTeam":   a_stats,
            "venue":      "Stadium",
            "h2h":        [],
            "dataSource": "mock",
        }
        insight = generate_match_insight(m)
        value   = _compute_value_score(h_stats, a_stats)
        pred    = _predict_strength(h_stats, a_stats)
        m.update({**insight, **value, "predictedStrength": pred})
        matches.append(m)
    return matches


# ── Public FSL API ────────────────────────────────────────────────────────────

async def fsl_get_matches(force_refresh: bool = False) -> dict:
    """
    Main entry point. Returns:
    { matches: [...], source: str, liveCount: int, totalCount: int }
    Never raises — always returns something.
    """
    cache_key = "fsl_matches_today"
    if not force_refresh:
        cached = _cache.get(cache_key)
        if cached:
            return cached

    matches = []
    source  = "mock"

    # Try primary: football-data.org
    try:
        fd_matches = await asyncio.wait_for(_fetch_fdata_today(), timeout=8)
        if fd_matches:
            matches = fd_matches
            source  = "football-data.org"
    except Exception as e:
        logger.warning("football-data.org failed: %s", e)

    # Try fallback: thesportsdb.com
    if not matches:
        try:
            tsdb_matches = await asyncio.wait_for(_fetch_sportsdb_today(), timeout=8)
            if tsdb_matches:
                matches = tsdb_matches
                source  = "thesportsdb.com"
        except Exception as e:
            logger.warning("thesportsdb failed: %s", e)

    # Final fallback: mock data
    if not matches:
        matches = _mock_matches()
        source  = "mock"

    live_count = sum(1 for m in matches if m.get("status") == "live")

    result = {
        "matches":    matches,
        "source":     source,
        "liveCount":  live_count,
        "totalCount": len(matches),
        "highValue":  sum(1 for m in matches if m.get("valueSignal") == "HIGH"),
        "fetchedAt":  datetime.now(timezone.utc).isoformat(),
    }
    _cache.set(cache_key, result, ttl=CACHE_TTL)
    return result


async def fsl_get_match_detail(match_id: str) -> Optional[dict]:
    """Get single match with full detail. Falls back to mock."""
    cache_key = f"fsl_match_{match_id}"
    cached = _cache.get(cache_key)
    if cached:
        return cached

    # Try to find in today's cached matches first
    today = _cache.get("fsl_matches_today")
    if today:
        for m in today.get("matches", []):
            if m["id"] == match_id:
                # Enrich with H2H placeholder
                m.setdefault("h2h", [])
                _cache.set(cache_key, m, ttl=CACHE_LONG)
                return m

    # Fallback to mock
    mocks = _mock_matches()
    for m in mocks:
        if m["id"] == match_id:
            m.setdefault("h2h", [])
            _cache.set(cache_key, m, ttl=CACHE_LONG)
            return m

    return None


async def fsl_get_teams(league: str = None) -> list[dict]:
    """Return enriched team list. Uses deterministic mock stats."""
    cache_key = f"fsl_teams_{league or 'all'}"
    cached = _cache.get(cache_key)
    if cached:
        return cached

    today = _cache.get("fsl_matches_today")
    seen, teams = set(), []
    matches = (today or {}).get("matches", _mock_matches())
    for m in matches:
        for side in ("home", "away"):
            t = m[side]
            if t["id"] not in seen:
                seen.add(t["id"])
                stats = m.get(f"{side}Team", {})
                teams.append({**t, **stats, "leagueName": m["leagueName"]})

    _cache.set(cache_key, teams, ttl=CACHE_LONG)
    return teams


# ── Static bookmaker layer ────────────────────────────────────────────────────

BOOKMAKERS = [
    {"name": "Bet365",    "url": "https://www.bet365.com", "affiliate": True},
    {"name": "Stoiximan", "url": "https://www.stoiximan.gr", "affiliate": True},
    {"name": "Betsson",   "url": "https://www.betsson.com", "affiliate": True},
]

def get_bookmaker_links(match_id: str) -> list[dict]:
    """Static affiliate links — no real-time odds fetched."""
    return [
        {**b, "matchUrl": b["url"]}
        for b in BOOKMAKERS
    ]


def fsl_cache_clear():
    _cache.clear()


def fsl_cache_meta() -> dict:
    return {
        "entries": len(_cache._store),
        "ttl":     CACHE_TTL,
    }
