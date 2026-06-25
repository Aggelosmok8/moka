"""Sports data service.

Primary live source: The Odds API (real data, aggressively cached).
API-Football / API-Basketball are wired for matches/teams/players but their keys are
currently suspended, so those calls fall back gracefully. All responses are cached to
minimise external calls and cost.
"""
import os
import requests
import logging
from datetime import datetime, timezone

from db import cached_fetch

logger = logging.getLogger(__name__)

ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "")
ODDS_BASE = "https://api.the-odds-api.com/v4"

# Leagues we surface in the UI (keys are Odds API sport keys).
FEATURED_LEAGUES = [
    {"key": "soccer_epl", "title": "Premier League", "group": "Soccer", "country": "England"},
    {"key": "soccer_spain_la_liga", "title": "La Liga", "group": "Soccer", "country": "Spain"},
    {"key": "soccer_italy_serie_a", "title": "Serie A", "group": "Soccer", "country": "Italy"},
    {"key": "soccer_germany_bundesliga", "title": "Bundesliga", "group": "Soccer", "country": "Germany"},
    {"key": "soccer_france_ligue_one", "title": "Ligue 1", "group": "Soccer", "country": "France"},
    {"key": "soccer_uefa_champs_league", "title": "Champions League", "group": "Soccer", "country": "Europe"},
    {"key": "basketball_nba", "title": "NBA", "group": "Basketball", "country": "USA"},
    {"key": "basketball_euroleague", "title": "EuroLeague", "group": "Basketball", "country": "Europe"},
    {"key": "americanfootball_nfl", "title": "NFL", "group": "American Football", "country": "USA"},
]

# Free-tier unlocked leagues. Everything else requires Pro.
FREE_LEAGUE_KEYS = {"soccer_epl", "basketball_nba"}

LEAGUE_TITLE = {l["key"]: l["title"] for l in FEATURED_LEAGUES}


def _get(url: str, params: dict):
    try:
        r = requests.get(url, params=params, timeout=20)
        if r.status_code != 200:
            logger.warning("Odds API %s -> %s %s", url, r.status_code, r.text[:200])
            return []
        return r.json()
    except Exception as e:
        logger.error("Odds API error %s: %s", url, e)
        return []


# ---------- Leagues ----------
def list_leagues() -> list:
    return [dict(l, free=l["key"] in FREE_LEAGUE_KEYS) for l in FEATURED_LEAGUES]


# ---------- Matches (events) ----------
async def get_matches(sport: str) -> list:
    def fetch():
        data = _get(f"{ODDS_BASE}/sports/{sport}/events", {"apiKey": ODDS_API_KEY})
        out = []
        for e in data or []:
            out.append({
                "id": e.get("id"),
                "sport": sport,
                "league": LEAGUE_TITLE.get(sport, sport),
                "home_team": e.get("home_team"),
                "away_team": e.get("away_team"),
                "commence_time": e.get("commence_time"),
            })
        return out

    return await cached_fetch(f"matches:{sport}", 600, fetch) or []


# ---------- Scores (live / finished) ----------
async def get_scores(sport: str) -> dict:
    def fetch():
        data = _get(f"{ODDS_BASE}/sports/{sport}/scores", {"apiKey": ODDS_API_KEY, "daysFrom": 3})
        result = {}
        for e in data or []:
            scores = {s.get("name"): s.get("score") for s in (e.get("scores") or [])}
            result[e.get("id")] = {
                "completed": e.get("completed", False),
                "scores": scores,
                "last_update": e.get("last_update"),
            }
        return result

    return await cached_fetch(f"scores:{sport}", 60, fetch) or {}


def derive_status(commence_time: str, score_info: dict | None) -> str:
    if score_info:
        if score_info.get("completed"):
            return "finished"
        if score_info.get("scores"):
            return "live"
    try:
        ct = datetime.fromisoformat(commence_time.replace("Z", "+00:00"))
        if ct <= datetime.now(timezone.utc):
            return "live"
    except Exception:
        pass
    return "scheduled"


async def enrich_match(match: dict) -> dict:
    scores = await get_scores(match["sport"])
    info = scores.get(match["id"])
    status = derive_status(match.get("commence_time", ""), info)
    return {
        **match,
        "status": status,
        "home_score": (info or {}).get("scores", {}).get(match.get("home_team")),
        "away_score": (info or {}).get("scores", {}).get(match.get("away_team")),
        "last_update": (info or {}).get("last_update"),
    }


# ---------- Odds (Pro) ----------
async def get_event_odds(sport: str, event_id: str) -> dict:
    def fetch():
        data = _get(
            f"{ODDS_BASE}/sports/{sport}/events/{event_id}/odds",
            {"apiKey": ODDS_API_KEY, "regions": "eu", "markets": "h2h", "oddsFormat": "decimal"},
        )
        if not data:
            return {}
        bookmakers = []
        for bm in (data.get("bookmakers") or [])[:6]:
            market = next((m for m in bm.get("markets", []) if m.get("key") == "h2h"), None)
            if not market:
                continue
            bookmakers.append({
                "title": bm.get("title"),
                "outcomes": [{"name": o.get("name"), "price": o.get("price")} for o in market.get("outcomes", [])],
            })
        return {
            "id": data.get("id"),
            "home_team": data.get("home_team"),
            "away_team": data.get("away_team"),
            "commence_time": data.get("commence_time"),
            "bookmakers": bookmakers,
        }

    return await cached_fetch(f"odds:{sport}:{event_id}", 300, fetch) or {}


# ---------- Teams (derived from events) ----------
async def get_teams(sport: str) -> list:
    matches = await get_matches(sport)
    names = set()
    for m in matches:
        if m.get("home_team"):
            names.add(m["home_team"])
        if m.get("away_team"):
            names.add(m["away_team"])
    teams = []
    for name in sorted(names):
        played = [m for m in matches if name in (m.get("home_team"), m.get("away_team"))]
        teams.append({
            "name": name,
            "sport": sport,
            "league": LEAGUE_TITLE.get(sport, sport),
            "upcoming_matches": len(played),
        })
    return teams


# ---------- Players (roster) ----------
# API-Football/Basketball provide full rosters; their keys are suspended, so we return a
# representative sample roster. Marked source="sample" so the UI can flag it.
_SAMPLE_FOOTBALL = ["Goalkeeper", "Right Back", "Centre Back", "Centre Back", "Left Back",
                    "Defensive Mid", "Central Mid", "Attacking Mid", "Right Wing", "Striker", "Left Wing"]
_SAMPLE_BASKET = ["Point Guard", "Shooting Guard", "Small Forward", "Power Forward", "Center"]


async def get_players(sport: str, team: str) -> dict:
    positions = _SAMPLE_BASKET if sport.startswith("basketball") else _SAMPLE_FOOTBALL
    roster = [
        {"number": i + 1, "name": f"{team} Player {i + 1}", "position": pos,
         "appearances": None, "rating": None}
        for i, pos in enumerate(positions)
    ]
    return {"team": team, "sport": sport, "source": "sample", "players": roster}
