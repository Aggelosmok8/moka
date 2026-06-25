"""Odds service: fetches per-league odds from The Odds API, caches them, and
extracts a top-N bookmaker price per outcome for a specific fixture.
"""
import logging
import re
import unicodedata
from typing import Optional

from cache import TTLCache
import the_odds_api as oa
from the_odds_api import OddsApiError, OddsQuotaExceeded, SPORT_KEYS

logger = logging.getLogger(__name__)

TTL_ODDS = 12 * 3600  # 12 hours — free plan friendly (500 req/month)


def _norm(name: str) -> str:
    """Normalize team names for fuzzy matching."""
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", name).encode("ASCII", "ignore").decode().lower()
    # Drop common suffixes/prefixes
    for token in (" fc", " cf", " ac", " sc", " bc", " ssc", " cd", " rc", " af", " 1893", " 1899", " 1900"):
        s = s.replace(token, "")
    s = re.sub(r"[^a-z0-9]", "", s)
    return s


# Manual alias map for known mismatches between API-Football and The Odds API
ALIASES = {
    "manchestercity": "mancity",
    "manchesterunited": "manunited",
    "atleticomadrid": "atletico",
    "rbleipzig": "leipzig",
    "newcastle": "newcastleunited",
    "wolverhampton": "wolves",
    "parissg": "psg",
    "parissaintgermain": "psg",
    "olympiquemarseille": "marseille",
    "olympiquelyonnais": "lyon",
    "asmonaco": "monaco",
    "internazionale": "inter",
    "intermilan": "inter",
    "acmilan": "milan",
    "asroma": "roma",
    "sslazio": "lazio",
    "ssclapoli": "napoli",
    "bayernmunchen": "bayern",
    "bayernmunich": "bayern",
    "borussiadortmund": "dortmund",
    "borussia": "dortmund",
    "bayerleverkusen": "leverkusen",
    "vflstuttgart": "stuttgart",
    "eintrachtfrankfurt": "frankfurt",
    "realsociedad": "sociedad",
    "athleticclub": "athleticbilbao",
    "celtavigo": "celta",
}


def _match_key(name: str) -> str:
    n = _norm(name)
    return ALIASES.get(n, n)


