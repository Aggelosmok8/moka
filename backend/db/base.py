"""Engine, session factory and declarative base.

Runtime uses an async engine (sqlite+aiosqlite). Alembic uses the derived sync
URL. Override with the DATABASE_URL env var to point at Postgres/MySQL later —
no model or repository change required.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

ROOT_DIR = Path(__file__).resolve().parent.parent  # backend/
DB_PATH = os.environ.get("ORM_DB_PATH", str(ROOT_DIR / "moka_orm.db"))

# Async URL for the app; sync URL (same file) for Alembic migrations.
ASYNC_DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite+aiosqlite:///{DB_PATH}")
SYNC_DATABASE_URL = ASYNC_DATABASE_URL.replace("+aiosqlite", "").replace("+asyncpg", "")


class Base(DeclarativeBase):
    """Declarative base — single source of metadata for models + migrations."""


engine = create_async_engine(ASYNC_DATABASE_URL, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Async session context manager (commits on success, rolls back on error)."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_models() -> None:
    """Create tables directly from metadata.

    Convenience for tests/local bootstrap only — production schema is owned by
    Alembic migrations.
    """
    from . import models  # noqa: F401  ensure models register on Base.metadata
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
