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
CACHE_TTL = 30 * 60  # 30 minutes


def _token() -> str | None:
    return os.environ.get("THENEWSAPI_TOKEN")


def _term(x: str) -> str:
    x = (x or "").strip()
    if not x:
        return ""
    return f'+"{x}"' if " " in x else f"+{x}"


def build_search(team: str = "", league: str = "", q: str = "") -> str:
    """AND the provided filters so they work together (#17)."""
    parts = [_term(t) for t in (team, league, q) if t and t.strip()]
    return " ".join(p for p in parts if p)


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
        async with httpx.AsyncClient(timeout=15) as client:
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
