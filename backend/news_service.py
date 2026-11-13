"""Moka news integration (TheNewsAPI).

Server-side only. The API token comes from THENEWSAPI_TOKEN. Results are cached
(reusing apifootball's in-memory cache) because the free tier is limited to
~100 requests/day and 3 articles per request, so we must avoid duplicate calls.
"""
from __future__ import annotations

import logging
import os
import re

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


# Free Greek sports RSS feeds (no API key, no quota).
GR_RSS_FEEDS = (
    ("gazzetta.gr", "https://www.gazzetta.gr/rss"),
    ("sportime.gr", "https://www.sportime.gr/feed/"),
    ("sdna.gr", "https://www.sdna.gr/rss.xml"),
    ("in.gr", "https://www.in.gr/sports/feed/"),
)


def _rss_items(xml_text: str, host: str) -> list:
    import xml.etree.ElementTree as ET
    ns = {"media": "http://search.yahoo.com/mrss/", "content": "http://purl.org/rss/1.0/modules/content/"}
    items = []
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return items
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        if not title or not link:
            continue
        desc = (it.findtext("description") or "").strip()
        desc = re.sub(r"<[^>]+>", " ", desc)
        desc = re.sub(r"\s+", " ", desc).strip()
        image = None
        mc = it.find("media:content", ns)
        if mc is not None:
            image = mc.get("url")
        if not image:
            enc = it.find("enclosure")
            if enc is not None:
                image = enc.get("url")
        if not image:
            html = it.findtext("{http://purl.org/rss/1.0/modules/content/}encoded") or ""
            m = re.search(r'<img[^>]+src="([^"]+)"', html)
            if m:
                image = m.group(1)
        items.append({
            "id": link,
            "title": title,
            "description": desc,
            "snippet": desc,
            "url": link,
            "image": image,
            "source": host,
            "publishedAt": (it.findtext("pubDate") or "").strip(),
            "categories": [],
        })
    return items


async def freenews_gr(query: str = "", size: int = 12) -> dict:
    """Greek-language sports news aggregated from free Greek sports RSS feeds.

    No API key or quota is involved. Results are cached 30 min and filtered so
    only football/basketball items reach the feed. Used for the Greek News feed
    and as extra pre-match context (injuries/lineups in Greek).
    """
    ck = f"grnews_rss_{query}_{size}"
    hit = af._c_get(ck)
    if hit is not None:
        return hit

    raw: list = []
    headers = {"User-Agent": "Mozilla/5.0 (compatible; LionStatsBot/1.0)"}
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True, headers=headers) as client:
            import asyncio
            results = await asyncio.gather(
                *[client.get(url) for _, url in GR_RSS_FEEDS], return_exceptions=True
            )
        for (host, _url), res in zip(GR_RSS_FEEDS, results):
            if isinstance(res, Exception) or res.status_code >= 400:
                continue
            raw.extend(_rss_items(res.text, host))
    except Exception as e:
        logger.warning("news_service.freenews_gr failed: %s", e)

    needle = _strip_accents((query or "").lower()).strip()
    out = {"articles": [], "meta": {"source": "gr_rss", "lang": "el", "feeds": len(GR_RSS_FEEDS)}}
    seen: set = set()
    matched: list = []
    others: list = []
    for item in raw:
        if item["url"] in seen:
            continue
        seen.add(item["url"])
        url_l = item["url"].lower()
        sporty_path = any(k in url_l for k in (
            "/football", "/basketball", "/sport", "/super-league", "/superleague",
            "/euroleague", "/champions", "/stoixima", "/volley", "/tennis", "/nba",
        ))
        text_all = _strip_accents(f"{item['title']} {item['description']}".lower())
        kw_hit = any(k in text_all for k in GR_SPORTS_KW)
        if not sporty_path and not kw_hit:
            continue
        text = _strip_accents(f"{item['title']} {item['description']}".lower())
        if needle and all(w in text for w in needle.split() if len(w) > 2):
            matched.append(item)
        else:
            others.append(item)
    # Interleave sources so one fast feed does not dominate the page.
    def _mix(items: list) -> list:
        buckets: dict = {}
        for it in items:
            buckets.setdefault(it["source"], []).append(it)
        mixed = []
        while any(buckets.values()):
            for host in list(buckets):
                if buckets[host]:
                    mixed.append(buckets[host].pop(0))
        return mixed

    out["articles"] = (_mix(matched) + _mix(others))[:size]
    if not out["articles"]:
        out["meta"]["error"] = True
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
