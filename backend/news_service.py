"""Moka news integration (TheNewsAPI).

Server-side only. The API token comes from THENEWSAPI_TOKEN. Results are cached
(reusing apifootball's in-memory cache) because the free tier is limited to
~100 requests/day and 3 articles per request, so we must avoid duplicate calls.
"""
from __future__ import annotations

import logging
import os

import httpx

import apifootball as af

logger = logging.getLogger("moka.news")

BASE = "https://api.thenewsapi.com/v1/news/all"
GR_BASE = "https://freenewsapi.ai/v1/search"
CACHE_TTL = 30 * 60  # 30 minutes

# Dedicated Greek sports domains — articles from these are always kept.
GR_SPORTS_HOSTS = {
    "gazzetta.gr", "sdna.gr", "onsports.gr", "sport24.gr", "sport-fm.gr",
    "novasports.gr", "contra.gr", "sportime.gr", "ole.gr", "goalpost.gr",
    "sportstonoto.gr", "sportdog.gr", "redgoal.gr", "footballleague.gr",
    "gazzetta", "sport.gr", "sportday.gr", "bwinsports.gr", "sport-news.gr",
    "sportfm.gr", "nova.gr", "gigasport.gr", "sportfoot.gr",
}

# Betting/promo hosts we never want in the news feed.
GR_BLOCK_HOSTS = {"hellasbet.com", "novibet.gr", "stoiximan.gr", "bet365.com"}

# Sports keywords (accent-insensitive substrings). Keep an article from a
# general site only if its text clearly concerns football/basketball.
GR_SPORTS_KW = (
    "ποδοσφαιρ", "μπασκετ", "γκολ", "προπονητ", "μεταγραφ", "πρωταθλημα",
    "super league", "superleague", "euroleague", "champions league", "europa league",
    "conference league", "μπασκετικ", "ποδοσφαιρικ", "γηπεδο", "στοιχημα",
    "ολυμπιακ", "παναθηναικ", "παοκ", "αεκ", "οφη", "αρης ", "παναιτωλικ",
    "λεβαδειακ", "ατρομητ", "παναθλητικ", "βολος", "καλλιθεα", "λαμια",
    "νιου μπι", "asteras", "αστερας", "premier league", "la liga",
    "serie a", "bundesliga", "nba", "φιλικο", "φιλικ ", "ημιχρονο",
    "τερμα", "προημιτελ", "ημιτελ", "τελικος", "σεντερ φορ", "ρεμπαουντ",
    "κοουτς", "εθνικη ομαδα", "φαση εργων",
)


