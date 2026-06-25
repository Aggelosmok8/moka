"""Repository layer.

Thin, testable data-access objects over an AsyncSession. Routes/services depend
on these instead of touching the ORM directly, so the storage engine can change
behind them. Integrated with the role system via core.roles.Role.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Sequence, Union

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.roles import Role
from .models import PaymentHistory, Subscription, User

RoleLike = Union[Role, str]


def _role_value(role: RoleLike) -> str:
    return role.value if isinstance(role, Role) else str(role)


def role_from_orm_user(user: Optional[User]) -> Role:
    """Bridge to the existing role system — mirrors core.roles.role_from_user
    but uses the persisted `role`/`is_pro` columns."""
    if user is None:
        return Role.FREE
    return user.as_role()


class _BaseRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session


class UserRepository(_BaseRepository):
    async def create(self, *, email: str, password_hash: Optional[str] = None,
                     role: RoleLike = Role.FREE, is_pro: bool = False) -> User:
        user = User(
            email=email,
            password_hash=password_hash,
            role=_role_value(role),
            is_pro=is_pro,
        )
        self.session.add(user)
        await self.session.flush()
        return user

    async def get_by_id(self, user_id: str) -> Optional[User]:
        return await self.session.get(User, user_id)

    async def get_by_email(self, email: str) -> Optional[User]:
        res = await self.session.execute(select(User).where(User.email == email))
        return res.scalar_one_or_none()

    async def upsert_by_email(self, email: str, **fields) -> User:
        user = await self.get_by_email(email)
        if user is None:
            return await self.create(email=email, **fields)
        for key, value in fields.items():
            if key == "role":
                value = _role_value(value)
            setattr(user, key, value)
        await self.session.flush()
        return user

    async def set_role(self, user_id: str, role: Role) -> Optional[User]:
        """Update role and keep is_pro consistent with the role system."""
        user = await self.get_by_id(user_id)
        if user is None:
            return None
        user.role = role.value
        user.is_pro = role is Role.PRO
        await self.session.flush()
        return user

    async def list(self, limit: int = 100) -> Sequence[User]:
        res = await self.session.execute(select(User).limit(limit))
        return res.scalars().all()


class SubscriptionRepository(_BaseRepository):
    async def create(self, *, user_id: str, provider: str = "placeholder",
                     status: str = "inactive", provider_customer_id: Optional[str] = None,
                     provider_subscription_id: Optional[str] = None,
                     started_at: Optional[datetime] = None,
                     expires_at: Optional[datetime] = None) -> Subscription:
        sub = Subscription(
            user_id=user_id, provider=provider, status=status,
            provider_customer_id=provider_customer_id,
            provider_subscription_id=provider_subscription_id,
            started_at=started_at, expires_at=expires_at,
        )
        self.session.add(sub)
        await self.session.flush()
        return sub

    async def get_by_id(self, sub_id: str) -> Optional[Subscription]:
        return await self.session.get(Subscription, sub_id)

    async def get_by_provider_subscription_id(self, provider_subscription_id: str) -> Optional[Subscription]:
        res = await self.session.execute(
            select(Subscription).where(
                Subscription.provider_subscription_id == provider_subscription_id
            )
        )
        return res.scalar_one_or_none()

    async def latest_for_user(self, user_id: str) -> Optional[Subscription]:
        res = await self.session.execute(
            select(Subscription)
            .where(Subscription.user_id == user_id)
            .order_by(Subscription.started_at.desc().nullslast())
        )
        return res.scalars().first()

    async def active_for_user(self, user_id: str) -> Optional[Subscription]:
        res = await self.session.execute(
            select(Subscription).where(
                Subscription.user_id == user_id, Subscription.status == "active"
            )
        )
        return res.scalars().first()

    async def set_status(self, sub_id: str, status: str) -> Optional[Subscription]:
        sub = await self.get_by_id(sub_id)
        if sub is None:
            return None
        sub.status = status
        await self.session.flush()
        return sub


class PaymentHistoryRepository(_BaseRepository):
    async def create(self, *, user_id: str, amount: float, currency: str = "usd",
                     provider: str = "placeholder", provider_payment_id: Optional[str] = None,
                     status: str = "pending") -> PaymentHistory:
        payment = PaymentHistory(
            user_id=user_id, amount=amount, currency=currency, provider=provider,
            provider_payment_id=provider_payment_id, status=status,
            created_at=datetime.now(timezone.utc),
        )
        self.session.add(payment)
        await self.session.flush()
        return payment

    async def list_for_user(self, user_id: str, limit: int = 100) -> Sequence[PaymentHistory]:
        res = await self.session.execute(
            select(PaymentHistory)
            .where(PaymentHistory.user_id == user_id)
            .order_by(PaymentHistory.created_at.desc())
            .limit(limit)
        )
        return res.scalars().all()

    async def get_by_provider_payment_id(self, provider_payment_id: str) -> Optional[PaymentHistory]:
        res = await self.session.execute(
            select(PaymentHistory).where(
                PaymentHistory.provider_payment_id == provider_payment_id
            )
        )
        return res.scalar_one_or_none()
