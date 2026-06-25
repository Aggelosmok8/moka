"""SQLAlchemy persistence package.

Layout:
  base.py          -> DeclarativeBase, async engine/session, DB URLs
  models.py        -> User, Subscription, PaymentHistory ORM models
  repositories.py  -> repository layer (CRUD + role-system integration)

Migrations live in ../alembic (Alembic). Runtime is async (sqlite+aiosqlite);
Alembic runs sync against the same SQLite file. No Stripe — `provider` columns
stay generic so a real provider plugs in later.
"""
from .base import (
    Base, engine, SessionLocal, get_session, init_models,
    ASYNC_DATABASE_URL, SYNC_DATABASE_URL,
)
from .models import User, Subscription, PaymentHistory
from .repositories import (
    UserRepository, SubscriptionRepository, PaymentHistoryRepository,
    role_from_orm_user,
)

__all__ = [
    "Base", "engine", "SessionLocal", "get_session", "init_models",
    "ASYNC_DATABASE_URL", "SYNC_DATABASE_URL",
    "User", "Subscription", "PaymentHistory",
    "UserRepository", "SubscriptionRepository", "PaymentHistoryRepository",
    "role_from_orm_user",
]
