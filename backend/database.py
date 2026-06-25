import os
"""
SQLite async database layer.
Provides a MongoDB-like interface so the rest of the code changes minimally.
Uses aiosqlite for async SQLite access.
"""
import json
import uuid
import logging
import aiosqlite
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Any

logger = logging.getLogger(__name__)

DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent / "moka.db")))


async def get_connection():
    conn = await aiosqlite.connect(DB_PATH)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA journal_mode=WAL")
    await conn.execute("PRAGMA foreign_keys=ON")
    return conn


async def init_db():
    """Create all tables on startup."""
    async with aiosqlite.connect(DB_PATH) as conn:
        await conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT DEFAULT '',
                picture TEXT,
                pro_until TEXT,
                subscription_status TEXT,
                stripe_subscription_id TEXT,
                stripe_customer_id TEXT,
                subscription_cancel_at_period_end INTEGER DEFAULT 0,
                subscription_updated_at TEXT,
                created_at TEXT,
                last_login_at TEXT,
                trial_start_date TEXT,
                trial_end_date TEXT,
                plan TEXT,
                emails_sent TEXT
            );

            CREATE TABLE IF NOT EXISTS user_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                session_token TEXT UNIQUE NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS payment_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                user_id TEXT NOT NULL,
                amount REAL,
                currency TEXT,
                status TEXT,
                created_at TEXT
            );

            CREATE TABLE IF NOT EXISTS goal_alert_subs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                team_id TEXT NOT NULL,
                created_at TEXT,
                UNIQUE(user_id, team_id)
            );

            CREATE TABLE IF NOT EXISTS match_analyses (
                match_id TEXT PRIMARY KEY,
                analysis TEXT,
                structured TEXT,
                created_at TEXT,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS analysis_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                match_id TEXT NOT NULL,
                day TEXT NOT NULL,
                count INTEGER DEFAULT 0,
                created_at TEXT,
                UNIQUE(user_id, match_id, day)
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                properties TEXT DEFAULT '{}',
                user_id TEXT,
                is_pro INTEGER DEFAULT 0,
                ua TEXT DEFAULT '',
                ip TEXT,
                ts TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS digest_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                day TEXT NOT NULL,
                data TEXT,
                UNIQUE(user_id, day)
            );

            CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
            CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_events_user_ts ON events(user_id, ts);
            CREATE INDEX IF NOT EXISTS idx_analysis_usage ON analysis_usage(user_id, match_id, day);
        """)
        await conn.commit()
        # Idempotent migration for pre-existing DBs (adds trial columns if missing)
        for col in ("trial_start_date", "trial_end_date", "plan", "emails_sent"):
            try:
                await conn.execute(f"ALTER TABLE users ADD COLUMN {col} TEXT")
                await conn.commit()
            except Exception:
                pass
    logger.info("SQLite DB initialized at %s", DB_PATH)


class Collection:
    """MongoDB-like async collection backed by a SQLite table."""

    def __init__(self, table: str):
        self.table = table

    async def find_one(self, query: dict, projection: dict = None) -> Optional[dict]:
        where, params = _build_where(query)
        sql = f"SELECT * FROM {self.table}"
        if where:
            sql += f" WHERE {where}"
        sql += " LIMIT 1"
        async with aiosqlite.connect(DB_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            async with conn.execute(sql, params) as cur:
                row = await cur.fetchone()
                if row is None:
                    return None
                return _deserialize(dict(row), self.table)

    async def find(self, query: dict = None, projection: dict = None):
        return AsyncCursor(self.table, query or {})

    async def insert_one(self, doc: dict):
        row = _serialize(doc, self.table)
        cols = ", ".join(row.keys())
        placeholders = ", ".join("?" * len(row))
        sql = f"INSERT OR IGNORE INTO {self.table} ({cols}) VALUES ({placeholders})"
        async with aiosqlite.connect(DB_PATH) as conn:
            await conn.execute(sql, list(row.values()))
            await conn.commit()

    async def update_one(self, query: dict, update: dict, upsert: bool = False):
        set_data = update.get("$set", {})
        inc_data = update.get("$inc", {})
        set_on_insert = update.get("$setOnInsert", {})

        existing = await self.find_one(query)

        if existing is None and upsert:
            new_doc = {**query, **set_data, **set_on_insert}
            await self.insert_one(new_doc)
            if inc_data:
                for field, val in inc_data.items():
                    await self._increment(query, field, val)
            return

        if existing is None:
            return

        if set_data:
            row = _serialize(set_data, self.table)
            sets = ", ".join(f"{k} = ?" for k in row.keys())
            where, params = _build_where(query)
            sql = f"UPDATE {self.table} SET {sets} WHERE {where}"
            async with aiosqlite.connect(DB_PATH) as conn:
                await conn.execute(sql, list(row.values()) + params)
                await conn.commit()

        if inc_data:
            for field, val in inc_data.items():
                await self._increment(query, field, val)

    async def _increment(self, query: dict, field: str, val: int):
        where, params = _build_where(query)
        sql = f"UPDATE {self.table} SET {field} = COALESCE({field}, 0) + ? WHERE {where}"
        async with aiosqlite.connect(DB_PATH) as conn:
            await conn.execute(sql, [val] + params)
            await conn.commit()

    async def delete_one(self, query: dict):
        where, params = _build_where(query)
        sql = f"DELETE FROM {self.table} WHERE {where} LIMIT 1"
        async with aiosqlite.connect(DB_PATH) as conn:
            await conn.execute(sql, params)
            await conn.commit()

    async def delete_many(self, query: dict):
        where, params = _build_where(query)
        if where:
            sql = f"DELETE FROM {self.table} WHERE {where}"
        else:
            sql = f"DELETE FROM {self.table}"
        async with aiosqlite.connect(DB_PATH) as conn:
            cur = await conn.execute(sql, params)
            await conn.commit()
            return type("Result", (), {"deleted_count": cur.rowcount})()


class AsyncCursor:
    def __init__(self, table: str, query: dict):
        self.table = table
        self.query = query
        self._sort_field = None
        self._sort_dir = "ASC"
        self._limit_val = None

    def sort(self, field: str, direction: int):
        self.table = self.table
        self._sort_field = field
        self._sort_dir = "DESC" if direction == -1 else "ASC"
        return self

    def limit(self, n: int):
        self._limit_val = n
        return self

    def __aiter__(self):
        return self._iterate()

    async def _iterate(self):
        where, params = _build_where(self.query)
        sql = f"SELECT * FROM {self.table}"
        if where:
            sql += f" WHERE {where}"
        if self._sort_field:
            sql += f" ORDER BY {self._sort_field} {self._sort_dir}"
        if self._limit_val:
            sql += f" LIMIT {self._limit_val}"
        async with aiosqlite.connect(DB_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            async with conn.execute(sql, params) as cur:
                async for row in cur:
                    yield _deserialize(dict(row), self.table)


class Database:
    """MongoDB-like db object. Access collections as attributes: db.users, db.events, etc."""

    def __getattr__(self, name: str) -> Collection:
        return Collection(name)

    def __getitem__(self, name: str) -> Collection:
        return Collection(name)


# ── Serialization helpers ──────────────────────────────────────────────────────

def _serialize(doc: dict, table: str) -> dict:
    """Convert Python dict to SQLite-compatible row."""
    row = {}
    for k, v in doc.items():
        if k == "_id":
            continue
        if isinstance(v, bool):
            row[k] = int(v)
        elif isinstance(v, (dict, list)):
            row[k] = json.dumps(v)
        elif isinstance(v, datetime):
            row[k] = v.isoformat()
        else:
            row[k] = v
    return row


def _deserialize(row: dict, table: str) -> dict:
    """Convert SQLite row back to Python dict with proper types."""
    result = {}
    for k, v in row.items():
        if v is None:
            result[k] = v
        elif isinstance(v, str):
            # Try to parse JSON fields
            if v.startswith(("{", "[")):
                try:
                    result[k] = json.loads(v)
                    continue
                except Exception:
                    pass
            result[k] = v
        elif isinstance(v, int) and k in ("is_pro", "subscription_cancel_at_period_end"):
            result[k] = bool(v)
        else:
            result[k] = v
    return result


def _build_where(query: dict):
    """Build a WHERE clause from a simple MongoDB-like query dict."""
    parts = []
    params = []
    for key, value in query.items():
        if key == "_id":
            continue
        if isinstance(value, dict):
            # Handle operators like {"$regex": "^standings:"}
            for op, operand in value.items():
                if op == "$regex":
                    # Convert ^ anchored regex to LIKE
                    if operand.startswith("^"):
                        parts.append(f"{key} LIKE ?")
                        params.append(operand[1:].replace(".*", "%").replace(".*", "%") + "%")
                    else:
                        parts.append(f"{key} LIKE ?")
                        params.append(f"%{operand}%")
                elif op == "$in":
                    placeholders = ",".join("?" * len(operand))
                    parts.append(f"{key} IN ({placeholders})")
                    params.extend(operand)
                elif op == "$gt":
                    parts.append(f"{key} > ?")
                    params.append(operand)
                elif op == "$gte":
                    parts.append(f"{key} >= ?")
                    params.append(operand)
        else:
            parts.append(f"{key} = ?")
            params.append(value)
    where = " AND ".join(parts)
    return where, params
