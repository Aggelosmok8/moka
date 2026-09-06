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


@router.get("/matches/trending")
async def trending_matches():
    """Live/trending feed for the global search palette.

    Declared before /matches/{match_id} so the literal 'trending' path is not
    captured as a match_id (this router is mounted before the FSL api_router).
    """
    from football_service_layer import fsl_get_matches, _mock_matches
    try:
        r = await fsl_get_matches()
        return {"matches": r["matches"], "source": r["source"], "meta": {
            "liveCount": r["liveCount"], "totalCount": r["totalCount"],
            "highValue": r["highValue"], "fetchedAt": r["fetchedAt"],
        }}
    except Exception:
        return {"matches": _mock_matches(), "source": "mock", "meta": {}}


async def _resolve_match(match_id: str):
    m = MATCH_INDEX.get(match_id)
    if not m:
        # live matches are not in the mock index
        try:
            import live_values
            live = await live_values.build_live_matches()
            m = next((x for x in live if x.get("id") == match_id), None)
        except Exception:
            m = None
    return m


@router.get("/matches/{match_id}")
async def get_match(match_id: str):
    m = await _resolve_match(match_id)
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    pm = public_match(m)
    pm["value"] = evaluate_match(m)
    return pm


@router.get("/matches/{match_id}/ai-analysis")
async def get_match_ai_analysis(match_id: str):
    """Natural-language Moka analysis (GPT-5.6 Luna), cached per match+data."""
    m = await _resolve_match(match_id)
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    value = evaluate_match(m)
    pm = public_match(m)
    import ai_analysis
    return await ai_analysis.match_analysis(pm, value)
