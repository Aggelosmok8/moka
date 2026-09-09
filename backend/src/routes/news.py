"""News routes (TheNewsAPI, cached)."""
from __future__ import annotations

from fastapi import APIRouter

import news_service

router = APIRouter(prefix="/api", tags=["news"])


@router.get("/news")
async def get_news(q: str = "", league: str = "", team: str = "", date: str = "", page: int = 1):
    """Sports news with optional league/team/date filters (all combine).

    Cached 30 min to respect the news provider's free-tier limits.
    """
    search = news_service.build_search(team=team, league=league, q=q)
    return await news_service.fetch_feed(search=search, published_on=(date or ""), pages=4)
