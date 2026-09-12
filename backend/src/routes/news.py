"""News routes (TheNewsAPI, cached)."""
from __future__ import annotations

from fastapi import APIRouter

import news_service

router = APIRouter(prefix="/api", tags=["news"])


@router.get("/news")
async def get_news(q: str = "", league: str = "", team: str = "", date: str = "", page: int = 1, lang: str = "en"):
    """Sports news with optional league/team/date filters (all combine).

    lang=el returns Greek-language articles (freenewsapi.ai); otherwise the
    English sports feed (TheNewsAPI). Cached 30 min to respect provider limits.
    """
    if str(lang).lower() == "el":
        query = " ".join(x for x in (team, league, q) if x and x.strip()).strip()
        return await news_service.freenews_gr(query=query, size=12)
    search = news_service.build_search(team=team, league=league, q=q)
    return await news_service.fetch_feed(search=search, published_on=(date or ""), pages=4)
