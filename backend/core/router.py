"""FastAPI router that wires all access-control layers together.

Demonstrates the FREE/PRO architecture end-to-end and is purely additive — it
does not touch any existing endpoint. All gating decisions flow through
`FeatureGate`; data through `SportsDataProvider`; caching through `CacheBackend`
with role-aware TTL; Pro status through `SubscriptionProvider`.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from .roles import context_from_user, Role
from .entitlements import FeatureGate, Feature
from .sports_provider import get_sports_provider
from .subscriptions import get_subscription_provider
from .ai_summary import get_ai_summary_service
from .predictions import get_predictions_service
from .cache_service import get_cache_service


def make_access_router(current_user_optional):
    """Build the access router. `current_user_optional` is the existing auth
    dependency (returns the auth User or None) — injected to avoid coupling."""
    router = APIRouter(prefix="/api", tags=["access"])
    sports = get_sports_provider()
    subs = get_subscription_provider()
    ai = get_ai_summary_service()
    predictor = get_predictions_service()
    cache_service = get_cache_service()

    @router.get("/me/entitlements")
    async def my_entitlements(user=Depends(current_user_optional)):
        ctx = context_from_user(user)
        sub = subs.get_subscription(ctx.user_id or "anonymous", is_pro_hint=ctx.is_pro)
        return {
            "user_id": ctx.user_id,
            "authenticated": ctx.authenticated,
            "subscription": {"status": sub.status, "provider": sub.provider},
            "entitlements": FeatureGate.entitlements(ctx.role),
        }

    @router.get("/catalog/leagues")
    async def catalog_leagues(user=Depends(current_user_optional)):
        ctx = context_from_user(user)
        leagues = await cache_service.get_dataset(ctx.role, "leagues")  # shared, cached
        return {
            "role": ctx.role.value,
            "refresh_seconds": FeatureGate.refresh_seconds(ctx.role),
            "leagues": leagues,
        }

    @router.get("/catalog/matches")
    async def catalog_matches(league: Optional[str] = None, user=Depends(current_user_optional)):
        ctx = context_from_user(user)
        if league and not FeatureGate.can_access_league(ctx.role, league):
            raise HTTPException(status_code=402, detail="This league requires Pro.")
        matches = await cache_service.get_dataset(ctx.role, "matches")  # shared, cached
        if league:
            matches = [m for m in matches if m["leagueId"] == league]
        return {"role": ctx.role.value, "count": len(matches), "matches": matches}

    @router.get("/cache/status")
    async def cache_status():
        return cache_service.status()

    @router.post("/cache/invalidate")
    async def cache_invalidate(role: Optional[str] = None, dataset: Optional[str] = None):
        r = Role(role) if role in ("free", "pro") else None
        invalidated = cache_service.invalidate(role=r, dataset=dataset)
        return {"invalidated": invalidated, "role": role, "dataset": dataset}

    @router.get("/matches/{match_id}/summary")
    async def match_summary(match_id: str, user=Depends(current_user_optional)):
        ctx = context_from_user(user)
        if not FeatureGate.can(ctx.role, Feature.AI_SUMMARY):   # FREE feature
            raise HTTPException(status_code=402, detail="Upgrade required.")
        match = sports.get_match(match_id)
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")
        return {"match_id": match_id, **ai.summarize_match(match)}

    @router.get("/matches/{match_id}/prediction")
    async def match_prediction(match_id: str, user=Depends(current_user_optional)):
        ctx = context_from_user(user)
        if not FeatureGate.can(ctx.role, Feature.PREDICTIONS):  # PRO-only feature
            raise HTTPException(status_code=402, detail="Predictions require Pro.")
        match = sports.get_match(match_id)
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")
        return {"match_id": match_id, **predictor.predict_match(match)}

    return router
