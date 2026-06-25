"""User role model.

Transport/DB-agnostic representation of the caller, so the access-control layer
never depends on the concrete auth or persistence implementation.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class Role(str, Enum):
    FREE = "free"
    PRO = "pro"


@dataclass(frozen=True)
class UserContext:
    """Everything the access layer needs to make a decision about a request."""
    user_id: Optional[str]
    role: Role
    authenticated: bool

    @property
    def is_pro(self) -> bool:
        return self.role is Role.PRO


def role_from_user(user) -> Role:
    """Map the existing auth `User` (or None) to a Role.

    `user` is whatever auth.current_user_optional returns — duck-typed on `.is_pro`
    so this module stays decoupled from the auth package.
    """
    if user is not None and getattr(user, "is_pro", False):
        return Role.PRO
    return Role.FREE


def context_from_user(user) -> UserContext:
    return UserContext(
        user_id=getattr(user, "user_id", None) if user else None,
        role=role_from_user(user),
        authenticated=user is not None,
    )
