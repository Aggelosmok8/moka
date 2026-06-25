"""Lightweight analytics — POST /api/events stores an event row in SQLite."""
import logging
from datetime import datetime, timezone
from typing import Optional, Any

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

ALLOWED_EVENTS = {
    "page_view",
    "login_success",
    "pricing_view",
    "checkout_click",
    "subscription_success",
}


class EventBody(BaseModel):
    name: str = Field(..., max_length=64)
    properties: dict[str, Any] = Field(default_factory=dict)


def make_analytics_router(db, current_user_optional) -> APIRouter:
    router = APIRouter(prefix="/api/events")

    @router.post("")
    async def track_event(body: EventBody, request: Request, user=Depends(current_user_optional)):
        if body.name not in ALLOWED_EVENTS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown event '{body.name}'. Allowed: {sorted(ALLOWED_EVENTS)}",
            )
        import json
        doc = {
            "name": body.name,
            "properties": json.dumps(body.properties or {}),
            "user_id": user.user_id if user else None,
            "is_pro": int(bool(user and user.is_pro)),
            "ua": request.headers.get("user-agent", "")[:200],
            "ip": (request.client.host if request.client else None),
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        await db.events.insert_one(doc)
        logger.info("[event] %s user=%s", doc["name"], doc["user_id"])
        return {"ok": True}

    @router.get("/recent")
    async def recent_events(limit: int = 50):
        items = []
        async for doc in await db.events.find({}).sort("ts", -1).limit(min(limit, 200)):
            items.append(doc)
        return {"items": items}

    return router
