"""MongoDB connection + lightweight cache layer.

This is the local primary store. A Supabase REST adapter (services/supabase_service.py)
mirrors these operations and becomes the primary store once SUPABASE_ANON_KEY is injected.
"""
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def cache_get(key: str, ttl_seconds: int):
    """Return cached payload if present and fresh, else None."""
    doc = await db.api_cache.find_one({"_id": key})
    if not doc:
        return None
    cached_at = doc.get("cached_at")
    if isinstance(cached_at, str):
        cached_at = datetime.fromisoformat(cached_at)
    age = (now_utc() - cached_at).total_seconds()
    if age > ttl_seconds:
        return None
    return doc.get("data")


async def cache_set(key: str, data):
    await db.api_cache.update_one(
        {"_id": key},
        {"$set": {"data": data, "cached_at": now_utc().isoformat()}},
        upsert=True,
    )


async def cached_fetch(key: str, ttl_seconds: int, fetch_fn):
    """Generic cache-aside helper. fetch_fn is a no-arg sync callable."""
    import asyncio

    cached = await cache_get(key, ttl_seconds)
    if cached is not None:
        return cached
    data = await asyncio.to_thread(fetch_fn)
    if data is not None:
        await cache_set(key, data)
    return data
