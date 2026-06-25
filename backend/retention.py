"""Retention: per-team goal-alert subscriptions + daily digest scheduler."""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)

DIGEST_HOUR_UTC = 9


def make_alerts_router(db, current_user, current_user_optional) -> APIRouter:
    router = APIRouter(prefix="/api/alerts")

    @router.get("/my")
    async def my_alerts(user=Depends(current_user)):
        items = []
        async for doc in await db.goal_alert_subs.find({"user_id": user.user_id}):
            items.append(doc)
        return {"items": items}

    @router.post("/{team_id}")
    async def subscribe(team_id: str, user=Depends(current_user)):
        now = datetime.now(timezone.utc).isoformat()
        await db.goal_alert_subs.update_one(
            {"user_id": user.user_id, "team_id": team_id},
            {"$set": {"user_id": user.user_id, "team_id": team_id, "created_at": now}},
            upsert=True,
        )
        return {"ok": True, "team_id": team_id, "subscribed": True}

    @router.delete("/{team_id}")
    async def unsubscribe(team_id: str, user=Depends(current_user)):
        await db.goal_alert_subs.delete_one({"user_id": user.user_id, "team_id": team_id})
        return {"ok": True, "team_id": team_id, "deleted": 1}

    return router


async def build_user_digest(db, user_id: str, data_service, odds_service) -> Optional[dict]:
    subs = []
    async for s in await db.goal_alert_subs.find({"user_id": user_id}):
        subs.append(s)
    if not subs:
        return None
    team_ids = {s["team_id"] for s in subs}
    trending = await data_service.trending_matches()
    relevant = [m for m in trending if m["home"]["id"] in team_ids or m["away"]["id"] in team_ids]
    if not relevant:
        return None

    value_picks = []
    for m in relevant[:5]:
        try:
            odds = await odds_service.odds_for_match(
                m["leagueId"], m["home"]["name"], m["away"]["name"],
                top_n=3, predicted=m.get("predictedStrength"),
            )
            if not odds.get("event_found"):
                continue
            for row in (odds.get("markets", {}).get("h2h") or []):
                for entry in row.get("top", []):
                    if entry.get("value"):
                        value_picks.append({
                            "match": f"{m['home']['short']} vs {m['away']['short']}",
                            "outcome": row["label"],
                            "book": entry["book"],
                            "price": entry["price"],
                            "edge": entry["edge"],
                        })
        except Exception as exc:
            logger.debug("digest odds for %s failed: %s", m["id"], exc)

    return {
        "user_id": user_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "matches": [
            {"id": m["id"], "home": m["home"]["name"], "away": m["away"]["name"]}
            for m in relevant[:10]
        ],
        "value_picks": value_picks[:5],
    }


async def _run_daily_digest(db, data_service, odds_service):
    """Run digest for all users with alert subscriptions."""
    today = datetime.now(timezone.utc).date().isoformat()
    user_ids = set()
    async for sub in await db.goal_alert_subs.find({}):
        user_ids.add(sub["user_id"])

    for user_id in user_ids:
        existing = await db.digest_log.find_one({"user_id": user_id, "day": today})
        if existing:
            continue
        try:
            digest = await build_user_digest(db, user_id, data_service, odds_service)
            if digest:
                import json
                await db.digest_log.update_one(
                    {"user_id": user_id, "day": today},
                    {"$set": {"user_id": user_id, "day": today, "data": json.dumps(digest)}},
                    upsert=True,
                )
                logger.info("Digest built for user %s on %s", user_id, today)
        except Exception as exc:
            logger.exception("Digest failed for user %s: %s", user_id, exc)


def start_digest_scheduler(db, data_service, odds_service):
    async def _loop():
        while True:
            now = datetime.now(timezone.utc)
            next_run = now.replace(hour=DIGEST_HOUR_UTC, minute=0, second=0, microsecond=0)
            if now >= next_run:
                next_run += timedelta(days=1)
            wait_secs = (next_run - now).total_seconds()
            logger.info("Digest scheduler: next run in %.0f seconds", wait_secs)
            await asyncio.sleep(wait_secs)
            await _run_daily_digest(db, data_service, odds_service)

    asyncio.create_task(_loop())
