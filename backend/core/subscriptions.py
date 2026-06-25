"""Subscription abstraction layer.

`SubscriptionProvider` is the billing interface. `PlaceholderSubscriptionProvider`
keeps everything in memory and honours the existing auth `is_pro` flag, so the
architecture is consistent with current Pro status WITHOUT Stripe. A real
`StripeSubscriptionProvider` plugs in later behind the same interface.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, Optional

from .roles import Role


@dataclass(frozen=True)
class Subscription:
    user_id: str
    role: Role
    status: str                       # active | inactive | trialing
    renews_at: Optional[str] = None
    provider: str = "placeholder"


class SubscriptionProvider(ABC):
    name: str = "abstract"

    @abstractmethod
    def get_subscription(self, user_id: str, *, is_pro_hint: bool = False) -> Subscription: ...

    def is_pro(self, user_id: str, *, is_pro_hint: bool = False) -> bool:
        return self.get_subscription(user_id, is_pro_hint=is_pro_hint).role is Role.PRO


class PlaceholderSubscriptionProvider(SubscriptionProvider):
    """In-memory. `is_pro_hint` comes from the current DB-backed auth user;
    `set_role` allows forcing PRO in tests without any payment provider."""

    name = "placeholder"

    def __init__(self) -> None:
        self._overrides: Dict[str, Role] = {}

    def set_role(self, user_id: str, role: Role) -> None:
        self._overrides[user_id] = role

    def clear_override(self, user_id: str) -> None:
        self._overrides.pop(user_id, None)

    def get_subscription(self, user_id, *, is_pro_hint=False):
        role = self._overrides.get(user_id) or (Role.PRO if is_pro_hint else Role.FREE)
        return Subscription(
            user_id=user_id or "anonymous",
            role=role,
            status="active" if role is Role.PRO else "inactive",
        )


_default_subscriptions = PlaceholderSubscriptionProvider()


def get_subscription_provider() -> SubscriptionProvider:
    """Return the active subscription provider (single swap point)."""
    return _default_subscriptions
