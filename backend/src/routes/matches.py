"""GET /api/matches and GET /api/matches/{id}."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..data.mock_matches import MATCH_INDEX, MOCK_MATCHES
from ..services.value_engine import evaluate_match, public_match

router = APIRouter(prefix="/api", tags=["matches"])


@router.get("/matches")
async def list_matches():
    items = []
    for m in MOCK_MATCHES:
        pm = public_match(m)
        pm["value"] = evaluate_match(m)
        items.append(pm)
    return {"count": len(items), "matches": items}


@router.get("/matches/{match_id}")
async def get_match(match_id: str):
    m = MATCH_INDEX.get(match_id)
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    pm = public_match(m)
    pm["value"] = evaluate_match(m)
    return pm
