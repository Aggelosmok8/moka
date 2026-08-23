import os
"""
Async database layer with a MongoDB-like interface.

Backend is chosen at runtime:
  * DATABASE_URL starts with "postgres" -> PostgreSQL (asyncpg pool). Use this on
    Render/Supabase for persistent storage.
  * otherwise -> SQLite (aiosqlite, file at DB_PATH). Local/dev default.

The rest of the codebase only touches `db.<collection>.find_one/find/insert_one/
update_one/delete_one/delete_many`, so switching backends changes nothing else.
"""
import json
import logging
import aiosqlite
from pathlib import Path
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Load .env here too — this module is imported before server.py calls load_dotenv(),
# so DATABASE_URL must be read after we ensure the .env is loaded.
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USE_PG = DATABASE_URL.startswith("postgres")

DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent / "moka.db")))

# asyncpg pool (Postgres only) — created once in init_db().
_pg_pool = None


# ── DDL ─────────────────────────────────────────────────────────────────────

_SQLITE_SCHEMA = """
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
        email TEXT,
        package_id TEXT,
        amount REAL,
        currency TEXT,
        metadata TEXT,
        status TEXT,
        payment_status TEXT,
        mode TEXT,
        created_at TEXT,
        updated_at TEXT
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
"""

_PG_SCHEMA = """
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
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payment_transactions (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        email TEXT,
        package_id TEXT,
        amount DOUBLE PRECISION,
        currency TEXT,
        metadata TEXT,
        status TEXT,
        payment_status TEXT,
        mode TEXT,
        stripe_subscription_id TEXT,
        created_at TEXT,
        updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS goal_alert_subs (
        id BIGSERIAL PRIMARY KEY,
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
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        match_id TEXT NOT NULL,
        day TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        created_at TEXT,
        UNIQUE(user_id, match_id, day)
    );
    CREATE TABLE IF NOT EXISTS events (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        properties TEXT DEFAULT '{}',
        user_id TEXT,
        is_pro INTEGER DEFAULT 0,
        ua TEXT DEFAULT '',
        ip TEXT,
        ts TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS digest_log (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        day TEXT NOT NULL,
        data TEXT,
        UNIQUE(user_id, day)
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_events_user_ts ON events(user_id, ts);
    CREATE INDEX IF NOT EXISTS idx_analysis_usage ON analysis_usage(user_id, match_id, day);
"""


async def _pg_get_pool():
    global _pg_pool
    if _pg_pool is None:
        import ssl as _ssl
        import asyncpg
        from urllib.parse import urlparse, unquote
        p = urlparse(DATABASE_URL)
        host_is_local = p.hostname in ("localhost", "127.0.0.1")
        if host_is_local:
            ssl_ctx = False
        else:
            # Encrypt the connection but skip strict CA verification — the Supabase
            # pooler cert chain isn't always in the default bundle.
            ssl_ctx = _ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = _ssl.CERT_NONE
        _pg_pool = await asyncpg.create_pool(
            host=p.hostname,
            port=p.port or 5432,
            user=unquote(p.username) if p.username else None,
            password=unquote(p.password) if p.password else None,
            database=(p.path.lstrip("/") or "postgres"),
            ssl=ssl_ctx,
            min_size=1,
            max_size=5,
            command_timeout=30,
        )
    return _pg_pool


async def init_db():
    """Create all tables on startup."""
    if USE_PG:
        pool = await _pg_get_pool()
        async with pool.acquire() as conn:
            await conn.execute(_PG_SCHEMA)
            # Idempotent additive migrations for pre-existing Supabase tables
            # (CREATE TABLE IF NOT EXISTS won't add columns to an existing table).
            for col in ("trial_start_date", "trial_end_date", "plan", "emails_sent"):
                await conn.execute(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} TEXT")
            for col in ("email", "package_id", "metadata", "payment_status", "mode",
                        "updated_at", "stripe_subscription_id"):
                await conn.execute(f"ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS {col} TEXT")
        logger.info("Postgres DB initialized (Supabase/Render).")
    else:
        async with aiosqlite.connect(DB_PATH) as conn:
            await conn.executescript(_SQLITE_SCHEMA)
            await conn.commit()
            for col in ("trial_start_date", "trial_end_date", "plan", "emails_sent"):
                try:
                    await conn.execute(f"ALTER TABLE users ADD COLUMN {col} TEXT")
                    await conn.commit()
                except Exception:
                    pass
            for col in ("email", "package_id", "metadata", "payment_status", "mode", "updated_at"):
                try:
                    await conn.execute(f"ALTER TABLE payment_transactions ADD COLUMN {col} TEXT")
                    await conn.commit()
                except Exception:
                    pass
        logger.info("SQLite DB initialized at %s", DB_PATH)


# ── Collection interface ──────────────────────────────────────────────────────

