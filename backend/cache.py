import os
"""Thin SQLite-backed JSON cache with TTL."""
import logging
import json
import aiosqlite
from datetime import datetime, timezone, timedelta
from typing import Any, Callable, Awaitable, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent / "moka.db")))


class TTLCache:
    """Single-table cache keyed by string. Values are JSON-serializable dicts."""

    def __init__(self, db, collection: str = "api_cache"):
        self.table = collection

    async def ensure_indexes(self):
        """Create the cache table if it doesn't exist (replaces MongoDB create_index)."""
        async with aiosqlite.connect(DB_PATH) as conn:
            await conn.execute(f"""
                CREATE TABLE IF NOT EXISTS {self.table} (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    expires_at TEXT,
                    updated_at TEXT
                )
            """)
            await conn.commit()

    async def get(self, key: str) -> Optional[dict]:
        async with aiosqlite.connect(DB_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            async with conn.execute(
                f"SELECT value, expires_at FROM {self.table} WHERE key = ?", (key,)
            ) as cur:
                row = await cur.fetchone()
                if not row:
                    return None
                expires_at = row["expires_at"]
                if expires_at:
                    exp = datetime.fromisoformat(expires_at)
                    if exp.tzinfo is None:
                        exp = exp.replace(tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) > exp:
                        return None
                return json.loads(row["value"])

    async def set(self, key: str, value: Any, ttl_seconds: int):
        exp = (datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)).isoformat()
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(DB_PATH) as conn:
            await conn.execute(
                f"""INSERT INTO {self.table} (key, value, expires_at, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                        value=excluded.value,
                        expires_at=excluded.expires_at,
                        updated_at=excluded.updated_at""",
                (key, json.dumps(value), exp, now),
            )
            await conn.commit()

    async def get_stale(self, key: str) -> Optional[dict]:
        """Return cached value ignoring TTL (last-resort fallback)."""
        async with aiosqlite.connect(DB_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            async with conn.execute(
                f"SELECT value FROM {self.table} WHERE key = ?", (key,)
            ) as cur:
                row = await cur.fetchone()
                return json.loads(row["value"]) if row else None

    async def get_meta(self, key: str) -> Optional[dict]:
        async with aiosqlite.connect(DB_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            async with conn.execute(
                f"SELECT expires_at, updated_at FROM {self.table} WHERE key = ?", (key,)
            ) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def get_or_fetch(
        self,
        key: str,
        fetcher: Callable[[], Awaitable[Any]],
        ttl_seconds: int,
        fallback: Optional[Callable[[], Any]] = None,
    ) -> tuple[Any, str]:
        """Returns (value, source) where source in {'cache','live','stale','fallback'}."""
        cached = await self.get(key)
        if cached is not None:
            return cached, "cache"
        try:
            fresh = await fetcher()
            await self.set(key, fresh, ttl_seconds)
            return fresh, "live"
        except Exception as exc:
            logger.warning("Cache miss + fetch failed for %s: %s", key, exc)
            stale = await self.get_stale(key)
            if stale is not None:
                return stale, "stale"
            if fallback is not None:
                return fallback(), "fallback"
            raise
