"""Match Chart routes: persist a user's tracked matches and serve them with live data."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from db import db, now_utc
from auth_utils import get_current_user
from services import sports_service

router = APIRouter(prefix="/api/chart", tags=["chart"])

MAX_TRACKED = 12


class TrackInput(BaseModel):
    match_id: str
    sport: str
    home_team: str
    away_team: str
    commence_time: str | None = None
    league: str | None = None


@router.get("")
async def list_tracked(user: dict = Depends(get_current_user)):
    docs = await db.tracked_matches.find({"user_id": user["id"]}, {"_id": 0}).to_list(MAX_TRACKED)
    scores_cache: dict = {}
    out = []
    for d in docs:
        sport = d["sport"]
        if sport not in scores_cache:
            scores_cache[sport] = await sports_service.get_scores(sport)
        info = scores_cache[sport].get(d["match_id"])
        status = sports_service.derive_status(d.get("commence_time", "") or "", info)
        out.append({
            **d,
            "status": status,
            "home_score": (info or {}).get("scores", {}).get(d.get("home_team")),
            "away_score": (info or {}).get("scores", {}).get(d.get("away_team")),
        })
    return {"tracked": out}


@router.post("")
async def add_tracked(body: TrackInput, user: dict = Depends(get_current_user)):
    count = await db.tracked_matches.count_documents({"user_id": user["id"]})
    if count >= MAX_TRACKED:
        raise HTTPException(status_code=400, detail=f"You can track up to {MAX_TRACKED} matches")
    existing = await db.tracked_matches.find_one({"user_id": user["id"], "match_id": body.match_id})
    if existing:
        return {"ok": True, "already": True}
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "added_at": now_utc().isoformat(),
        **body.model_dump(),
    }
    await db.tracked_matches.insert_one(doc)
    return {"ok": True}


@router.delete("/{match_id}")
async def remove_tracked(match_id: str, user: dict = Depends(get_current_user)):
    await db.tracked_matches.delete_one({"user_id": user["id"], "match_id": match_id})
    return {"ok": True}