class OddsService:
    def __init__(self, db):
        self.cache = TTLCache(db, collection="odds_cache")
        self._initialized = False

    async def ensure(self):
        if not self._initialized:
            await self.cache.ensure_indexes()
            self._initialized = True

    async def _league_odds(self, league_slug: str) -> tuple[list, Optional[dict]]:
        sport = SPORT_KEYS.get(league_slug)
        if not sport:
            return [], None
        cache_key = f"odds:{sport}"
        cached = await self.cache.get(cache_key)
        if cached is not None:
            return cached.get("events", []), cached.get("quota")
        try:
            events, quota = await oa.league_odds(sport)
            payload = {"events": events, "quota": quota}
            await self.cache.set(cache_key, payload, TTL_ODDS)
            return events, quota
        except OddsQuotaExceeded:
            logger.warning("Odds quota exceeded for %s", sport)
            stale = await self.cache.get_stale(cache_key)
            if stale:
                return stale.get("events", []), stale.get("quota")
            return [], None
        except OddsApiError as exc:
            logger.warning("Odds API error %s: %s", sport, exc)
            stale = await self.cache.get_stale(cache_key)
            if stale:
                return stale.get("events", []), stale.get("quota")
            return [], None

    async def odds_for_match(
        self,
        league_slug: str,
        home_name: str,
        away_name: str,
        top_n: int = 3,
        predicted: Optional[dict] = None,
    ) -> dict:
        """Return top-N bookmaker prices per outcome for a fixture.

        Shape:
        {
          "available": bool,
          "event_found": bool,
          "commence_time": iso str | null,
          "bookmakers_count": int,
          "markets": {
            "h2h":     [{"label": "Home", "top": [{"book":"bet365","price":2.10}, ...]}, {label:"Draw",...}, {label:"Away",...}],
            "over25":  {"top":[...]},
            "under25": {"top":[...]}
          },
          "quota": {"remaining": int, "used": int},
        }
        """
        await self.ensure()
        events, quota = await self._league_odds(league_slug)
        result = {
            "available": bool(events),
            "event_found": False,
            "commence_time": None,
            "bookmakers_count": 0,
            "markets": {},
            "quota": quota,
        }
        if not events:
            return result

        # Fuzzy match the event
        hk = _match_key(home_name)
        ak = _match_key(away_name)

        def event_score(ev):
            eh = _match_key(ev.get("home_team", ""))
            ea = _match_key(ev.get("away_team", ""))
            # match if both team keys are substrings either way (handles minor diffs)
            home_ok = hk in eh or eh in hk
            away_ok = ak in ea or ea in ak
            return (home_ok and away_ok)

        match_event = next((ev for ev in events if event_score(ev)), None)
        if not match_event:
            return result

        result["event_found"] = True
        result["commence_time"] = match_event.get("commence_time")
        bookmakers = match_event.get("bookmakers") or []
        result["bookmakers_count"] = len(bookmakers)

        # Group all (book, price) tuples per outcome (de-duplicated per book per outcome — keep best price)
        h2h_outcomes: dict[str, dict[str, float]] = {}
        totals_over: dict[str, float] = {}
        totals_under: dict[str, float] = {}
        for bk in bookmakers:
            book_title = bk.get("title") or bk.get("key") or "Unknown"
            for m in bk.get("markets") or []:
                k = m.get("key")
                outs = m.get("outcomes") or []
                if k == "h2h":
                    for o in outs:
                        outcome_label = self._classify_h2h(
                            o.get("name", ""),
                            match_event.get("home_team", ""),
                            match_event.get("away_team", ""),
                        )
                        if outcome_label:
                            price = float(o.get("price", 0) or 0)
                            bucket = h2h_outcomes.setdefault(outcome_label, {})
                            if price > bucket.get(book_title, 0):
                                bucket[book_title] = price
                elif k == "totals":
                    for o in outs:
                        point = o.get("point")
                        if point is None or abs(float(point) - 2.5) > 0.01:
                            continue
                        side = (o.get("name") or "").lower()
                        price = float(o.get("price", 0) or 0)
                        if side == "over":
                            if price > totals_over.get(book_title, 0):
                                totals_over[book_title] = price
                        elif side == "under":
                            if price > totals_under.get(book_title, 0):
                                totals_under[book_title] = price

        def _value_for(label: str, price: float) -> Optional[float]:
            """edge% = our predicted% - implied bookie%. Positive = value."""
            if not predicted or price <= 1.0:
                return None
            implied = (1.0 / price) * 100.0
            our = predicted.get(label)
            if our is None:
                return None
            return round(our - implied, 1)

        h2h_view = []
        for label in ("home", "draw", "away"):
            rows = [{"book": b, "price": p} for b, p in h2h_outcomes.get(label, {}).items()]
            rows.sort(key=lambda r: -r["price"])
            rows = rows[:top_n]
            for r in rows:
                edge = _value_for(label, r["price"])
                if edge is not None:
                    r["edge"] = edge
                    r["value"] = edge >= 5.0
            if rows:
                h2h_view.append({"label": label, "top": rows})
        if h2h_view:
            result["markets"]["h2h"] = h2h_view

        def _tops(d):
            rows = [{"book": b, "price": p} for b, p in d.items()]
            rows.sort(key=lambda r: -r["price"])
            return rows[:top_n]

        if totals_over:
            result["markets"]["over25"] = {"top": _tops(totals_over)}
        if totals_under:
            result["markets"]["under25"] = {"top": _tops(totals_under)}

        return result

    @staticmethod
    def _classify_h2h(outcome_name: str, home_team: str, away_team: str) -> Optional[str]:
        n = _norm(outcome_name)
        if n == "draw":
            return "draw"
        h = _norm(home_team)
        a = _norm(away_team)
        if n == h or n in h or h in n:
            return "home"
        if n == a or n in a or a in n:
            return "away"
        return None