class Collection:
    """MongoDB-like async collection backed by SQLite or Postgres."""

    def __init__(self, table: str):
        self.table = table

    # -- reads -------------------------------------------------------------
    async def find_one(self, query: dict, projection: dict = None) -> Optional[dict]:
        where, params = _build_where(query)
        sql = f"SELECT * FROM {self.table}"
        if where:
            sql += f" WHERE {where}"
        sql += " LIMIT 1"
        row = await _fetchrow(sql, params)
        return _deserialize(row, self.table) if row else None

    async def find(self, query: dict = None, projection: dict = None):
        return AsyncCursor(self.table, query or {})

    # -- writes ------------------------------------------------------------
    async def insert_one(self, doc: dict):
        row = _serialize(doc, self.table)
        cols = ", ".join(row.keys())
        placeholders = ", ".join(_ph(i + 1) for i in range(len(row)))
        if USE_PG:
            sql = f"INSERT INTO {self.table} ({cols}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
        else:
            sql = f"INSERT OR IGNORE INTO {self.table} ({cols}) VALUES ({placeholders})"
        await _execute(sql, list(row.values()))

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
            sets = ", ".join(f"{k} = {_ph(i + 1)}" for i, k in enumerate(row.keys()))
            where, params = _build_where(query, start=len(row) + 1)
            sql = f"UPDATE {self.table} SET {sets}"
            if where:
                sql += f" WHERE {where}"
            await _execute(sql, list(row.values()) + params)

        if inc_data:
            for field, val in inc_data.items():
                await self._increment(query, field, val)

    async def _increment(self, query: dict, field: str, val: int):
        where, params = _build_where(query, start=2)
        sql = f"UPDATE {self.table} SET {field} = COALESCE({field}, 0) + {_ph(1)}"
        if where:
            sql += f" WHERE {where}"
        await _execute(sql, [val] + params)

    async def delete_one(self, query: dict):
        where, params = _build_where(query)
        if USE_PG:
            inner = f"SELECT ctid FROM {self.table}"
            if where:
                inner += f" WHERE {where}"
            inner += " LIMIT 1"
            sql = f"DELETE FROM {self.table} WHERE ctid IN ({inner})"
        else:
            sql = f"DELETE FROM {self.table}"
            if where:
                sql += f" WHERE {where}"
            sql += " LIMIT 1"
        await _execute(sql, params)

    async def delete_many(self, query: dict):
        where, params = _build_where(query)
        sql = f"DELETE FROM {self.table}"
        if where:
            sql += f" WHERE {where}"
        count = await _execute(sql, params)
        return type("Result", (), {"deleted_count": count})()


class AsyncCursor:
    def __init__(self, table: str, query: dict):
        self.table = table
        self.query = query
        self._sort_field = None
        self._sort_dir = "ASC"
        self._limit_val = None

    def sort(self, field: str, direction: int):
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
            sql += f" LIMIT {int(self._limit_val)}"
        rows = await _fetchall(sql, params)
        for row in rows:
            yield _deserialize(row, self.table)


class Database:
    """Access collections as attributes: db.users, db.events, etc."""

    def __getattr__(self, name: str) -> Collection:
        return Collection(name)

    def __getitem__(self, name: str) -> Collection:
        return Collection(name)


# ── Backend-agnostic execution helpers ────────────────────────────────────────

def _ph(i: int) -> str:
    """Placeholder for parameter index i (1-based). '?' for SQLite, '$i' for PG."""
    return f"${i}" if USE_PG else "?"


async def _fetchrow(sql: str, params: list) -> Optional[dict]:
    if USE_PG:
        pool = await _pg_get_pool()
        async with pool.acquire() as conn:
            rec = await conn.fetchrow(sql, *params)
            return dict(rec) if rec is not None else None
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute(sql, params) as cur:
            row = await cur.fetchone()
            return dict(row) if row is not None else None


async def _fetchall(sql: str, params: list) -> list:
    if USE_PG:
        pool = await _pg_get_pool()
        async with pool.acquire() as conn:
            recs = await conn.fetch(sql, *params)
            return [dict(r) for r in recs]
    async with aiosqlite.connect(DB_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        async with conn.execute(sql, params) as cur:
            rows = await cur.fetchall()
            return [dict(r) for r in rows]


async def _execute(sql: str, params: list) -> int:
    """Run a write. Returns affected row count."""
    if USE_PG:
        pool = await _pg_get_pool()
        async with pool.acquire() as conn:
            status = await conn.execute(sql, *params)
            # status is like "UPDATE 3" / "DELETE 1" / "INSERT 0 1"
            try:
                return int(status.split()[-1])
            except (ValueError, IndexError, AttributeError):
                return 0
    async with aiosqlite.connect(DB_PATH) as conn:
        cur = await conn.execute(sql, params)
        await conn.commit()
        return cur.rowcount


# ── Serialization helpers ──────────────────────────────────────────────────────

def _serialize(doc: dict, table: str) -> dict:
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
    result = {}
    for k, v in row.items():
        if v is None:
            result[k] = v
        elif isinstance(v, str):
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


def _build_where(query: dict, start: int = 1):
    """Build a WHERE clause from a simple MongoDB-like query dict.

    `start` is the 1-based index of the first placeholder (so UPDATE can put SET
    params first). Returns (where_sql, params).
    """
    parts = []
    params = []
    i = start
    for key, value in query.items():
        if key == "_id":
            continue
        if isinstance(value, dict):
            for op, operand in value.items():
                if op == "$regex":
                    if operand.startswith("^"):
                        like = operand[1:].replace(".*", "%") + "%"
                    else:
                        like = f"%{operand}%"
                    parts.append(f"{key} LIKE {_ph(i)}")
                    params.append(like)
                    i += 1
                elif op == "$in":
                    phs = ",".join(_ph(i + j) for j in range(len(operand)))
                    parts.append(f"{key} IN ({phs})")
                    params.extend(operand)
                    i += len(operand)
                elif op == "$gt":
                    parts.append(f"{key} > {_ph(i)}")
                    params.append(operand)
                    i += 1
                elif op == "$gte":
                    parts.append(f"{key} >= {_ph(i)}")
                    params.append(operand)
                    i += 1
        else:
            parts.append(f"{key} = {_ph(i)}")
            params.append(value)
            i += 1
    return " AND ".join(parts), params
