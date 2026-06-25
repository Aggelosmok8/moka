"""Sports routes with Free/Pro access control."""
from fastapi import APIRouter, Depends, HTTPException, Query

from auth_utils import get_current_user
from services import subscription_service, sports_service

router = APIRouter(prefix="/api/sports", tags=["sports"])


def _is_pro(user: dict) -> bool:
    return subscription_service.compute_status(user)["is_pro"]


def _league_locked(sport: str, pro: bool) -> bool:
    if pro:
        return False
    return sport not in sports_service.FREE_LEAGUE_KEYS


@router.get("/leagues")
async def leagues(user: dict = Depends(get_current_user)):
    pro = _is_pro(user)
    items = sports_service.list_leagues()
    for it in items:
        it["locked"] = _league_locked(it["key"], pro)
    return {"leagues": items, "is_pro": pro}


@router.get("/matches")
async def matches(sport: str = Query(...), user: dict = Depends(get_current_user)):
    pro = _is_pro(user)
    if _league_locked(sport, pro):
        raise HTTPException(status_code=403, detail="This league requires Pro access")
    raw = await sports_service.get_matches(sport)
    enriched = []
    scores = await sports_service.get_scores(sport)
    for m in raw:
        info = scores.get(m["id"])
        status = sports_service.derive_status(m.get("commence_time", ""), info)
        enriched.append({
            **m, "status": status,
            "home_score": (info or {}).get("scores", {}).get(m.get("home_team")),
            "away_score": (info or {}).get("scores", {}).get(m.get("away_team")),
        })
    # Free users on free leagues still get limited visibility
    if not pro:
        enriched = enriched[:8]
    return {"matches": enriched, "is_pro": pro}


@router.get("/odds")
async def odds(sport: str = Query(...), event_id: str = Query(...), user: dict = Depends(get_current_user)):
    if not _is_pro(user):
        raise HTTPException(status_code=403, detail="Odds data is a Pro feature")
    return await sports_service.get_event_odds(sport, event_id)


@router.get("/teams")
async def teams(sport: str = Query(...), user: dict = Depends(get_current_user)):
    pro = _is_pro(user)
    if _league_locked(sport, pro):
        raise HTTPException(status_code=403, detail="This league requires Pro access")
    data = await sports_service.get_teams(sport)
    return {"teams": data, "is_pro": pro}


@router.get("/players")
async def players(sport: str = Query(...), team: str = Query(...), user: dict = Depends(get_current_user)):
    pro = _is_pro(user)
    data = await sports_service.get_players(sport, team)
    if not pro:
        # partial visibility for free users
        full = data["players"]
        data["players"] = full[:3]
        data["locked_count"] = max(0, len(full) - 3)
        data["is_pro"] = False
    else:
        data["locked_count"] = 0
        data["is_pro"] = True
    return data
