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
    # Greek sports articles first (priority), then the English feed appended.
    search = news_service.build_search(team=team, league=league, q=q)
    en = await news_service.fetch_feed(search=search, published_on=(date or ""), pages=4)
    gr_query = " ".join(x for x in (team, league, q) if x and x.strip()).strip()
    gr = await news_service.freenews_gr(query=gr_query, size=12)
    articles = list(gr.get("articles") or [])
    seen = {a.get("id") or a.get("url") for a in articles}
    for a in en.get("articles") or []:
        key = a.get("id") or a.get("url")
        if key and key not in seen:
            seen.add(key)
            articles.append(a)
    return {"articles": articles, "meta": en.get("meta") or {}}