def _strip_accents(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


# Boilerplate that marks tag/index/navigation pages rather than real articles.
GR_JUNK_MARKERS = (
    "διαβαστε ολα τα αρθρα",  # "read all articles about topic" tag pages
    "ολα τα νεα για",
    "❮",  # breadcrumb/nav pages
    "ποδοσφαιρο μπασκετ βιντεο",  # site menu dump
    "matchzone προγραμμα tv",
)


def _looks_like_junk(article: dict) -> bool:
    title = (article.get("title") or "").strip()
    desc = _strip_accents((article.get("description") or "").lower())
    if not title or len(title) < 5:
        return True
    if any(m in desc for m in GR_JUNK_MARKERS):
        return True
    # Real article descriptions carry substance; tag pages are short/empty.
    if len(desc) < 25:
        return True
    return False


def _is_sports_gr(article: dict) -> bool:
    host = (article.get("source") or article.get("host") or "").lower().replace("www.", "").strip()
    if host in GR_BLOCK_HOSTS:
        return False
    if _looks_like_junk(article):
        return False
    if host in GR_SPORTS_HOSTS:
        return True
    text = _strip_accents(f"{article.get('title') or ''} {article.get('description') or ''}".lower())
    return any(kw in text for kw in GR_SPORTS_KW)


async def freenews_gr(query: str = "", size: int = 12) -> dict:
    """Greek-language news from freenewsapi.ai (no key). Cached. Filtered to
    sports-only (sports domains or football/basketball keywords) so no general
    news leaks into the feed. Used for the Greek News feed and as extra
    pre-match context (injuries/lineups in Greek)."""
    ck = f"grnews_{query}_{size}"
    hit = af._c_get(ck)
    if hit is not None:
        return hit
    # Fetch the latest Greek feed and filter down to sports (a sports-biased
    # query mostly surfaces low-value tag pages, so we filter instead).
    fetch_size = min(max(size * 8, 60), 100)
    params = {"country": "gr", "size": fetch_size}
    if query and query.strip():
        params["q"] = query.strip()
    out = {"articles": [], "meta": {"source": "freenewsapi", "lang": "el"}}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(GR_BASE, params=params)
            r.raise_for_status()
            d = r.json()
        for a in d.get("results") or []:
            src = a.get("source")
            if isinstance(src, dict):
                src = src.get("name")
            item = {
                "id": a.get("id") or a.get("url"),
                "title": a.get("title"),
                "description": a.get("description"),
                "snippet": a.get("description"),
                "url": a.get("url"),
                "image": a.get("image") or a.get("image_url") or a.get("thumbnail"),
                "source": src or a.get("host"),
                "publishedAt": a.get("published_at") or a.get("date") or a.get("published"),
                "categories": [],
            }
            if _is_sports_gr({**item, "host": a.get("host")}):
                out["articles"].append(item)
            if len(out["articles"]) >= size:
                break
    except Exception as e:
        logger.warning("news_service.freenews_gr failed: %s", e)
        out["meta"] = {"error": True}
    af._c_set(ck, out, ttl=CACHE_TTL)
    return out


def _token() -> str | None:
    return os.environ.get("THENEWSAPI_TOKEN")


def _term(x: str) -> str:
    x = (x or "").strip()
    if not x:
        return ""
    return f'+"{x}"' if " " in x else f"+{x}"


# Disambiguate league names that collide with other countries' competitions.
LEAGUE_SEARCH_MAP = {
    "Super League": '+"Greek Super League" | +"Superleague Greece"',
    "Championship": '+"EFL Championship"',
    "Premier League": '+"Premier League" +England',
    "Premiership (Scotland)": '+"Scottish Premiership"',
    "Eredivisie": "+Eredivisie",
    "Primeira Liga": '+"Primeira Liga"',
}


def build_search(team: str = "", league: str = "", q: str = "") -> str:
    """AND the provided filters so they work together (#17). Only football/basketball
    news is surfaced (categories=sports on the API + a sport keyword when no team)."""
    parts = []
    if team and team.strip():
        parts.append(_term(team))
    if league and league.strip():
        parts.append(LEAGUE_SEARCH_MAP.get(league.strip(), _term(league)))
    if q and q.strip():
        parts.append(_term(q))
    base = " ".join(p for p in parts if p)
    if not base:
        # Generic feed: keep it strictly football/basketball.
        return "+football | +soccer | +basketball"
    return base


async def match_news(home: str = "", away: str = "", limit: int = 3) -> list:
    """Recent news for a specific match (either team). Cached via fetch_news."""
    parts = [_term(p) for p in (home, away) if p and p.strip()]
    if not parts:
        return []
    search = " | ".join(parts)
    res = await fetch_news(search=search, limit=limit)
    out = []
    for a in res.get("articles") or []:
        out.append({
            "title": a.get("title"),
            "source": a.get("source"),
            "published": a.get("publishedAt"),
            "snippet": (a.get("snippet") or a.get("description") or "")[:200],
        })
    # Add Greek coverage (injuries/lineups often first in Greek press) as context.
    try:
        gr = await freenews_gr(query=(home or away), size=4)
        for a in gr.get("articles") or []:
            out.append({
                "title": a.get("title"),
                "source": a.get("source"),
                "published": a.get("publishedAt"),
                "snippet": (a.get("snippet") or a.get("description") or "")[:200],
            })
    except Exception as e:
        logger.warning("match_news greek: %s", e)
    return out


async def fetch_feed(search: str = "", published_on: str = "", pages: int = 4, limit: int = 3) -> dict:
    """Aggregate several pages into one feed so the News tab shows enough
    articles (the free tier caps each request at 3). Each page is cached
    individually via fetch_news, so re-loads cost nothing."""
    articles: list = []
    seen: set = set()
    meta: dict = {}
    for p in range(1, max(1, pages) + 1):
        res = await fetch_news(search=search, published_on=published_on, page=p, limit=limit)
        meta = res.get("meta") or meta
        page_articles = res.get("articles") or []
        for a in page_articles:
            key = a.get("id") or a.get("url") or a.get("title")
            if key and key not in seen:
                seen.add(key)
                articles.append(a)
        if len(page_articles) < limit:
            break  # no more results, stop paginating
    return {"articles": articles, "meta": meta}


async def fetch_news(search: str = "", published_on: str = "", page: int = 1, limit: int = 3) -> dict:
    token = _token()
    if not token:
        return {"articles": [], "meta": {"error": "no_key"}}

    ck = f"news_{search}_{published_on}_{page}_{limit}"
    hit = af._c_get(ck)
    if hit is not None:
        return hit

    params = {
        "api_token": token,
        "language": "en",
        "categories": "sports",
        "limit": limit,
        "page": page,
    }
    if search:
        params["search"] = search
    if published_on:
        params["published_on"] = published_on

    out = {"articles": [], "meta": {}}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(BASE, params=params)
            r.raise_for_status()
            d = r.json()
        out["meta"] = d.get("meta") or {}
        for a in d.get("data") or []:
            out["articles"].append({
                "id": a.get("uuid"),
                "title": a.get("title"),
                "description": a.get("description") or a.get("snippet"),
                "snippet": a.get("snippet"),
                "url": a.get("url"),
                "image": a.get("image_url"),
                "source": a.get("source"),
                "publishedAt": a.get("published_at"),
                "categories": a.get("categories") or [],
            })
    except Exception as e:
        logger.warning("news_service.fetch_news failed: %s", e)
        out["meta"] = {"error": True}

    af._c_set(ck, out, ttl=CACHE_TTL)
    return out
